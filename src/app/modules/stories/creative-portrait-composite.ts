import sharp from "sharp";

/**
 * A documentary portrait inside an AI-designed slide (real people). The image
 * model designs the branded slide around a reserved, empty zone and never sees
 * the photograph; afterwards the untouched photo is placed inside that zone as a
 * clean, borderless crop with a soft, light shadow. No frame, tilt or credit is drawn on the image: the
 * author credit goes in the publication caption. Only resizing and cropping
 * are applied to the photo's pixels: no redraw or retouch.
 */

/** Reserved zone on the 1080×1350 (4:5) canvas: the lower-right area. */
export const PORTRAIT_ZONE = { left: 430, top: 530, width: 610, height: 760 } as const;
/** The photo sits inside the zone with a margin of background, so text near the zone never touches it. */
export const PORTRAIT_PHOTO = { left: 470, top: 570, width: 550, height: 690 } as const;
const CANVAS = { width: 1080, height: 1350 } as const;
const SHADOW = { blur: 14, opacity: 0.28, offsetX: 0, offsetY: 10 } as const;

/** Appended to the slide's image prompt. The photo itself is never an input. */
export const PORTRAIT_ZONE_PROMPT = `
<DOCUMENTARY_PHOTO_ZONE>
A real, unmodified documentary photograph will be pasted onto this slide AFTER generation, as a borderless rectangular photo filling the lower-right area exactly: from 40% to 96% of the width and from 39% to 96% of the height.
- Keep that whole area as plain background colour, with no text, no letters, no logos, no objects, no frame and no strong shapes. It will be covered.
- Draw no photo frame, border, mount, shadow, caption strip or credit around that area; a soft shadow is added with the photo.
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
}: {
  image: Uint8Array;
  photo: Uint8Array;
}): Promise<Buffer> {
  const zone = PORTRAIT_PHOTO;
  // A borderless crop; it keeps the most salient part (faces).
  const fitted = await sharp(photo, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: zone.width, height: zone.height, fit: "cover", position: sharp.strategy.attention })
    .png()
    .toBuffer();
  // A soft, light shadow so the cut-out sits on the page instead of floating.
  const pad = SHADOW.blur * 3;
  // sharp blurs before it composites, so the shape is flattened first.
  const shape = await sharp({ create: { width: zone.width + 2 * pad, height: zone.height + 2 * pad, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: { create: { width: zone.width, height: zone.height, channels: 4, background: { r: 23, g: 32, b: 42, alpha: SHADOW.opacity } } }, left: pad, top: pad }])
    .png()
    .toBuffer();
  const shadow = await sharp(shape).blur(SHADOW.blur).png().toBuffer();
  return sharp(image)
    .resize(CANVAS.width, CANVAS.height, { fit: "fill" })
    .composite([
      { input: shadow, left: zone.left - pad + SHADOW.offsetX, top: zone.top - pad + SHADOW.offsetY },
      { input: fitted, left: zone.left, top: zone.top },
    ])
    .png()
    .toBuffer();
}

/**
 * Credit for a slide the AI adapted from a licensed photo (CC BY / BY-SA
 * require attribution of the original). Written locally, never left to the
 * model; it goes in the publication caption, not on the image.
 */
export function adaptationCreditLine(provenance: string): string {
  return `Adaptation IA · ${portraitCreditLine(provenance)}`.slice(0, 110);
}
