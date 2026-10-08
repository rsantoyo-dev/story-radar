import sharp from "sharp";

/**
 * A verified map inside an AI-designed slide. The image model designs the
 * branded slide around a reserved, empty band and never sees the map; the
 * exact provider image is then placed there on a flat brand-colour mat. Only
 * resizing touches the map's pixels, so its streets, labels, pin and the
 * provider's own logo and attribution stay exactly as delivered.
 */

const CANVAS = { width: 1080, height: 1350 } as const;

/**
 * "inset" (since October 2026): a small map card on the right, between the
 * headline and the slide counter, lying on the slide's own scene with a light
 * border and a soft shadow. It is shown at the size Google's static map is
 * requested at (GOOGLE_STATIC_MAP_SIZE, scale 2), so the logo and attribution
 * read as Google draws them. "band": the earlier panel across the lower half on
 * a brand-colour mat, kept so batches composed with it recompose the same way.
 */
export type MapPanelLayout = "band" | "inset";
const BORDERS: Record<MapPanelLayout, number> = { band: 6, inset: 8 };
const RADII: Record<MapPanelLayout, number> = { band: 18, inset: 14 };
const INSET_MAP = { width: 420, height: 264 } as const;
const MATS: Record<MapPanelLayout, { left: number; top: number; width: number; height: number }> = {
  band: { left: 64, top: 640, width: 952, height: 604 },
  inset: { left: 1080 - 56 - (INSET_MAP.width + 2 * BORDERS.inset), top: 860, width: INSET_MAP.width + 2 * BORDERS.inset, height: INSET_MAP.height + 2 * BORDERS.inset },
};
/** The inset card reads as a printed map lying on the scene. */
const INSET_CARD_COLOR = "#FFFDF8";

/** The mat (or card) behind the map; the map sits inside it with an even border. */
export function mapPanelMat(layout: MapPanelLayout = "inset") {
  return MATS[layout];
}
export function mapPanelMap(layout: MapPanelLayout = "inset") {
  const mat = MATS[layout];
  const border = BORDERS[layout];
  return { left: mat.left + border, top: mat.top + border, width: mat.width - 2 * border, height: mat.height - 2 * border };
}
/** The current layout's mat and map. */
export const MAP_PANEL_MAT = mapPanelMat();
export const MAP_PANEL_MAP = mapPanelMap();

/** A placed map's layout: snapshots from before the inset used the band. */
export function mapPanelLayout(evidence: { panelLayout?: string } | undefined): MapPanelLayout {
  return evidence?.panelLayout === "inset" ? "inset" : "band";
}

const percent = (value: number, total: number) => Math.round((value / total) * 100);

/** Where the verified map sits, as rounded percentages of the canvas. */
export function mapPanelRegion(layout: MapPanelLayout = "inset"): { left: number; top: number; right: number; bottom: number } {
  const { left, top, width, height } = MATS[layout];
  return { left: percent(left, CANVAS.width), top: percent(top, CANVAS.height), right: percent(left + width, CANVAS.width), bottom: percent(top + height, CANVAS.height) };
}

/** The band's direction: the panel was the slide's image. Kept for recomposing band batches. */
export const MAP_PANEL_VISUAL_DIRECTION = "A calm editorial layout on the brand's background colour: the headline and supporting text in the upper part, set large and legible, and the lower part kept empty for the verified map panel added afterwards. No illustration competes with the panel.";

/**
 * The inset's scene. The map proves where; the slide shows what happens there,
 * as the facts support it, without inventing a place: fictional people, no
 * recognizable venue that only a verified photo could show.
 */
export const MAP_INSET_SCENE_DIRECTION = "Show the activity this slide's facts describe as a lively, warm scene in the brand's style with a light touch of realism: fictional, generic people doing it (never a real, named or recognizable person), with the food, drinks, music, objects and atmosphere the facts support. Keep the setting generic — no recognizable facade, landmark, street or sign naming a place — because the verified map inset shows where it is. When the facts describe a closure, works or damage, show no crowd or celebration.";

/** The slide's own direction plus the scene; a direction that only asked for a map becomes the scene. */
export function mapInsetVisualDirection(direction: string, asksForGeography: boolean): string {
  return asksForGeography || !direction.trim() ? MAP_INSET_SCENE_DIRECTION : `${direction.trim()} ${MAP_INSET_SCENE_DIRECTION}`;
}

