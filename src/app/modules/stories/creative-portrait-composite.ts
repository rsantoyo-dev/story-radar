import sharp, { type OverlayOptions } from "sharp";

/**
 * A documentary portrait inside an AI-designed slide (real people). The image
 * model designs the branded slide around a reserved, empty zone and never sees
 * the photograph; afterwards the untouched photo is placed in that zone with
 * one of a few editorial treatments (shape, colour block, soft shadow) that
 * rotate across slides. No frame, tilt or credit is drawn on the image: the
 * author credit goes in the publication caption. Only resizing, cropping and
 * a shape mask touch the photo's pixels: no redraw, retouch or recolouring.
 */

const CANVAS = { width: 1080, height: 1350 } as const;
type Rect = { left: number; top: number; width: number; height: number };

export type PortraitLayoutId = "offset-block-right" | "rounded-left" | "top-bleed" | "arch-right" | "circle-right";

type PortraitLayout = {
  id: PortraitLayoutId | "legacy";
  /** Where the photo goes. */
  photo: Rect;
  shape: "rect" | "rounded" | "arch" | "circle";
  /** A flat brand-colour block of the same shape, offset behind the photo. */
  block?: { dx: number; dy: number };
  shadow: boolean;
  /** What the image model reads about the photo's shape and the text placement. */
  shapeText: string;
  textPlacement: string;
};

/** Rotated by slide order, so consecutive photo slides never share a layout. */
export const PORTRAIT_LAYOUTS: readonly (PortraitLayout & { id: PortraitLayoutId })[] = [
  {
    id: "offset-block-right",
    photo: { left: 500, top: 570, width: 510, height: 640 },
    shape: "rect",
    block: { dx: -30, dy: 30 },
    shadow: false,
    shapeText: "a borderless rectangular photo on the right, with a flat brand-colour block of the same size offset behind its lower-left corner",
    textPlacement: "the headline across the top 38% of the slide; supporting text in the left column (left 40% of the width) below the headline",
  },
  {
    id: "rounded-left",
    photo: { left: 60, top: 560, width: 500, height: 650 },
    shape: "rounded",
    shadow: true,
    shapeText: "a photo with softly rounded corners on the left, with a soft light shadow",
    textPlacement: "the headline across the top 37% of the slide; supporting text in the right column (right 42% of the width) below the headline",
  },
  {
    id: "top-bleed",
    photo: { left: 0, top: 0, width: 1080, height: 600 },
    shape: "rect",
    shadow: false,
    shapeText: "a full-width photo across the top of the slide, edge to edge",
    textPlacement: "the headline and supporting text in the lower part, from 50% to 90% of the height, left-aligned with generous margins",
  },
  {
    id: "arch-right",
    photo: { left: 530, top: 520, width: 480, height: 690 },
    shape: "arch",
    block: { dx: -26, dy: 26 },
    shadow: false,
    shapeText: "an arch-shaped photo (rounded top, straight bottom) on the right, with a flat brand-colour arch of the same size offset behind it",
    textPlacement: "the headline across the top 36% of the slide; supporting text in the left column (left 42% of the width) below the headline",
  },
  {
    id: "circle-right",
    photo: { left: 500, top: 600, width: 520, height: 520 },
    shape: "circle",
    shadow: true,
    shapeText: "a circular photo on the right, with a soft light shadow",
    textPlacement: "the headline across the top 40% of the slide; supporting text in the left column (left 40% of the width) below the headline",
  },
];

/** The first, fixed treatment; assets saved before layouts rotated keep it. */
const LEGACY_LAYOUT: PortraitLayout = {
  id: "legacy",
  photo: { left: 470, top: 570, width: 550, height: 690 },
  shape: "rect",
  shadow: true,
  shapeText: "",
  textPlacement: "",
};

/** Reserved zone and photo of the legacy layout, kept for older prompts. */
export const PORTRAIT_ZONE = { left: 430, top: 530, width: 610, height: 760 } as const;
export const PORTRAIT_PHOTO = LEGACY_LAYOUT.photo;

const SHADOW = { blur: 14, opacity: 0.28, offsetY: 10 } as const;

export function portraitLayoutForSlide(order: number): PortraitLayoutId {
  return PORTRAIT_LAYOUTS[(Math.max(1, order) - 1) % PORTRAIT_LAYOUTS.length].id;
}

