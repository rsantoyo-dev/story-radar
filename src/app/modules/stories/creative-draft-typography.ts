import "server-only";
import sharp, { type OverlayOptions } from "sharp";
import type { CreativeUnit, CreativeProfile } from "./creative-content.types";
import { escapeDocumentaryText } from "./creative-documentary-render";

// Historical endpoint is preserved so old assets remain readable and regenerable.
export const DRAFT_TYPOGRAPHY_ENDPOINT = "local/draft-typography-v1";
export async function renderDraftTypography(unit: CreativeUnit, profile: CreativeProfile, original?: Buffer): Promise<Buffer> {
  const color = profile.brandPalette.find(c => /^#[0-9a-f]{6}$/i.test(c.color))?.color || "#246b4a";
  const layers: OverlayOptions[] = [];
  const background = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="1080" height="1350" fill="#f7faf8"/><rect width="16" height="1350" fill="${color}"/><rect x="68" y="119" width="944" height="3" fill="${color}"/><rect x="68" y="1210" width="944" height="2" fill="${color}"/></svg>`;
  layers.push({input:Buffer.from(background),left:0,top:0});
  const add = async (value: string, top: number, height: number, size: number, foreground = "#18392d") => {
    if (!value.trim()) return;
    const input = await sharp({ text: { text: `<span foreground="${foreground}">${escapeDocumentaryText(value)}</span>`, font: `sans ${size}`, width: 944, height, rgba: true } }).png().toBuffer();
    layers.push({ input, left: 68, top });
  };
  await add(profile.name, 48, 48, 26,color);
  await add(unit.headline, 150, original ? 210 : 270, 48);
  if (original) {
    const input = await sharp(original, { limitInputPixels: 40_000_000 }).rotate().resize(944, 460, { fit: "contain", background:"#f7faf8", withoutEnlargement:true }).png().toBuffer();
    layers.push({ input, left: 68, top: 390 });
  }
  await add([unit.subheadline, unit.body].filter(Boolean).join("\n\n"), original ? 880 : 490, original ? 160 : 390, 30);
  await add([unit.continuationCue, unit.ctaQuestion].filter(Boolean).join("\n"), original ? 1060 : 970, 120, 25,color);
  const evidence=unit.placeVisual;
  const context = evidence?.representation === "photo" ? "Archive · " : evidence?.representation === "map" ? "Localisation · " : "";
  const credit=evidence?.attribution || (original ? "© OpenStreetMap contributors · openstreetmap.org/copyright" : "");
  await add(context+credit,1230,90,16);
  return sharp({ create: { width: 1080, height: 1350, channels: 4, background: "#f7faf8" } }).composite(layers).png().toBuffer();
}
