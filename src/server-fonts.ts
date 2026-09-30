import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Points fontconfig (used by sharp to draw SVG text) at the bundled fonts.
 * Serverless runtimes have no system fonts, so without this every character
 * of the carousel numbering, credits and map labels renders as an empty box.
 * Liberation Sans is metric-compatible with Arial, so text fitting is unchanged.
 * Must run before the first text render: fontconfig reads its file once.
 */
export function configureServerFonts(root = process.cwd()): string | undefined {
  if (process.env.FONTCONFIG_FILE) return process.env.FONTCONFIG_FILE;
  const fontsDir = path.join(root, "fonts");
  const dir = path.join(tmpdir(), "press-craftor-fontconfig");
  const alias = (family: string) =>
    `<alias binding="same"><family>${family}</family><prefer><family>Liberation Sans</family></prefer></alias>`;
  const config = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>${fontsDir}</dir>
  <cachedir>${path.join(dir, "cache")}</cachedir>
  ${["Arial", "Helvetica", "sans-serif"].map(alias).join("\n  ")}
</fontconfig>
`;
  try {
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "fonts.conf");
    writeFileSync(file, config);
    process.env.FONTCONFIG_FILE = file;
    return file;
  } catch {
    // Rendering still works with whatever fonts the host has.
    console.error("Could not configure bundled server fonts");
    return undefined;
  }
}
