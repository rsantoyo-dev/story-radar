/**
 * Measures how far the app's styles are expressed through UXDSL roles and
 * tokens (docs/features/uxdsl-alignment.md). Each finding is a declaration or
 * rule that decides something the theme should own: a literal color, spacing,
 * radius, border width, shadow or type setting, a hand-built button, surface
 * or focus ring. A rule that carries a `uxdsl-exception: <reason>` comment is
 * counted as a documented exception instead: those are the real gaps to
 * report upstream (docs/uxdsl-findings.md).
 *
 *   node scripts/uxdsl-audit.mjs            # table per file, totals
 *   node scripts/uxdsl-audit.mjs --json     # machine-readable
 *   node scripts/uxdsl-audit.mjs --check    # fail when any count grows past the baseline
 *   node scripts/uxdsl-audit.mjs --update   # write the baseline (after a cleanup)
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

export const CATEGORIES = ["color", "spacing", "radius", "border", "shadow", "type", "focus", "button", "surface", "important", "exception"];

const LENGTH = /(?<![\w-])-?\d*\.?\d+(?:px|rem|em)\b/u;
const RAW_COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(|\b(?:white|black|red|blue|green|gray|grey|orange|yellow|purple|pink)\b/iu;
const COLOR_PROPERTY = /^(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left|block|inline))?(?:-color)?|outline(?:-color)?|fill|stroke|text-decoration-color|caret-color|accent-color|column-rule-color)$/u;
const SPACING_PROPERTY = /^(?:padding|margin)(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?$|^(?:gap|row-gap|column-gap)$/u;
const RADIUS_PROPERTY = /^border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius$/u;
const BORDER_PROPERTY = /^border(?:-(?:top|right|bottom|left|block|inline))?(?:-width)?$/u;
const TYPE_PROPERTY = /^(?:font-size|font-weight|line-height|letter-spacing|font-family)$/u;
const ROLE_DIRECTIVE = /^ds-(?:button|input|surface)$/u;

/** Findings for one stylesheet's source, by category. */
export function auditStylesheet(source, from = "stylesheet.uxdsl") {
  const counts = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
  const root = postcss.parse(source, { from });
  root.walkRules((rule) => {
    const children = rule.nodes ?? [];
    if (children.some((node) => node.type === "comment" && /uxdsl-exception\s*:/u.test(node.text))) {
      counts.exception += 1;
      return;
    }
    const declarations = children.filter((node) => node.type === "decl");
    const directives = children.filter((node) => node.type === "atrule").map((node) => node.name);
    const hasRole = directives.some((name) => ROLE_DIRECTIVE.test(name));
    const has = (pattern) => declarations.some((decl) => pattern.test(decl.prop));
    for (const decl of declarations) {
      const prop = decl.prop.toLowerCase();
      const value = decl.value;
      if (decl.important) counts.important += 1;
      if (COLOR_PROPERTY.test(prop) && RAW_COLOR.test(value)) counts.color += 1;
      if (SPACING_PROPERTY.test(prop) && LENGTH.test(value)) counts.spacing += 1;
      if (RADIUS_PROPERTY.test(prop) && LENGTH.test(value)) counts.radius += 1;
      if (BORDER_PROPERTY.test(prop) && !/^(?:0|none)$/u.test(value.trim()) && LENGTH.test(value) && !/\bborder\(/u.test(value)) counts.border += 1;
      if (prop === "box-shadow" && value.trim() !== "none" && !/\bshadow\(/u.test(value)) counts.shadow += 1;
      if (TYPE_PROPERTY.test(prop)) counts.type += 1;
    }
    if (/:focus(?:-visible|-within)?\b/u.test(rule.selector) && has(/^(?:outline|box-shadow)$/u)) counts.focus += 1;
    if (!hasRole && declarations.some((decl) => decl.prop === "cursor" && decl.value.trim() === "pointer")) counts.button += 1;
    if (!hasRole && has(/^background(?:-color)?$/u) && has(/^border(?:-(?:top|right|bottom|left))?$/u) && has(RADIUS_PROPERTY)) counts.surface += 1;
  });
  return counts;
}

/** Raw `<button>` elements versus the shared `<Button>` primitive in one component source. */
export function auditComponent(source) {
  return { rawButtons: source.match(/<button[\s>]/gu)?.length ?? 0, sharedButtons: source.match(/<Button[\s>]/gu)?.length ?? 0 };
}

function files(directory, pattern) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name.startsWith(".") ? [] : files(full, pattern);
    return pattern.test(entry.name) ? [full] : [];
  });
}

