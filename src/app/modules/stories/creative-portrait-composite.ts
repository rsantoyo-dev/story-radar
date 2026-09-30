import sharp from "sharp";

function escapeSvgText(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

/**
 * A documentary portrait inside an AI-designed slide (real people). The image
 * model designs the branded slide around a reserved, empty zone and never sees
 * the photograph; afterwards the untouched photo is pasted into that zone as a
 * printed photo (white border, credit line, slight tilt, soft shadow). Only
 * resizing is applied to the photo's pixels: no crop, redraw or retouch.
 */

/** Reserved zone on the 1080×1350 (4:5) canvas: the lower-right area. */
export const PORTRAIT_ZONE = { left: 430, top: 530, width: 610, height: 760 } as const;
const CANVAS = { width: 1080, height: 1350 } as const;
const BORDER = 16;
const CREDIT_HEIGHT = 44;
const TILT_DEGREES = -2;

/** Appended to the slide's image prompt. The photo itself is never an input. */
export const PORTRAIT_ZONE_PROMPT = `
<DOCUMENTARY_PHOTO_ZONE>
A real, unmodified documentary photograph will be pasted onto this slide AFTER generation, as a printed photo placed in the lower-right area: from 40% to 96% of the width and from 39% to 96% of the height.
- Keep that whole area visually quiet: only the slide's background paper and texture, with no text, no letters, no logos, no objects and no strong shapes. It will be covered.
- Place every piece of text (headline, supporting text) outside it: the headline across the top 37% of the slide, supporting text in the left column below it (left 38% of the width).
- Do not depict any person, face, portrait, silhouette, body, crowd or character anywhere on the slide. The only person on the slide will be the real photograph.
- Decorative collage elements from the visual direction may frame the reserved area from the edges, never inside it.
</DOCUMENTARY_PHOTO_ZONE>`;

/** One short, readable credit line from a stored provenance (URLs removed). */
export function portraitCreditLine(provenance: string): string {
  const text = provenance
    .replace(/\(https?:\/\/[^)]*\)/gu, "")
    .replace(/https?:\/\/\S+/gu, "")
    .split("·")
    .map((part) => part.replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .join(" · ");
  return text.length > 92 ? `${text.slice(0, 91).trimEnd()}…` : text;
}

export async function compositeDocumentaryPortrait({
  image,
  photo,
  provenance,
}: {
  image: Uint8Array;
  photo: Uint8Array;
  provenance: string;
}): Promise<Buffer> {
  const zone = PORTRAIT_ZONE;
  // Leave room for the tilt so the rotated print stays inside the zone.
  const maxWidth = zone.width - 2 * BORDER - 36;
  const maxHeight = zone.height - 2 * BORDER - CREDIT_HEIGHT - 36;
  const resized = await sharp(photo, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: maxWidth, height: maxHeight, fit: "inside" })
    .png()
    .toBuffer({ resolveWithObject: true });
  const photoWidth = resized.info.width;
  const photoHeight = resized.info.height;
  const printWidth = photoWidth + 2 * BORDER;
  const printHeight = photoHeight + 2 * BORDER + CREDIT_HEIGHT;
  const credit = escapeSvgText(portraitCreditLine(provenance));
  const creditSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${printWidth}" height="${CREDIT_HEIGHT}">` +
      `<text x="${BORDER}" y="${CREDIT_HEIGHT - 16}" font-family="Helvetica, Arial, sans-serif" font-size="17" fill="#4a4a4a">${credit}</text></svg>`,
  );
  const print = await sharp({ create: { width: printWidth, height: printHeight, channels: 4, background: "#fbfaf6" } })
    .composite([
      { input: resized.data, left: BORDER, top: BORDER },
      { input: creditSvg, left: 0, top: BORDER + photoHeight + BORDER - 6 },
    ])
    .png()
    .toBuffer();
  const tilted = await sharp(print).rotate(TILT_DEGREES, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer({ resolveWithObject: true });
  // Soft shadow: the tilted print's alpha, darkened and blurred, offset down-right.
  const shadow = await sharp(tilted.data)
    .ensureAlpha()
    .extractChannel("alpha")
    .toColourspace("b-w")
    .linear(0.35, 0)
    .blur(10)
    .toBuffer();
  const shadowRgba = await sharp({ create: { width: tilted.info.width, height: tilted.info.height, channels: 3, background: "#000000" } })
    .joinChannel(shadow)
    .png()
    .toBuffer();
  const left = Math.round(zone.left + (zone.width - tilted.info.width) / 2);
  const top = Math.round(zone.top + (zone.height - tilted.info.height) / 2);
  return sharp(image)
    .resize(CANVAS.width, CANVAS.height, { fit: "fill" })
    .composite([
      { input: shadowRgba, left: left + 8, top: top + 12 },
      { input: tilted.data, left, top },
    ])
    .png()
    .toBuffer();
}

/**
 * Credit for a slide the AI adapted from a licensed photo (CC BY / BY-SA
 * require attribution of the original). Written locally, never left to the
 * model, as a small label at the bottom-left.
 */
export function adaptationCreditLine(provenance: string): string {
  return `Adaptation IA · ${portraitCreditLine(provenance)}`.slice(0, 110);
}

export async function compositeAdaptationCredit({ image, credits }: { image: Uint8Array; credits: string[] }): Promise<Buffer> {
  // Vertical along the right edge, like a magazine photo credit, so it never
  // competes with the navigation badge or the logo at the bottom.
  const text = escapeSvgText(credits.slice(0, 2).join("  |  "));
  const length = Math.min(CANVAS.height - 120, 28 + Math.round(text.length * 6.6));
  const label = await sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${length}" height="30">` +
      `<rect width="${length}" height="30" rx="8" fill="#fbfaf6" fill-opacity="0.82"/>` +
      `<text x="12" y="20" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#3d3d3d">${text}</text></svg>`,
  )).rotate(270).png().toBuffer({ resolveWithObject: true });
  return sharp(image)
    .resize(CANVAS.width, CANVAS.height, { fit: "fill" })
    .composite([{ input: label.data, left: CANVAS.width - label.info.width - 8, top: Math.max(60, Math.round((CANVAS.height - label.info.height) / 2)) }])
    .png()
    .toBuffer();
}
