import sharp from "sharp";

/**
 * A verified map inside an AI-designed slide. The image model designs the
 * branded slide around a reserved, empty band and never sees the map; the
 * exact provider image is then placed there on a flat brand-colour mat. Only
 * resizing touches the map's pixels, so its streets, labels, pin and the
 * provider's own logo and attribution stay exactly as delivered.
 */

const CANVAS = { width: 1080, height: 1350 } as const;
/** The mat behind the map; the map sits inside it with an even border. */
export const MAP_PANEL_MAT = { left: 64, top: 640, width: 952, height: 604 } as const;
const MAT_BORDER = 6;
const MAT_RADIUS = 18;
export const MAP_PANEL_MAP = {
  left: MAP_PANEL_MAT.left + MAT_BORDER,
  top: MAP_PANEL_MAT.top + MAT_BORDER,
  width: MAP_PANEL_MAT.width - 2 * MAT_BORDER,
  height: MAP_PANEL_MAT.height - 2 * MAT_BORDER,
} as const;

const percent = (value: number, total: number) => Math.round((value / total) * 100);

/** Where the verified map sits, as rounded percentages of the canvas. */
export function mapPanelRegion(): { left: number; top: number; right: number; bottom: number } {
  const { left, top, width, height } = MAP_PANEL_MAT;
  return { left: percent(left, CANVAS.width), top: percent(top, CANVAS.height), right: percent(left + width, CANVAS.width), bottom: percent(top + height, CANVAS.height) };
}

/** Replaces the slide's own visual direction: the panel is the slide's image. */
export const MAP_PANEL_VISUAL_DIRECTION = "A calm editorial layout on the brand's background colour: the headline and supporting text in the upper part, set large and legible, and the lower part kept empty for the verified map panel added afterwards. No illustration competes with the panel.";

/** Appended to the slide's image prompt. The map itself is never an input. */
export function mapPanelZonePrompt(): string {
  const margin = 24;
  const zone = {
    left: Math.max(0, MAP_PANEL_MAT.left - margin),
    top: Math.max(0, MAP_PANEL_MAT.top - margin),
    right: Math.min(CANVAS.width, MAP_PANEL_MAT.left + MAP_PANEL_MAT.width + margin),
    bottom: Math.min(CANVAS.height, MAP_PANEL_MAT.top + MAP_PANEL_MAT.height + margin),
  };
  return `
<VERIFIED_MAP_ZONE>
A real, unmodified street map will be placed onto this slide AFTER generation as a framed landscape panel, occupying from ${percent(zone.left, CANVAS.width)}% to ${percent(zone.right, CANVAS.width)}% of the width and from ${percent(zone.top, CANVAS.height)}% to ${percent(zone.bottom, CANVAS.height)}% of the height.
- Keep that whole area as plain background colour, with no text, no letters, no logos, no objects, no frame and no strong shapes. It will be covered.
- This placement overrides any image position, size or subject described in the visual direction.
- Place every piece of text above it, within the top ${percent(zone.top, CANVAS.height) - 2}% of the slide.
- Do not draw any map, street, road, pin, route, landmark, building or other geography anywhere on the slide: the panel is the only place shown.
- Draw no frame, border, mount, caption strip or credit for the map.
</VERIFIED_MAP_ZONE>`;
}

function matSvg(fill: string): Buffer {
  const { width, height } = MAP_PANEL_MAT;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${MAT_RADIUS}" ry="${MAT_RADIUS}" fill="${fill}"/></svg>`);
}

export async function compositeMapPanel({ image, map, matColor }: {
  image: Uint8Array;
  map: Uint8Array;
  /** A brand colour for the mat; the text colour reads best. */
  matColor: string;
}): Promise<Buffer> {
  // "contain" never crops: the provider's logo and attribution sit at its edges.
  const fitted = await sharp(map, { limitInputPixels: 16_000_000 })
    .resize({ width: MAP_PANEL_MAP.width, height: MAP_PANEL_MAP.height, fit: "contain", background: matColor })
    .png()
    .toBuffer();
  return sharp(image)
    .resize(CANVAS.width, CANVAS.height, { fit: "fill" })
    .composite([
      { input: matSvg(/^#[0-9a-f]{6}$/iu.test(matColor) ? matColor : "#1f2933"), left: MAP_PANEL_MAT.left, top: MAP_PANEL_MAT.top },
      { input: fitted, left: MAP_PANEL_MAP.left, top: MAP_PANEL_MAP.top },
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
