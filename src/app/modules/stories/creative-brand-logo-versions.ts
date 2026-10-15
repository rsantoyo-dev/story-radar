import sharp from "sharp";

import { computeCreativeBrandOverlayGeometry, CreativeBrandOverlayError } from "./creative-brand-overlay";
import type {
  CreativeBrandOverlaySettings,
  CreativeBrandOverlaySnapshot,
  CreativeLogoForm,
  CreativeLogoTone,
} from "./creative-content.types";

/**
 * Which version of the brand's logo goes on a slide (2026-10-15). The slide's
 * position decides the form (the full logo on the cover, the form the brand
 * chose on the others); what the image shows where the logo goes decides the
 * version: the one that stands out most against it, measured pixel by pixel.
 */

const MAX_INPUT_PIXELS = 50_000_000;
/** CIE lightness behind the logo from which a background is light (a positive version's), and up to which it is dark (a negative's); between them it is mixed. */
const LIGHT_BACKGROUND = 60;
const DARK_BACKGROUND = 40;
/** A version this close in lightness to what is behind it (CIE points) all but vanishes there. */
const VANISHES = 20;
/** How much better another version must read to replace one that vanishes: about the step from a 3:1 contrast to a 4:1 one. */
const CLEARLY_BETTER = 10;

export type CreativeLogoGround = "light" | "dark" | "mixed";

/** The order in which each kind of background takes the versions: the one made for it, then one for any background. */
const PREFERENCE: Record<CreativeLogoGround, Record<CreativeLogoTone, number>> = {
  light: { positive: 0, alpha: 1, negative: 2 },
  dark: { negative: 0, alpha: 1, positive: 2 },
  mixed: { alpha: 0, positive: 1, negative: 1 },
};

export type CreativeLogoVersionOption = NonNullable<CreativeBrandOverlaySnapshot["logoVersions"]>[number];

/** How a version reads where it would go: the lightness behind it and its mean lightness difference from it (both 0–100). */
export type CreativeLogoReading = { background: number; contrast: number };

/** The logo's form on a slide: the full logo on the cover; on the others the form the brand chose for them. */
export function creativeLogoFormForSlide(settings: Pick<CreativeBrandOverlaySettings, "innerForm">, order: number): CreativeLogoForm {
  return order === 1 ? "full" : settings.innerForm ?? "full";
}

/** Every version the compositor may choose from: the snapshot's, or its one logo, made for the backgrounds the brand said. */
export function creativeLogoVersions(snapshot: CreativeBrandOverlaySnapshot): CreativeLogoVersionOption[] {
  return snapshot.logoVersions?.length ? snapshot.logoVersions : [{ form: "full", tone: snapshot.mainTone ?? "alpha", asset: snapshot.asset }];
}

/** The versions a slide may receive: those of its form; the full logos when the brand has none of that form; any otherwise. */
export function creativeLogoVersionsForSlide(snapshot: CreativeBrandOverlaySnapshot, order: number): CreativeLogoVersionOption[] {
  const versions = creativeLogoVersions(snapshot);
  for (const form of [creativeLogoFormForSlide(snapshot, order), "full"]) {
    const matching = versions.filter((version) => version.form === form);
    if (matching.length) return matching;
  }
  return versions;
}

/**
 * The logo proportions whose slot holds every version a slide may receive:
 * the slot the prompt keeps free and the page number moves beside. Each
 * version is scaled so its longer edge is the configured size, so the wide
 * ones share that width and differ in height, the tall ones the reverse, and
 * a mix of both fills the square.
 */
export function creativeLogoZoneSize(versions: readonly { asset: { width: number; height: number } }[]): { width: number; height: number } {
  if (!versions.length) throw new Error("A logo zone needs at least one version of the logo.");
  const sized = versions.map(({ asset }) => ({ width: asset.width, height: asset.height, aspect: asset.width / asset.height }));
  if (sized.every((version) => version.aspect >= 1)) return pick(sized.reduce((tallest, version) => (version.aspect < tallest.aspect ? version : tallest)));
  if (sized.every((version) => version.aspect <= 1)) return pick(sized.reduce((widest, version) => (version.aspect > widest.aspect ? version : widest)));
  return { width: 1000, height: 1000 };
}

const pick = ({ width, height }: { width: number; height: number }) => ({ width, height });

/**
 * The version to place, as needed: the image is measured where the logo
 * goes (the backdrop blended in when there is one). A light background takes
 * a version made for light backgrounds (positive), a dark one a version made
 * for dark ones (negative), a mixed one a version made for any (alpha); each
 * takes one for any background next. Among versions of the same kind, the
 * one that stands out most, then the first listed (the main logo). A version
 * that would all but vanish there gives way to one that reads clearly better,
 * whatever it was made for.
 */
