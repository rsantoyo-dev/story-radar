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

// One focus ring and one disabled look for every action. Every state a role
// uses is spelled out: a custom role otherwise inherits the stock hover and
// selected colors (a dark fill), which none of these designs use.
const focusvisible = { outline: "border(focus)", "outline-offset": "space(1)" };
const disabled = { opacity: "0.45", cursor: "not-allowed" };
const actionButton = ({ bg, color, border, radius = "radius(2)", padding = "0 density(4)", hover = {}, selected = {} }) => ({
  surface: "flat",
  base: { padding, radius, bg, color, border, shadow: "none", cursor: "pointer" },
  states: { hover: { bg, color, border, ...hover }, selected: { bg, color, border, ...selected }, focusvisible, disabled },
});
// Text-only actions (links, disclosure summaries, icon buttons): no box.
const textButton = (color, hoverColor = color) => actionButton({
  bg: "transparent", color, border: "none", radius: "0", padding: "0",
  hover: { color: hoverColor }, selected: { color: hoverColor },
});

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
      // CHANGELOG, "0.5.0-beta.6" / MIG-B6-16). Since beta.7 that import is
      // emitted first, where browsers honor it (MIG-B7-14), so leaving it
      // unset would now really request Google Fonts. This app only uses the Geist
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
      // Interface text, one role per size and weight the panels use, on a
      // 10 px floor (nothing smaller is legible on a phone). Components pick
      // a role; none sets its own font-size, weight or tracking.
      monogram: { fontSize: "2.5rem", fontWeight: "700", lineHeight: "1" },
      figure: { fontSize: "1.75rem", fontWeight: "700", lineHeight: "1.1" },
      "title-lg": { fontSize: "1.25rem", fontWeight: "700", lineHeight: "1.25" },
      "title": { fontSize: "1.125rem", fontWeight: "700", lineHeight: "1.3" },
      "title-sm": { fontSize: "1rem", fontWeight: "700", lineHeight: "1.35" },
      "body-strong": { fontSize: "1rem", fontWeight: "700", lineHeight: "1.5" },
      "small-strong": { fontSize: "0.875rem", fontWeight: "700", lineHeight: "1.4" },
      compact: { fontSize: "0.8125rem", lineHeight: "1.5" },
      "compact-strong": { fontSize: "0.8125rem", fontWeight: "700", lineHeight: "1.35" },
      label: { fontSize: "0.75rem", fontWeight: "700", lineHeight: "1.4" },
      meta: { fontSize: "0.6875rem", lineHeight: "1.45" },
      "meta-strong": { fontSize: "0.6875rem", fontWeight: "700", lineHeight: "1.4" },
      fine: { fontSize: "0.625rem", lineHeight: "1.45" },
      "fine-strong": { fontSize: "0.625rem", fontWeight: "700", lineHeight: "1.35" },
      eyebrow: { fontSize: "0.6875rem", fontWeight: "800", lineHeight: "1.3", letterSpacing: "0.12em", textTransform: "uppercase" },
      badge: { fontSize: "0.625rem", fontWeight: "800", lineHeight: "1.2", letterSpacing: "0.06em", textTransform: "uppercase" },
      button: { fontSize: "0.8125rem", fontWeight: "700", lineHeight: "1.2" },
      "code-sm": { fontFamily: "var(--uxdsl__font__code), monospace", fontSize: "0.75rem", lineHeight: "1.5" },
      // Weight changes inside surrounding text: the size, leading and family
      // stay those of the parent.
      emphasis: { fontFamily: "inherit", fontSize: "inherit", lineHeight: "inherit", letterSpacing: "inherit", fontWeight: "700" },
      regular: { fontFamily: "inherit", fontSize: "inherit", lineHeight: "inherit", letterSpacing: "inherit", fontWeight: "400" },
      // Form controls and buttons that take their parent's text.
      inherit: { fontFamily: "inherit", fontSize: "inherit", lineHeight: "inherit", letterSpacing: "inherit", fontWeight: "inherit" },
      // Multi-line fields keep their parent's text with a reading leading.
      multiline: { fontFamily: "inherit", fontSize: "inherit", lineHeight: "1.5", letterSpacing: "inherit", fontWeight: "inherit" },
      // Display sizes: page headers, the Today hero and its figures.
      "display-xl": { fontSize: "clamp(2.375rem, 6vw, 4.375rem)", fontWeight: "620", lineHeight: "0.98", letterSpacing: "-0.062em" },
      "display-lg": { fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: "700", lineHeight: "1.1", letterSpacing: "-0.05em" },
      display: { fontSize: "clamp(1.5rem, 2.4vw, 2rem)", fontWeight: "700", lineHeight: "1.15", letterSpacing: "-0.04em" },
      metric: { fontSize: "xs(2.125rem) md(space(8))", fontWeight: "600", lineHeight: "1.6", letterSpacing: "-0.06em" },
      headline: { fontSize: "space(6)", fontWeight: "620", lineHeight: "1.6", letterSpacing: "-0.05em" },
      "section-title": { fontSize: "space(5)", fontWeight: "650", lineHeight: "1.3", letterSpacing: "-0.03em" },
      brand: { fontSize: "space(5)", fontWeight: "700", lineHeight: "1", letterSpacing: "-0.04em" },
      "brand-sm": { fontSize: "0.95rem", fontWeight: "700", lineHeight: "1.2", letterSpacing: "-0.02em" },
      // Glyphs and icons sized as text.
      "icon-xs": { fontSize: "space(3)", lineHeight: "1" },
      "icon-sm": { fontSize: "space(4)", lineHeight: "1" },
      icon: { fontSize: "space(5)", lineHeight: "1" },
      "icon-lg": { fontSize: "space(6)", lineHeight: "1" },
      // The document's base text.
      document: { fontFamily: "var(--font-geist-sans), Arial, Helvetica, sans-serif", fontSize: "1rem", fontWeight: "400", lineHeight: "normal", letterSpacing: "normal" },
    },
    // Edges the panels share. Hairlines and dividers are translucent dark so
    // they read on any surface; colored edges carry a state.
    borders: {
      hairline: "1px solid palette(dark-main, 0.08)",
      strong: "1px solid palette(dark-main, 0.16)",
      subtle: "1px solid palette(surface-light)",
      control: "1px solid palette(surface-dark)",
      light: "1px solid palette(light-light)",
      neutral: "1px solid palette(neutral-main)",
      "neutral-soft": "1px solid palette(neutral-light)",
      primary: "1px solid palette(primary-main)",
      "primary-soft": "1px solid palette(primary-light)",
      "primary-strong": "1px solid palette(primary-dark)",
      warning: "1px solid palette(warning-light)",
      "warning-strong": "1px solid palette(warning-main)",
      error: "1px solid palette(error-light)",
      dashed: "1px dashed palette(dark-main, 0.2)",
      "dashed-control": "1px dashed palette(surface-dark)",
      "dashed-subtle": "1px dashed palette(surface-light)",
      "accent-bar": "3px solid palette(primary-main)",
      focus: "2px solid palette(primary-main)",
      "focus-soft": "2px solid palette(primary-light)",
      "focus-strong": "3px solid palette(dark-main)",
      inverse: "2px solid palette(light-light)",
      clear: "2px solid transparent",
      "clear-thin": "1px solid transparent",
      current: "1px solid currentColor",
      info: "1px solid palette(info-light)",
      "info-accent": "1px solid palette(info-main)",
      "info-strong": "1px solid palette(info-dark)",
      success: "1px solid palette(success-main)",
      "warning-soft": "1px solid palette(warning-main, 0.4)",
      "warning-dark": "1px solid palette(warning-dark)",
      "error-soft": "1px solid palette(error-main, 0.35)",
      "error-strong": "1px solid palette(error-main)",
      "neutral-strong": "1px solid palette(neutral-dark)",
      "primary-faint": "1px solid palette(primary-main, 0.25)",
      "light-soft": "1px solid palette(light-light, 0.68)",
      "dashed-primary": "1px dashed palette(primary-main)",
      "accent-secondary": "2px solid palette(secondary-main)",
      "focus-error": "2px solid palette(error-main)",
      // Strokes that draw small glyphs (chevrons, the logo mark).
      stroke: "1.5px solid currentColor",
      "stroke-primary": "1.5px solid palette(primary-light)",
    },
    // Containers. Each composes a Border, a Radius and a Palette background;
    // padding is left to the component (0 here), since containers of one
    // look come in many sizes.
    surfaces: {
      card: { padding: "0", radius: "radius(2)", bg: "palette(light-light)", color: "inherit", border: "border(subtle)", shadow: "none" },
      panel: { padding: "0", radius: "radius(2)", bg: "palette(light-light)", color: "inherit", border: "border(hairline)", shadow: "none" },
      boxed: { padding: "0", radius: "radius(2)", bg: "palette(light-light)", color: "inherit", border: "border(control)", shadow: "none" },
      callout: { padding: "0", radius: "radius(2)", bg: "palette(light-light)", color: "inherit", border: "border(primary-soft)", shadow: "none" },
      dropzone: { padding: "0", radius: "radius(2)", bg: "palette(light-light)", color: "inherit", border: "border(dashed-control)", shadow: "none" },
      "notice-warning": { padding: "0", radius: "radius(2)", bg: "palette(warning-light)", color: "inherit", border: "border(warning)", shadow: "none" },
      "notice-error": { padding: "0", radius: "radius(2)", bg: "palette(light-light)", color: "inherit", border: "border(error)", shadow: "none" },
      "notice-success": { padding: "0", radius: "radius(2)", bg: "color-mix(in srgb, palette(success-main) 10%, palette(light-light))", color: "inherit", border: "border(success)", shadow: "none" },
    },
    // Actions: filled, outlined, on-image, chip, tab and text styles.
    buttons: {
      primary: actionButton({ bg: "palette(primary-dark)", color: "palette(light-light)", border: "border(primary-strong)", hover: { bg: "palette(primary-main)", border: "border(primary)" } }),
      secondary: actionButton({ bg: "palette(light-light)", color: "palette(primary-dark)", border: "border(hairline)", hover: { border: "border(primary)" }, selected: { bg: "palette(primary-light, 0.2)", border: "border(primary)" } }),
      warning: actionButton({ bg: "palette(warning-light)", color: "palette(warning-dark)", border: "border(warning-strong)" }),
      danger: actionButton({ bg: "palette(error-main)", color: "palette(light-light)", border: "border(error-strong)", hover: { bg: "palette(error-dark)" } }),
      "danger-outline": actionButton({ bg: "palette(light-light)", color: "palette(error-main)", border: "border(error)", hover: { border: "border(error-strong)" } }),
      info: actionButton({ bg: "palette(light-light)", color: "palette(info-dark)", border: "border(info-accent)", hover: { border: "border(info-strong)" } }),
      neutral: actionButton({ bg: "palette(light-light)", color: "palette(neutral-dark)", border: "border(neutral-strong)" }),
      // A round approve toggle laid over an image: aria-pressed turns it green.
      check: actionButton({ bg: "palette(dark-main, 0.5)", color: "palette(light-light)", border: "border(inverse)", radius: "radius(circle)", padding: "0",
        hover: { bg: "palette(success-dark)" }, selected: { bg: "palette(success-main)", color: "palette(success-contrast)" } }),
      chip: actionButton({ bg: "palette(light-light)", color: "palette(primary-dark)", border: "border(hairline)", radius: "radius(pill)", padding: "0 density(3)", hover: { border: "border(primary)" }, selected: { bg: "palette(primary-light, 0.2)", border: "border(primary)" } }),
      tinted: actionButton({ bg: "palette(primary-light, 0.2)", color: "palette(primary-dark)", border: "border(primary-faint)", hover: { border: "border(primary)" } }),
      outline: actionButton({ bg: "transparent", color: "inherit", border: "border(current)" }),
      tab: actionButton({ bg: "transparent", color: "palette(tertiary-main)", border: "none", radius: "0", padding: "density(2) density(4)", hover: { color: "palette(primary-dark)" }, selected: { color: "palette(primary-dark)" } }),
      text: textButton("inherit"),
      link: textButton("palette(primary-dark)"),
      "link-accent": textButton("palette(primary-main)", "palette(primary-dark)"),
      "link-muted": textButton("palette(tertiary-dark)", "palette(primary-dark)"),
      "link-dark": textButton("palette(dark-main)", "palette(primary-dark)"),
      "link-danger": textButton("palette(error-main)", "palette(error-dark)"),
      "link-warning": textButton("palette(warning-dark)"),
    },
    // Text fields. Native :invalid matches an empty required field before the
    // reader types, so the invalid state keeps the resting edge.
    inputs: {
      field: { surface: "panel", base: { padding: "density(2) density(3)", radius: "radius(2)", caret: "palette(primary-main)", placeholder: "palette(tertiary-main)" },
        states: { focus: { border: "border(primary)", shadow: "shadow(ring)" }, invalid: { border: "border(hairline)" }, focusvisible, disabled: { opacity: "0.6" } } },
    },
    // Elevations and rings beyond the stock 0–5 scale.
    shadows: {
      ring: "0 0 0 3px palette(primary-main, 0.12)",
      "ring-success": "0 0 0 3px palette(success-main, 0.2)",
      "ring-error": "0 0 0 3px palette(error-main, 0.18)",
      selected: "0 0 0 2px palette(primary-main), 0 1px 2px rgba(0, 0, 0, 0.05), 0 2px 6px rgba(0, 0, 0, 0.12)",
      float: "0 9px 22px palette(primary-dark, 0.14)",
      "float-info": "0 9px 22px palette(info-dark, 0.18)",
      overlay: "0 30px 90px palette(dark-main, 0.3)",
      "inset-primary": "inset 3px 0 0 palette(primary-main)",
      "inset-secondary": "inset 3px 0 0 palette(secondary-main)",
      "inset-outline": "inset 0 0 0 1px palette(primary-main)",
      "inset-highlight": "inset 0 1px 0 palette(light-light, 0.7)",
    },
  },
};