/** Appended to the slide's image prompt. The map itself is never an input. */
export function mapPanelZonePrompt(layout: MapPanelLayout = "inset"): string {
  const margin = 24;
  const mat = MATS[layout];
  const zone = {
    left: Math.max(0, mat.left - margin),
    top: Math.max(0, mat.top - margin),
    right: Math.min(CANVAS.width, mat.left + mat.width + margin),
    bottom: Math.min(CANVAS.height, mat.top + mat.height + margin),
  };
  const area = `from ${percent(zone.left, CANVAS.width)}% to ${percent(zone.right, CANVAS.width)}% of the width and from ${percent(zone.top, CANVAS.height)}% to ${percent(zone.bottom, CANVAS.height)}% of the height`;
  if (layout === "band") {
    return `
<VERIFIED_MAP_ZONE>
A real, unmodified street map will be placed onto this slide AFTER generation as a framed landscape panel, occupying ${area}.
- Keep that whole area as plain background colour, with no text, no letters, no logos, no objects, no frame and no strong shapes. It will be covered.
- This placement overrides any image position, size or subject described in the visual direction.
- Place every piece of text above it, within the top ${percent(zone.top, CANVAS.height) - 2}% of the slide.
- Do not draw any map, street, road, pin, route, landmark, building or other geography anywhere on the slide: the panel is the only place shown.
- Draw no frame, border, mount, caption strip or credit for the map.
</VERIFIED_MAP_ZONE>`;
  }
  return `
<VERIFIED_MAP_ZONE>
A real, unmodified street map will be placed onto this slide AFTER generation as a small printed map card lying on the scene, occupying ${area}.
- Let the scene continue around and behind it, but keep that rectangle free of text, faces and the scene's key objects. It will be covered.
- Never place text inside or across it; keep the bottom of the slide below it clear as well.
- Do not draw any other map, street, road, pin or route, and no recognizable landmark or building facade: the inset is what shows the place.
- Draw no frame, border, mount, caption strip or credit for the map.
</VERIFIED_MAP_ZONE>`;
}

function matSvg(fill: string, layout: MapPanelLayout): Buffer {
  const { width, height } = MATS[layout];
  const radius = RADII[layout];
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="${fill}"/></svg>`);
}

const SHADOW = { spread: 28, offsetY: 10, blur: 12, opacity: 0.3 } as const;
/** A soft drop shadow, so the card sits on the scene rather than over a flat band. */
async function cardShadow(layout: MapPanelLayout): Promise<Buffer> {
  const { width, height } = MATS[layout];
  const radius = RADII[layout];
  const pad = SHADOW.spread;
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width + 2 * pad}" height="${height + 2 * pad}"><rect x="${pad}" y="${pad}" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="rgba(0,0,0,${SHADOW.opacity})"/></svg>`))
    .blur(SHADOW.blur)
    .png()
    .toBuffer();
}

export async function compositeMapPanel({ image, map, matColor, layout = "inset" }: {
  image: Uint8Array;
  map: Uint8Array;
  /** A brand colour for the mat; the text colour reads best. */
  matColor: string;
  layout?: MapPanelLayout;
}): Promise<Buffer> {
  const mat = MATS[layout];
  const place = mapPanelMap(layout);
  const cardColor = layout === "inset" ? INSET_CARD_COLOR : (/^#[0-9a-f]{6}$/iu.test(matColor) ? matColor : "#1f2933");
  // "contain" never crops: the provider's logo and attribution sit at its edges.
  const fitted = await sharp(map, { limitInputPixels: 16_000_000 })
    .resize({ width: place.width, height: place.height, fit: "contain", background: cardColor })
    .png()
    .toBuffer();
  return sharp(image)
    .resize(CANVAS.width, CANVAS.height, { fit: "fill" })
    .composite([
      ...(layout === "inset" ? [{ input: await cardShadow(layout), left: mat.left - SHADOW.spread, top: mat.top - SHADOW.spread + SHADOW.offsetY }] : []),
      { input: matSvg(cardColor, layout), left: mat.left, top: mat.top },
      { input: fitted, left: place.left, top: place.top },
    ])
    .png()
    .toBuffer();
}

/** Brand colours for a provider map: the page, the text, the accent and optional water and park tints. */
export type MapPalette = { surface: string; primary: string; accent: string; water?: string; park?: string };

function hue(hex: string): { h: number; s: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s };
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Maps a normalized brand palette onto the roles a map needs; undefined when too few colours. */
export function mapPaletteFromBrand(palette: readonly { color: string; role?: string }[]): MapPalette | undefined {
  const colors = palette.filter((entry) => /^#[0-9a-f]{6}$/iu.test(entry.color));
  if (colors.length < 3) return undefined;
  const byLight = [...colors].sort((a, b) => luminance(b.color) - luminance(a.color));
  const surface = (colors.find((entry) => entry.role === "surface") ?? byLight[0]).color;
  const primary = (colors.find((entry) => entry.role === "primary") ?? byLight[byLight.length - 1]).color;
  const accent = (colors.find((entry) => entry.role === "secondary") ?? colors.find((entry) => entry.color !== surface && entry.color !== primary))?.color ?? primary;
  const tint = (from: number, to: number, saturation: number) => colors.find((entry) => {
    const { h, s } = hue(entry.color);
    return entry.color !== primary && entry.color !== surface && h >= from && h <= to && s >= saturation;
  })?.color;
  const water = tint(170, 250, 0.2);
  const park = tint(60, 165, 0.12);
  return { surface, primary, accent, ...(water ? { water } : {}), ...(park ? { park } : {}) };
}