export async function chooseCreativeLogoVersion({
  image,
  settings,
  versions,
  logos,
}: {
  image: Uint8Array;
  settings: CreativeBrandOverlaySettings;
  versions: readonly { tone: CreativeLogoTone }[];
  logos: readonly Uint8Array[];
}): Promise<{ index: number; ground: CreativeLogoGround; readings: CreativeLogoReading[] }> {
  if (!versions.length || versions.length !== logos.length) throw new CreativeBrandOverlayError("Each version of the logo needs its PNG.");
  const decoded = await sharp(toBuffer(image), { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const readings = await Promise.all(logos.map((logo) => readCreativeLogo({ image: decoded, logo, settings })));
  const behind = readings.reduce((sum, reading) => sum + reading.background, 0) / readings.length;
  const ground: CreativeLogoGround = behind >= LIGHT_BACKGROUND ? "light" : behind <= DARK_BACKGROUND ? "dark" : "mixed";
  const ranked = readings
    .map((reading, index) => ({ reading, index, rank: PREFERENCE[ground][versions[index].tone] }))
    .sort((a, b) => a.rank - b.rank || b.reading.contrast - a.reading.contrast || a.index - b.index);
  const preferred = ranked[0];
  const clearest = [...ranked].sort((a, b) => b.reading.contrast - a.reading.contrast || a.rank - b.rank || a.index - b.index)[0];
  const vanishes = preferred.reading.contrast < VANISHES && clearest.reading.contrast >= preferred.reading.contrast + CLEARLY_BETTER;
  return { index: vanishes ? clearest.index : preferred.index, ground, readings };
}

/** How one version reads where the compositor would put it, weighted by its opacity pixel by pixel. */
async function readCreativeLogo({
  image,
  logo,
  settings,
}: {
  image: { data: Buffer; info: { width: number; height: number; channels: number } };
  logo: Uint8Array;
  settings: CreativeBrandOverlaySettings;
}): Promise<CreativeLogoReading> {
  const source = sharp(toBuffer(logo), { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS });
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height) throw new CreativeBrandOverlayError("A version of the logo has no readable dimensions.");
  const { width, height, channels } = image.info;
  const geometry = computeCreativeBrandOverlayGeometry({ settings, canvasWidth: width, canvasHeight: height, logoWidth: metadata.width, logoHeight: metadata.height });
  const ink = await source.resize(geometry.logo.width, geometry.logo.height, { fit: "fill" }).ensureAlpha().raw().toBuffer();
  const backdrop = settings.backdropMode === "solid" ? { ...hexColor(settings.backdropColor), opacity: settings.backdropOpacity / 100 } : undefined;
  let weight = 0;
  let background = 0;
  let difference = 0;
  for (let y = 0; y < geometry.logo.height; y += 1) {
    for (let x = 0; x < geometry.logo.width; x += 1) {
      const at = (y * geometry.logo.width + x) * 4;
      const alpha = ink[at + 3] / 255;
      if (!alpha) continue;
      const pixel = ((geometry.logo.top + y) * width + geometry.logo.left + x) * channels;
      const [red, green, blue] = [image.data[pixel], image.data[pixel + 1], image.data[pixel + 2]].map((value, channel) =>
        backdrop ? Math.round(value * (1 - backdrop.opacity) + backdrop.rgb[channel] * backdrop.opacity) : value);
      const behind = lightness(red, green, blue);
      weight += alpha;
      background += alpha * behind;
      difference += alpha * Math.abs(lightness(ink[at], ink[at + 1], ink[at + 2]) - behind);
    }
  }
  if (!weight) return { background: 0, contrast: 0 };
  return { background: background / weight, contrast: difference / weight };
}

const LINEAR = Array.from({ length: 256 }, (_, value) => {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
});

/** CIE lightness (0–100) of an sRGB colour. */
export function lightness(red: number, green: number, blue: number): number {
  const luminance = 0.2126 * LINEAR[red] + 0.7152 * LINEAR[green] + 0.0722 * LINEAR[blue];
  return luminance > 216 / 24389 ? 116 * Math.cbrt(luminance) - 16 : (24389 / 27) * luminance;
}

function hexColor(value: string): { rgb: [number, number, number] } {
  const match = /^#([\da-f]{6})$/iu.exec(value.trim());
  if (!match?.[1]) throw new CreativeBrandOverlayError("Brand backdrop colors must use the #RRGGBB format.");
  return { rgb: [0, 2, 4].map((start) => Number.parseInt(match[1].slice(start, start + 2), 16)) as [number, number, number] };
}

function toBuffer(value: Uint8Array): Buffer {
  return Buffer.isBuffer(value) ? value : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}
