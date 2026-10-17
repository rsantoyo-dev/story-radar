import path from "node:path";
import { GlobalFonts } from "@napi-rs/canvas";

import { BRAND_FONTS, FALLBACK_BRAND_FONT, brandFontById, type BrandFontChoice } from "./brand-fonts";

/**
 * The brand fonts registered with Skia (@napi-rs/canvas), once per process,
 * from the files bundled in fonts/: Skia reads a font straight from its file
 * on every host, macOS included, where the Pango that sharp ships draws with
 * the system's own fonts and ignores a bundled file. Each family is
 * registered under its catalog name, every file of a static family under the
 * same name so a weight picks its file.
 */
let registered: string | undefined;

export function registerBrandFonts(root = process.cwd()): void {
  if (registered === root) return;
  for (const font of BRAND_FONTS) {
    for (const file of font.files) GlobalFonts.registerFromPath(path.join(root, "fonts", "brand", font.dir, file.file), font.name);
  }
  registered = root;
}

/** The canvas font and variation settings for a choice at a size: the weight as the wght axis of a variable family, its fixed axes, its optical size. */
export function canvasFont(choice: BrandFontChoice, size: number): { font: string; variations: string } {
  const font = brandFontById(choice.font) ?? brandFontById(FALLBACK_BRAND_FONT)!;
  const variable = font.files.length === 1 && font.files[0].weight === undefined;
  const axes: Record<string, number> = variable ? { wght: choice.weight, ...(font.variations ?? {}) } : {};
  if (variable && font.opsz) axes.opsz = Math.min(font.opsz[1], Math.max(font.opsz[0], Math.round(size)));
  const variations = Object.entries(axes).map(([axis, value]) => `"${axis}" ${value}`).join(", ") || "normal";
  // The bundled fallback after the family, for a character the family lacks.
  return { font: `${choice.weight} ${Math.round(size)}px "${font.name}", "Liberation Sans"`, variations };
}
