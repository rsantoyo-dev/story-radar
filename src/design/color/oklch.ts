/**
 * Minimal, dependency-free colour maths for the brand → UI theme engine.
 *
 * Working space is OKLCH: perceptual lightness (`L`, 0..1), chroma (`C`, 0..~0.4)
 * and hue (`h`, degrees). Deriving tones by target lightness — instead of
 * linearly mixing toward white/black — keeps a dark navy readable and a bright
 * yellow from turning muddy. Contrast helpers use the WCAG 2.x relative
 * luminance formula so every pair the theme emits can be measured and repaired.
 */

export type Oklch = { L: number; C: number; h: number };

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function srgbToLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  return channel <= 0.0031308
    ? channel * 12.92
    : 1.055 * channel ** (1 / 2.4) - 0.055;
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "").trim();
  const full =
    value.length === 3
      ? value
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : value;
  return [
    Number.parseInt(full.slice(0, 2), 16) / 255,
    Number.parseInt(full.slice(2, 4), 16) / 255,
    Number.parseInt(full.slice(4, 6), 16) / 255,
  ];
}

export function rgbToHex(rgb: readonly [number, number, number]): string {
  return `#${rgb
    .map((channel) =>
      Math.round(clamp01(channel) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear) as [
    number,
    number,
    number,
  ];
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  const L = 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
  const a = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const bAxis =
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;
  const C = Math.hypot(a, bAxis);
  let h = (Math.atan2(bAxis, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L: clamp01(L), C, h };
}

function oklchToLinearRgb({ L, C, h }: Oklch): [number, number, number] {
  const hueRadians = (h * Math.PI) / 180;
  const a = C * Math.cos(hueRadians);
  const bAxis = C * Math.sin(hueRadians);
  const lRoot = L + 0.3963377774 * a + 0.2158037573 * bAxis;
  const mRoot = L - 0.1055613458 * a - 0.0638541728 * bAxis;
  const sRoot = L - 0.0894841775 * a - 1.291485548 * bAxis;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: readonly number[]): boolean =>
  rgb.every((channel) => channel >= -0.001 && channel <= 1.001);

/**
 * OKLCH → hex. When the requested chroma falls outside the sRGB gamut the
 * chroma is walked down (hue and lightness preserved) until the colour fits,
 * so an over-saturated request degrades gracefully instead of clipping to noise.
 */
export function oklchToHex(color: Oklch): string {
  let chroma = Math.max(0, color.C);
  for (let step = 0; step < 48; step += 1) {
    const linear = oklchToLinearRgb({ ...color, C: chroma });
    if (inGamut(linear) || chroma <= 0) {
      return rgbToHex(linear.map(linearToSrgb) as [number, number, number]);
    }
    chroma = Math.max(0, chroma - 0.01);
  }
  return rgbToHex(
    oklchToLinearRgb({ ...color, C: 0 }).map(linearToSrgb) as [
      number,
      number,
      number,
    ],
  );
}

export function withLightness(hex: string, L: number): string {
  return oklchToHex({ ...hexToOklch(hex), L: clamp01(L) });
}

export function withChroma(hex: string, C: number): string {
  return oklchToHex({ ...hexToOklch(hex), C: Math.max(0, C) });
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(left: string, right: string): number {
  const lighter = Math.max(relativeLuminance(left), relativeLuminance(right));
  const darker = Math.min(relativeLuminance(left), relativeLuminance(right));
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Nudge `color` along OKLCH lightness (hue and chroma preserved) until it meets
 * `target` contrast against the fixed `against` colour, landing on the shade
 * closest to the original that still passes. If even the lightness extreme
 * cannot reach the target it returns that extreme — the caller decides whether
 * to also move the background.
 */
export function fitContrast(
  color: string,
  against: string,
  target: number,
): string {
  if (contrastRatio(color, against) >= target) return color;

  const base = hexToOklch(color);
  const towardDark = hexToOklch(against).L > 0.5;
  const extreme = oklchToHex({ ...base, L: towardDark ? 0 : 1 });
  if (contrastRatio(extreme, against) < target) return extreme;

  let low = towardDark ? 0 : base.L;
  let high = towardDark ? base.L : 1;
  for (let step = 0; step < 24; step += 1) {
    const mid = (low + high) / 2;
    const passes =
      contrastRatio(oklchToHex({ ...base, L: mid }), against) >= target;
    if (towardDark) {
      if (passes) low = mid;
      else high = mid;
    } else if (passes) {
      high = mid;
    } else {
      low = mid;
    }
  }
  return oklchToHex({ ...base, L: towardDark ? low : high });
}

/**
 * A near-black or near-white ink (tinted with the background hue) that reads on
 * `background`, pushed to `target` contrast when the plain pick falls short.
 */
export function readableInk(background: string, target = 7): string {
  const { h } = hexToOklch(background);
  const dark = oklchToHex({ L: 0.24, C: 0.012, h });
  const light = oklchToHex({ L: 0.98, C: 0.005, h });
  const pick =
    contrastRatio(dark, background) >= contrastRatio(light, background)
      ? dark
      : light;
  return fitContrast(pick, background, target);
}