/** A box on the photo, in fractions of its width and height (0 is the left or top edge, 1 the right or bottom). */
export type PortraitBox = { left: number; top: number; right: number; bottom: number };
/** Where the person is on the photo: their face and the part of them it shows, as a vision model located them, or the editor's focal point as a small face. */
export type PortraitSubject = { face?: PortraitBox; person?: PortraitBox };
/** The window of the photo a frame shows, in the photo's pixels after its EXIF rotation. */
export type PortraitCrop = { left: number; top: number; width: number; height: number };
/** The layout a photo takes on its slide and the window of it the frame shows; without a crop the composite crops on its own. */
export type PortraitFit = { layout: PortraitLayoutId; crop?: PortraitCrop };

/** Beyond this the photo is enlarged past its own pixels and reads soft; each tenth more costs a little. */
const FREE_ENLARGEMENT = 1.15;
/** Where a face's middle sits in its window, from the top: room above the head, the shoulders below. */
const FACE_LINE = 0.4;

/**
 * The largest window of the frame's shape inside the photo, placed on the
 * person: the face's middle at FACE_LINE of its height when the face is
 * known, else the person centred; with neither, the photo's middle.
 */
function subjectWindow(photo: { width: number; height: number }, frame: { width: number; height: number }, subject: PortraitSubject): PortraitCrop {
  const aspect = frame.width / frame.height;
  const width = Math.min(photo.width, Math.round(photo.height * aspect));
  const height = Math.min(photo.height, Math.round(width / aspect));
  const anchor = subject.face ?? subject.person;
  const clamp = (value: number, max: number) => Math.min(Math.max(0, Math.round(value)), max);
  if (!anchor) return { left: Math.round((photo.width - width) / 2), top: Math.round((photo.height - height) / 2), width, height };
  const x = ((anchor.left + anchor.right) / 2) * photo.width;
  const y = ((anchor.top + anchor.bottom) / 2) * photo.height;
  return { left: clamp(x - width / 2, photo.width - width), top: clamp(y - height * (subject.face ? FACE_LINE : 0.5), photo.height - height), width, height };
}

/** How much of a box the window leaves out, as a fraction of the box's area. */
function leftOut(box: PortraitBox | undefined, window: PortraitCrop, photo: { width: number; height: number }): number {
  if (!box) return 0;
  const [left, top, right, bottom] = [box.left * photo.width, box.top * photo.height, box.right * photo.width, box.bottom * photo.height];
  const area = Math.max(1, (right - left) * (bottom - top));
  const kept = Math.max(0, Math.min(right, window.left + window.width) - Math.max(left, window.left)) * Math.max(0, Math.min(bottom, window.top + window.height) - Math.max(top, window.top));
  return 1 - kept / area;
}

/** How much of the face an arch's rounded top or a circle's edge hides: the corners of the face's oval outside the shape, as a fraction. */
function maskedFace(layout: PortraitLayout, window: PortraitCrop, face: PortraitBox | undefined, photo: { width: number; height: number }): number {
  if (!face || (layout.shape !== "arch" && layout.shape !== "circle")) return 0;
  const { width, height } = layout.photo;
  const scale = width / window.width;
  // A face is an oval: its box's corners pulled 15% inwards.
  const inset = (from: number, to: number) => [from + (to - from) * 0.15, to - (to - from) * 0.15];
  const [x0, x1] = inset(face.left * photo.width, face.right * photo.width).map((value) => (value - window.left) * scale);
  const [y0, y1] = inset(face.top * photo.height, face.bottom * photo.height).map((value) => (value - window.top) * scale);
  const inside = ([x, y]: number[]) => layout.shape === "circle"
    ? ((x - width / 2) / (width / 2)) ** 2 + ((y - height / 2) / (height / 2)) ** 2 <= 1
    : y >= width / 2 || (x - width / 2) ** 2 + (y - width / 2) ** 2 <= (width / 2) ** 2;
  return [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].filter((corner) => !inside(corner)).length / 4;
}

/**
 * The layout that shows the person best, and the window of the photo it
 * shows: each layout's frame is filled with the largest window of its shape
 * placed on the person, and the one that cuts the least of the face and the
 * body, hides no face behind an arch or a circle, and enlarges the photo the
 * least wins; the layout of the photo slide before it, when given, only
 * breaks ties, so photo slides still vary. Without a face or a person the
 * crop is left to the composite.
 */
export function fitPortrait(photo: { width: number; height: number }, subject: PortraitSubject, { avoid = [], order = 1 }: { avoid?: readonly string[]; order?: number } = {}): PortraitFit {
  const rotation = portraitLayoutForSlide(order);
  let best: { fit: PortraitFit; cost: number } | undefined;
  for (const layout of PORTRAIT_LAYOUTS) {
    const window = subjectWindow(photo, layout.photo, subject);
    const enlargement = layout.photo.width / window.width;
    const cost = 30 * leftOut(subject.face, window, photo) + 3 * leftOut(subject.person, window, photo) + 20 * maskedFace(layout, window, subject.face, photo)
      + 4 * Math.max(0, enlargement - FREE_ENLARGEMENT) + (avoid.includes(layout.id) ? 0.6 : 0) + (layout.id === rotation ? 0 : 0.01);
    if (!best || cost < best.cost) best = { fit: { layout: layout.id, ...(subject.face || subject.person ? { crop: window } : {}) }, cost };
  }
  return best!.fit;
}

