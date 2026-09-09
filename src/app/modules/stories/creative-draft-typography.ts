import "server-only";
import sharp, { type OverlayOptions } from "sharp";
import type { CreativeUnit, CreativeProfile } from "./creative-content.types";
import { escapeDocumentaryText } from "./creative-documentary-render";

// Historical endpoint is preserved so old assets remain readable and regenerable.
export const DRAFT_TYPOGRAPHY_ENDPOINT = "local/draft-typography-v1";
/** Decorative editorial symbols, never a reconstruction of a street or building. */
function editorialGraphic(unit: CreativeUnit, color: string): Buffer {
  const text = [unit.headline, unit.body, unit.visualDirection].join(" ");
  const food = /récolt|potager|courget|fruit|légume|confiture|harvest|vegetable|cosecha/iu.test(text);
  const cooking = /cuisin|marmite|cook|cocina/iu.test(text);
  const tasting = /confiture|dégust|jam|tasting|mermelada/iu.test(text);
  const shapes = food ? tasting
    ? `<rect x="225" y="145" width="200" height="218" rx="35" fill="${color}"/><rect x="222" y="115" width="206" height="50" rx="12" fill="#d69a47"/><rect x="253" y="205" width="144" height="99" rx="14" fill="#f7faf8"/><path d="M283 265q38-90 78-20q-38 52-78 20" fill="#91b286"/><path d="M555 183Q655 25 755 183Z" fill="${color}"/><path d="M655 183V307q0 60-47 25" fill="none" stroke="${color}" stroke-width="13" stroke-linecap="round"/><path d="M552 64l-12 23M743 55l-12 23M791 229l-12 23" stroke="#91b286" stroke-width="10" stroke-linecap="round"/>`
    : cooking
    ? `<path d="M260 155H684V260Q684 360 580 360H364Q260 360 260 260Z" fill="${color}"/><path d="M245 170H210V245H258M699 170H734V245H686" fill="none" stroke="${color}" stroke-width="18"/><path d="M365 105q-35-35 0-65M470 105q-35-35 0-65M575 105q-35-35 0-65" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"/>`
    : `<path d="M238 207H706L658 366H286Z" fill="${color}"/><path d="M267 255H677M280 308H666M358 218L377 359M472 218V359M587 218L567 359" stroke="#f7faf8" stroke-width="8" opacity=".7"/><ellipse cx="372" cy="171" rx="92" ry="45" transform="rotate(-35 372 171)" fill="#91b286"/><circle cx="501" cy="157" r="59" fill="#d69a47"/><path d="M503 100q45-65 86-34q-25 55-86 34" fill="${color}"/><ellipse cx="603" cy="175" rx="35" ry="74" transform="rotate(30 603 175)" fill="#91b286"/>`
    : `<circle cx="472" cy="210" r="122" fill="${color}"/><circle cx="472" cy="145" r="14" fill="#f7faf8"/><path d="M472 190V280" stroke="#f7faf8" stroke-width="25" stroke-linecap="round"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="944" height="410"><rect width="944" height="410" rx="32" fill="#eaf1ed"/><circle cx="742" cy="96" r="46" fill="#d69a47" opacity=".28"/><circle cx="187" cy="290" r="62" fill="${color}" opacity=".08"/>${shapes}</svg>`);
}
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
  await add(unit.headline, 150, 210, 48);
  if (original) {
    const input = await sharp(original, { limitInputPixels: 40_000_000 }).rotate().resize(944, 460, { fit: "contain", background:"#f7faf8", withoutEnlargement:true }).png().toBuffer();
    layers.push({ input, left: 68, top: 390 });
  } else if (unit.assetRequest !== "typography-only") {
    layers.push({ input: editorialGraphic(unit, color), left: 68, top: 400 });
  }
  const graphic = original || unit.assetRequest !== "typography-only";
  await add([unit.subheadline, unit.body].filter(Boolean).join("\n\n"), graphic ? 910 : 490, graphic ? 150 : 390, 30);
  await add([unit.continuationCue, unit.ctaQuestion].filter(Boolean).join("\n"), graphic ? 1080 : 970, 110, 25,color);
  const evidence=unit.placeVisual;
  const french = /^(fr|french|français)/iu.test(profile.language);
  if (original && evidence?.locationAnchor) await add(french ? "Repère d’adresse · l’événement se tient à proximité" : "Address reference · event takes place nearby", 865, 35, 20, color);
  const context = evidence?.representation === "photo" ? "Archive · " : evidence?.representation === "map" ? "Localisation · " : unit.assetRequest !== "typography-only" ? (french ? "Illustration conceptuelle" : "Conceptual illustration") : "";
  const credit=evidence?.attribution || (original ? "© OpenStreetMap contributors · openstreetmap.org/copyright" : "");
  await add(context+credit,1240,24,16);
  return sharp({ create: { width: 1080, height: 1350, channels: 4, background: "#f7faf8" } }).composite(layers).png().toBuffer();
}
