import "server-only";
import sharp, { type OverlayOptions } from "sharp";
import type { CreativeProfile } from "./creative-content.types";
import type { DocumentarySnapshot } from "./creative-documentary";

export function escapeDocumentaryText(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
/** Original fits inside a reserved rectangle; no crop, reconstruction or expansion. */
export async function renderDocumentary(snapshot: DocumentarySnapshot, profile: CreativeProfile, original?: Uint8Array): Promise<Buffer> {
  const primary = profile.brandPalette.find(c => /^#[0-9a-f]{6}$/i.test(c.color))?.color || "#246b4a";
  const layers: OverlayOptions[] = [];
  async function text(value: string, top: number, height: number, size: number, color = "#18392d") {
    const input = await sharp({ text: { text: `<span foreground="${color}">${escapeDocumentaryText(value)}</span>`, font: `sans ${size}`, width: 944, height, align: "left", rgba: true } }).png().toBuffer();
    layers.push({ input, left: 68, top });
  }
  await text(profile.name, 48, 50, 28, primary);
  await text(snapshot.story.title, 128, original ? 170 : 300, 56);
  if (original) {
    const image = await sharp(original, { limitInputPixels: 40_000_000 }).rotate().resize(1080, 640, { fit: "contain", background: "#f7faf8", withoutEnlargement: true }).png().toBuffer();
    layers.push({ input: image, top: 330, left: 0 });
    await text(snapshot.story.excerpt, 995, 125, 28);
  } else {
    await text(snapshot.story.excerpt || snapshot.reasons[0] || "", 490, 580, 38);
  }
  const fr = /^fr|french|français/i.test(profile.language);
  const context = snapshot.representation === "photo"
    ? `${fr ? "Photo d’archive · contexte, pas une preuve de l’événement" : "Archive photo · context, not evidence of the event"}\n${snapshot.photo?.attribution || ""} · ${snapshot.photo?.captureDate || (fr ? "Date inconnue" : "Date unknown")}\n${snapshot.photo?.licenseUrl || ""}\n${snapshot.photo?.creditUrl || snapshot.photo?.sourceUrl || ""}`
    : snapshot.representation === "map" ? `${fr ? "Localisation uniquement" : "Location only"} · ${snapshot.map?.attribution || "© OpenStreetMap contributors · openstreetmap.org/copyright"}`
    : snapshot.representation === "blocked" ? (fr ? "Brouillon bloqué · vérification requise" : "Blocked draft · review required")
    : (fr ? "Information · sans photographie vérifiable" : "Information · no verified photograph");
  await text(context, 1140, 118, 22);
  let host = "Source";
  try { host = new URL(snapshot.story.url).hostname; } catch { /* no invented URL */ }
  await text(`${host} · ${fr ? "Préparé le" : "Prepared"} ${snapshot.preparedAt.slice(0, 10)}`, 1270, 38, 22);
  return sharp({ create: { width: 1080, height: 1350, channels: 4, background: "#f7faf8" } }).composite(layers).png().toBuffer();
}