function layoutById(id: string | undefined): PortraitLayout {
  return PORTRAIT_LAYOUTS.find((layout) => layout.id === id) ?? LEGACY_LAYOUT;
}

/** Where the verified photo sits, as rounded percentages of the canvas. */
export function portraitPhotoRegion(layoutId: string | undefined): { left: number; top: number; right: number; bottom: number } {
  const { left, top, width, height } = layoutById(layoutId).photo;
  return { left: percent(left, CANVAS.width), top: percent(top, CANVAS.height), right: percent(left + width, CANVAS.width), bottom: percent(top + height, CANVAS.height) };
}

/** A brand accent for the colour block: never the page surface or the text colour. */
export function portraitAccent(palette: readonly { color: string; role?: string }[], order: number): string | undefined {
  const accents = palette.filter((entry) => entry.role !== "surface" && entry.role !== "primary" && /^#[0-9a-f]{6}$/iu.test(entry.color));
  return accents.length ? accents[(Math.max(1, order) - 1) % accents.length].color : undefined;
}

const percent = (value: number, total: number) => Math.round((value / total) * 100);

/** Appended to the slide's image prompt. The photo itself is never an input. */
export function portraitZonePrompt(id: PortraitLayoutId): string {
  const layout = layoutById(id);
  const margin = 24;
  const zone = {
    left: Math.max(0, layout.photo.left + Math.min(0, layout.block?.dx ?? 0) - margin),
    top: Math.max(0, layout.photo.top - margin),
    right: Math.min(CANVAS.width, layout.photo.left + layout.photo.width + margin),
    bottom: Math.min(CANVAS.height, layout.photo.top + layout.photo.height + Math.max(layout.block?.dy ?? 0, layout.shadow ? SHADOW.offsetY + 20 : 0) + margin),
  };
  return `
<DOCUMENTARY_PHOTO_ZONE>
A real, unmodified documentary photograph will be placed onto this slide AFTER generation as ${layout.shapeText}, occupying from ${percent(zone.left, CANVAS.width)}% to ${percent(zone.right, CANVAS.width)}% of the width and from ${percent(zone.top, CANVAS.height)}% to ${percent(zone.bottom, CANVAS.height)}% of the height.
- Keep that whole area as plain background colour, with no text, no letters, no logos, no objects, no frame and no strong shapes. It will be covered; the photo's shape, colour block and shadow are added with it.
- This placement overrides any photo position, size or shape described in the visual direction.
- Place every piece of text outside it: ${layout.textPlacement}.
- Do not depict any person, face, portrait, silhouette, body, crowd or character anywhere on the slide. The only person on the slide will be the real photograph.
- Draw no photo frame, border, mount, caption strip or credit.
</DOCUMENTARY_PHOTO_ZONE>`;
}

/** The fixed-zone instruction of LEGACY_LAYOUT, for slides made before layouts rotated. */
export const PORTRAIT_ZONE_PROMPT = `
<DOCUMENTARY_PHOTO_ZONE>
A real, unmodified documentary photograph will be pasted onto this slide AFTER generation, as a borderless rectangular photo filling the lower-right area exactly: from 40% to 96% of the width and from 39% to 96% of the height.
- Keep that whole area as plain background colour, with no text, no letters, no logos, no objects, no frame and no strong shapes. It will be covered.
- Draw no photo frame, border, mount, shadow, caption strip or credit around that area; a soft shadow is added with the photo.
- Place every piece of text (headline, supporting text) outside it: the headline across the top 37% of the slide, supporting text in the left column below it (left 38% of the width).
- Do not depict any person, face, portrait, silhouette, body, crowd or character anywhere on the slide. The only person on the slide will be the real photograph.
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

function shapeSvg(layout: PortraitLayout, fill: string, opacity = 1): Buffer {
  const { width, height } = layout.photo;
  const style = `fill="${fill}" fill-opacity="${opacity}"`;
  const body = layout.shape === "rounded"
    ? `<rect width="${width}" height="${height}" rx="44" ry="44" ${style}/>`
    : layout.shape === "circle"
    ? `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" ${style}/>`
    : layout.shape === "arch"
    ? `<path d="M0 ${height} L0 ${width / 2} A ${width / 2} ${width / 2} 0 0 1 ${width} ${width / 2} L${width} ${height} Z" ${style}/>`
    : `<rect width="${width}" height="${height}" ${style}/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`);
}

