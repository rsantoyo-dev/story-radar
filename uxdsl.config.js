// Keys are bare scale steps: the theme generator emits each one as
// `--space-<key>`, which `density()`, `radius()` and `space()` then resolve
// against. Prefixing a key here produces `--space-space-1` and silently
// breaks every spacing token in the app.
const spacing = {
  1: "0.125rem",
  2: "0.25rem",
  3: "0.5rem",
  4: "0.75rem",
  5: "1rem",
  6: "1.5rem",
  7: "2rem",
  8: "2.5rem",
  9: "3.125rem",
  10: "3.875rem",
  11: "4.875rem",
  12: "6.125rem",
  13: "7.75rem",
  14: "9.75rem",
  15: "12.25rem",
  16: "15.375rem",
};

module.exports = {
  theme: {
    // Lives inside `theme`, not as a sibling: the plugin only reads
    // `theme.breakpoints` when `opts.breakpoints` is completely absent —
    // any top-level `breakpoints` (e.g. on the CLI's own config) shadows
    // this entirely rather than merging with it.
    breakpoints: {
      xs: 0,
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
    },
    fonts: {
      families: {
        ui: "var(--font-geist-sans, Arial, sans-serif)",
        "ui-2": "var(--font-geist-sans, Arial, sans-serif)",
        code: "var(--font-geist-mono, ui-monospace, monospace)",
      },
      // postcss-uxdsl 0.5.0-beta.6 made DEFAULT_THEME the full base theme,
      // which now ships `fonts.google: ["Inter:wght@400;500;600;700"]` unless
      // a project's own theme sets `fonts.google` itself (see that package's
      // CHANGELOG, "0.5.0-beta.6" / MIG-B6-16). This app only uses the Geist
      // fonts Next's own `next/font` already loads locally (the `ui`/`code`
      // vars above; `externalTokens` in uxdsl.theme.config.cjs). Left unset,
      // the default silently emitted an unrequested
      // `@import url('https://fonts.googleapis.com/css2?family=Inter...')`
      // into uxdsl.css, after the `:root` block — not just an unwanted
      // network fetch, but a real CSS spec violation (`@import` must precede
      // every other rule). An explicit empty array replaces the default's
      // array whole (deepMergeTheme's array semantics; arrays are never
      // merged/concatenated) and emits no import at all.
      google: [],
    },
    // No custom palette: we are the only people using this app right now, so
    // it stays on postcss-uxdsl's own stock palette (and stock light/dark
    // modes, which are designed to match each other) instead of our own
    // brand colors. Bring the green/terracotta palette back — see git
    // history for its last values — once this UI has real visitors.
    spacing,
    typography_details: {
      h1: { fontSize: "clamp(var(--uxdsl__space__7), 4vw, var(--uxdsl__space__10))" },
      h2: { fontSize: "clamp(var(--uxdsl__space__6), 3vw, var(--uxdsl__space__8))" },
      h3: { fontSize: "var(--uxdsl__space__6)" },
      h4: { fontSize: "var(--uxdsl__space__5)" },
      h5: { fontSize: "var(--uxdsl__space__5)" },
      h6: { fontSize: "var(--uxdsl__space__4)" },
      body: { fontSize: "1rem", lineHeight: "1.6", fontWeight: "400" },
      p: { fontSize: "1rem" },
      span: { fontSize: "1rem" },
      small: { fontSize: "0.875rem", lineHeight: "1.4" },
      caption: { fontSize: "0.75rem" },
      code: { fontSize: "0.875rem" },
      pre: { fontSize: "0.875rem" },
    },
  },
};