export function auditProject(rootDirectory) {
  const source = path.join(rootDirectory, "src");
  const stylesheets = Object.fromEntries(files(source, /\.uxdsl$/u).sort().map((file) =>
    [path.relative(rootDirectory, file), auditStylesheet(readFileSync(file, "utf8"), file)]));
  const components = files(source, /\.tsx$/u).filter((file) => !/\.test\.tsx$/u.test(file))
    .map((file) => auditComponent(readFileSync(file, "utf8")))
    .reduce((total, counts) => ({ rawButtons: total.rawButtons + counts.rawButtons, sharedButtons: total.sharedButtons + counts.sharedButtons }), { rawButtons: 0, sharedButtons: 0 });
  const totals = Object.fromEntries(CATEGORIES.map((category) => [category, Object.values(stylesheets).reduce((sum, counts) => sum + counts[category], 0)]));
  return { stylesheets, totals, components };
}

/** Every (file, category) whose count grew past the baseline; new files are compared against zero. */
export function regressions(current, baseline) {
  const grown = [];
  for (const [file, counts] of Object.entries(current.stylesheets)) {
    for (const category of CATEGORIES) {
      if (category === "exception") continue;
      const before = baseline.stylesheets?.[file]?.[category] ?? 0;
      if (counts[category] > before) grown.push({ file, category, before, now: counts[category] });
    }
  }
  if (current.components.rawButtons > (baseline.components?.rawButtons ?? 0)) {
    grown.push({ file: "src/**/*.tsx", category: "rawButtons", before: baseline.components?.rawButtons ?? 0, now: current.components.rawButtons });
  }
  return grown;
}

function table(report) {
  const short = (file) => file.replace(/^src\/app\//u, "").replace(/\.module\.uxdsl$|\.uxdsl$/u, "");
  const width = Math.max(...Object.keys(report.stylesheets).map((file) => short(file).length), 6);
  const row = (name, counts) => `${name.padEnd(width)}  ${CATEGORIES.map((category) => String(counts[category]).padStart(category.length)).join("  ")}`;
  return [
    `${"".padEnd(width)}  ${CATEGORIES.join("  ")}`,
    ...Object.entries(report.stylesheets).map(([file, counts]) => row(short(file), counts)),
    row("TOTAL", report.totals),
    "",
    `Components: ${report.components.rawButtons} raw <button>, ${report.components.sharedButtons} shared <Button>.`,
  ].join("\n");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const baselinePath = path.join(rootDirectory, "docs/uxdsl-alignment.baseline.json");
  const report = auditProject(rootDirectory);
  const args = new Set(process.argv.slice(2));
  if (args.has("--update")) {
    writeFileSync(baselinePath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Baseline written to ${path.relative(rootDirectory, baselinePath)}.`);
  } else if (args.has("--check")) {
    if (!existsSync(baselinePath)) throw new Error("No baseline yet: run with --update first.");
    const grown = regressions(report, JSON.parse(readFileSync(baselinePath, "utf8")));
    if (grown.length) {
      console.error("UXDSL alignment regressed (use a theme role or token, or mark a documented exception):");
      for (const item of grown) console.error(`  ${item.file}: ${item.category} ${item.before} -> ${item.now}`);
      process.exit(1);
    }
    console.log("UXDSL alignment: no category grew past the baseline.");
  } else {
    console.log(args.has("--json") ? JSON.stringify(report, null, 2) : table(report));
  }
}