/**
 * The largest window of the frame's shape that keeps the focal point as
 * central as the photo allows, in the photo's pixels.
 */
export function focalCrop(photo: { width: number; height: number }, frame: { width: number; height: number }, focus: { x: number; y: number }) {
  const aspect = frame.width / frame.height;
  const width = Math.min(photo.width, Math.round(photo.height * aspect));
  const height = Math.min(photo.height, Math.round(photo.width / aspect));
  const clamp = (value: number, max: number) => Math.min(Math.max(0, Math.round(value)), max);
  return {
    left: clamp(focus.x * photo.width - width / 2, photo.width - width),
    top: clamp(focus.y * photo.height - height / 2, photo.height - height),
    width,
    height,
  };
}

async function framedPhoto(photo: Uint8Array, frame: { width: number; height: number }, focus?: { x: number; y: number }, crop?: PortraitCrop): Promise<Buffer> {
  const oriented = sharp(photo, { limitInputPixels: 40_000_000 }).rotate();
  // The window fitPortrait chose for this frame, on the person: kept inside the photo, then drawn at the frame's size.
  if (crop) {
    const { data, info } = await oriented.toBuffer({ resolveWithObject: true });
    const left = Math.min(Math.max(0, crop.left), Math.max(0, info.width - 1));
    const top = Math.min(Math.max(0, crop.top), Math.max(0, info.height - 1));
    const window = { left, top, width: Math.max(1, Math.min(crop.width, info.width - left)), height: Math.max(1, Math.min(crop.height, info.height - top)) };
    return sharp(data, { limitInputPixels: 40_000_000 }).extract(window).resize({ ...frame, fit: "fill" }).ensureAlpha().png().toBuffer();
  }
  // Without the editor's focal point the crop keeps the most salient part,
  // which in a bright landscape can be the trees rather than the people.
  if (!focus) return oriented.resize({ ...frame, fit: "cover", position: sharp.strategy.attention }).ensureAlpha().png().toBuffer();
  const { data, info } = await oriented.toBuffer({ resolveWithObject: true });
  return sharp(data, { limitInputPixels: 40_000_000 })
    .extract(focalCrop(info, frame, focus))
    .resize({ ...frame, fit: "fill" })
    .ensureAlpha()
    .png()
    .toBuffer();
}

export async function compositeDocumentaryPortrait({
  image,
  photo,
  layout: layoutId,
  accent,
  focus,
  crop,
}: {
  image: Uint8Array;
  photo: Uint8Array;
  layout?: string;
  accent?: string;
  /** The editor's focal point on the photo; absent, the crop is automatic. */
  focus?: { x: number; y: number };
  /** The window of the photo to show (fitPortrait's), which wins over the focal point. */
  crop?: PortraitCrop;
}): Promise<Buffer> {
  const layout = layoutById(layoutId);
  const { left, top, width, height } = layout.photo;
  // Cropped to the window chosen on the person, else around the editor's focal point when there is one.
  const cropped = await framedPhoto(photo, { width, height }, focus, crop);
  const shaped = layout.shape === "rect"
    ? cropped
    : await sharp(cropped).composite([{ input: shapeSvg(layout, "#000"), blend: "dest-in" }]).png().toBuffer();

  const layers: OverlayOptions[] = [];
  if (layout.block && accent) {
    layers.push({ input: shapeSvg(layout, accent), left: left + layout.block.dx, top: top + layout.block.dy });
  }
  if (layout.shadow) {
    // A soft, light shadow; sharp blurs before it composites, so the shape is flattened first.
    const pad = SHADOW.blur * 3;
    const shape = await sharp({ create: { width: width + 2 * pad, height: height + 2 * pad, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: shapeSvg(layout, "#17202a", SHADOW.opacity), left: pad, top: pad }])
      .png()
      .toBuffer();
    layers.push({ input: await sharp(shape).blur(SHADOW.blur).png().toBuffer(), left: left - pad, top: top - pad + SHADOW.offsetY });
  }
  layers.push({ input: shaped, left, top });
  return sharp(image)
    .resize(CANVAS.width, CANVAS.height, { fit: "fill" })
    .composite(layers)
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

/** The same credit for a verified place photo the model adapted (Commons, or found through Openverse). */
export function placePhotoAdaptationCreditLine(photo: { author: string; license: string; provider?: string }): string {
  return adaptationCreditLine(`Photo: ${photo.author} · ${photo.license} · ${photo.provider === "openverse" ? "via Openverse" : "via Wikimedia Commons"}`);
}
