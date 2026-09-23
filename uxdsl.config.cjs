/* eslint-disable @typescript-eslint/no-require-imports */

const path = require("node:path");

/**
 * Single orchestration file for all five UXDSL entries. Neither `theme` nor
 * `breakpoints` is declared here — both are deliberately absent:
 * uxdsl-cli 0.5.0-beta.6 auto-discovers `uxdsl.theme.config.cjs` next to
 * this file and shares its `theme` (which nests `breakpoints` inside it)
 * across every build below. Setting `breakpoints` at this top level would
 * shadow the theme file's entirely rather than merge with it — see
 * uxdsl.config.js for why breakpoints live inside `theme`.
 *
 * Only the theme entry sets `includeTheme: true`; it's the sole emitter of
 * the global `:root` token blocks. Every CSS Module panel stays at the
 * library's own default (`includeTheme: false` is `builds`' default too,
 * but kept explicit here since the mismatch is the exact class of bug this
 * project hit twice already).
 */
module.exports = {
  builds: [
    {
      entry: path.join(__dirname, "src/app/uxdsl.uxdsl"),
      outFile: path.join(__dirname, "src/app/uxdsl.css"),
      includeTheme: true,
    },
    {
      entry: path.join(__dirname, "src/app/radar-dashboard.module.uxdsl"),
      outFile: path.join(
        __dirname,
        "src/app/radar-dashboard.generated.module.css",
      ),
      includeTheme: false,
    },
    {
      entry: path.join(
        __dirname,
        "src/app/creative-draft-workspace.module.uxdsl",
      ),
      outFile: path.join(
        __dirname,
        "src/app/creative-draft-workspace.generated.module.css",
      ),
      includeTheme: false,
    },
    {
      entry: path.join(
        __dirname,
        "src/app/editorial-profile-panel.module.uxdsl",
      ),
      outFile: path.join(
        __dirname,
        "src/app/editorial-profile-panel.generated.module.css",
      ),
      includeTheme: false,
    },
    {
      entry: path.join(
        __dirname,
        "src/app/topic-configuration-panel.module.uxdsl",
      ),
      outFile: path.join(
        __dirname,
        "src/app/topic-configuration-panel.generated.module.css",
      ),
      includeTheme: false,
    },
  ],
  // uxdsl.config.cjs and uxdsl.theme.config.cjs are auto-watched by the CLI,
  // and since beta.4 (MIG-B4-02) so is everything they `require()`
  // transitively — uxdsl.config.js included, with no entry needed here.
  // Confirmed live against a throwaway watcher: editing only uxdsl.config.js
  // now triggers a rebuild with zero explicit `watch` entries at all.
  watch: ["src/app/**/*.uxdsl"],
};
