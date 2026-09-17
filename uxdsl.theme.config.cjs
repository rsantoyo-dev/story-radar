/* eslint-disable @typescript-eslint/no-require-imports */

const { theme } = require("./uxdsl.config.js");

/**
 * Canonical theme-data file, auto-discovered by uxdsl-cli next to
 * `uxdsl.config.cjs` and shared across every entry in that file's `builds`
 * array — one source of truth for the whole project.
 *
 * `theme.breakpoints` lives inside `theme` (see uxdsl.config.js) on
 * purpose: the plugin only reads it when nothing sets `breakpoints` at the
 * top level of a build config, so `uxdsl.config.cjs` must never declare
 * its own `breakpoints` — that would shadow this file's entirely, not
 * merge with it.
 *
 * `references.externalTokens` tells the reference-integrity check that a
 * variable with no fallback (the host's Next/font variables) is guaranteed
 * by the app shell, not something UXDSL itself defines.
 */
module.exports = {
  theme,
  references: {
    externalTokens: ["--font-geist-sans", "--font-geist-mono"],
  },
};
