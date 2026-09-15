# UXDSL Agent Guide — Press Craftor

Implementation reference for the UXDSL version installed in this repository.
Read this before creating or modifying UI styles. Where this guide and prior
UXDSL knowledge disagree, the installed package wins: verify against
`node_modules/postcss-uxdsl/src/`.

**Installed version: `0.5.0-beta.0`** (`postcss-uxdsl`, `uxdsl-cli`,
`uxdsl-core`, `vite-plugin-uxdsl`, pinned exactly because the beta's grammar is
not compatible with `0.3.x`).

---

## 1. Where things live

| File | Role |
| --- | --- |
| `uxdsl.config.js` | The theme: breakpoints, palette, spacing, typography, fonts. Single source of truth. |
| `uxdsl.config.shared.cjs` | Factory that builds each entry's config. `includeTheme` decides whether the theme is passed. |
| `uxdsl.theme.config.cjs` | Theme entry → emits **global** tokens. |
| `uxdsl.{config,creative,editorial,topic}.config.cjs` | One per UI bundle → emits **CSS Modules**. |
| `postcss-uxdsl-source.cjs` | PostCSS guard applied to already-compiled output (see §3). |

Entries and their outputs:

| Source | Output | Kind |
| --- | --- | --- |
| `src/app/uxdsl.uxdsl` | `src/app/uxdsl.css` | global, imported in `layout.tsx` |
| `src/app/radar-dashboard.module.uxdsl` | `radar-dashboard.generated.module.css` | CSS Module |
| `src/app/creative-draft-workspace.module.uxdsl` | `creative-draft-workspace.generated.module.css` | CSS Module |
| `src/app/editorial-profile-panel.module.uxdsl` | `editorial-profile-panel.generated.module.css` | CSS Module |
| `src/app/topic-configuration-panel.module.uxdsl` | `topic-configuration-panel.generated.module.css` | CSS Module |

Never edit a `*.generated.module.css` by hand. Edit the `.uxdsl` source and
rebuild.

---

## 2. The token chain

Every spacing and radius value resolves through three hops:

```text
padding: var(--density-2)  →  --density-2: var(--space-2)  →  --space-2: 0.25rem
```

Only the theme entry emits the definitions; the module bundles only reference
them. This is why `src/app/uxdsl.css` must stay imported globally.

**Spacing keys in `uxdsl.config.js` must be bare scale steps** (`1:`, `2:`, …),
never `"space-1"`. The generator emits each key as `--space-<key>`
(`foundations.ts`), so a prefixed key produces `--space-space-1`, which nothing
references. The failure is silent: the build passes and every padding and
border-radius in the app resolves to nothing.

---

## 3. Why compiled modules are post-processed

Since `0.5.0-beta.0` the CLI writes the global token blocks (density, shadow,
radius/border, surface, button, input) into **every** entry it builds,
including the CSS Modules. Those blocks duplicate the theme output verbatim and
CSS Modules reject them outright (`Selector ":root" is not pure`).

`postcss-uxdsl-source.cjs` strips `:root` rules and now-empty `@media` wrappers
from `*.generated.module.css`, and skips running the UXDSL plugin over them.
It runs in PostCSS rather than as a post-build step so `next build` and
`next dev` behave the same. Do not remove it while this UXDSL version is
installed; if a future version stops emitting the blocks, delete the guard and
its test together.

---

## 4. Control primitives

```css
@ds-surface(role tone size);
@ds-button(role tone size);
@ds-input(role tone size);
```

All three arguments are optional and order-independent.

- **role** — `contained` | `outlined` | `flat` (inputs also accept `underline`). Defaults to `contained`.
- **tone** — any palette family (see §6). Omit for the role's neutral default.
- **size** — a single integer. Sets **both** `padding: var(--density-N)` **and** `border-radius: var(--radius-N)`.

### Breaking change from 0.3.x

`density(n)`, `radius(n)` and `shadow(n)` are **no longer valid as arguments**.

```css
/* 0.3.x — now throws UXD_BUTTON_ARGUMENT */
@ds-button(outlined neutral density(2) radius(2));

/* 0.5.0 */
@ds-button(outlined neutral 2);
```

The single size cannot express a padding and a radius on different steps, nor a
shadow. Express those as plain declarations **after** the mixin — source order
wins:

```css
.panel {
  @ds-surface(flat light 3);     /* padding density-3, radius radius-3 */
  border-radius: radius(2);      /* override just the radius */
  box-shadow: shadow(1);         /* flat has no shadow by default */
}
```

Omit the size entirely to keep the role's defaults (`density(2)` / `radius(2)`)
when only the radius differs:

```css
.card {
  @ds-surface(flat neutral);
  border-radius: radius(3);
}
```

### Role defaults

| Role | padding | radius | background | border | shadow |
| --- | --- | --- | --- | --- | --- |
| `contained` | `density(2)` | `radius(2)` | `surface-main` | `1px solid surface-dark` | `shadow(1)` |
| `outlined` | `density(2)` | `radius(2)` | transparent | `1px solid neutral-main` | none |
| `flat` | `density(2)` | `radius(2)` | transparent | none | none |

Adding a tone changes the colors by role: `contained` sets background to
`<tone>-main` and text to `<tone>-contrast`; `outlined` sets text **and** border
to `<tone>-main`; `flat` sets only the text to `<tone>-main`.

This project configures no custom surface, button or input roles, so these
defaults apply as-is. A declaration that merely restates a default is noise —
`box-shadow: shadow(1)` after `@ds-surface(contained …)` changes nothing.

---

## 5. Typography

```css
@ds-typo(body);
```

Configured tags: `h1`–`h6`, `p`, `span`, `body`, `small`, `caption`, `code`,
`pre`. Sizes come from `uxdsl.config.js` → `theme.typography` (`h1-size`,
`body-size`, `caption-size`, `code-size`, …). Font families are `ui`, `ui-2`
and `code`.

Typography emits `var(--<tag>-<property>, <default>)`, so an unconfigured
property falls back silently rather than breaking. That is intended — do not
"fix" those by defining every variable.

---

## 6. Scales

| Function | Valid range here | Notes |
| --- | --- | --- |
| `density(n)` | `0`–`15` | Component spacing. **Prefer this over `space()`.** |
| `space(n)` | `1`–`16` | Raw scale step. Use only for intentional exceptions. |
| `radius(n)` | `0`–`5` | Also accepts the keywords `pill`, `full` (both `9999px`) and `circle` (`50%`). |
| `shadow(n)` | `0`–`5` | |
| `border(n)` | `1`–`5` | **Inert in this project — see §7.** |
| `palette(family-variant)` | see below | |

Palette families: `primary`, `secondary`, `surface`, `tertiary`, `success`,
`info`, `warning`, `error`, `dark`, `neutral`, `light`. Each has `main`,
`light`, `dark` and `contrast`.

Breakpoints: `xs: 0`, `sm: 640`, `md: 768`, `lg: 1024`, `xl: 1280`. Use them as
value wrappers, not media queries:

```css
gap: xs(density(2)) md(density(3));
```

Density tokens are already responsive by definition
(`--density-3: xs(space(3)) md(space(4)) xl(space(5))`), so a plain
`padding: density(3)` already adapts. Do not add breakpoint variants on top
unless you want a different curve.

---

## 7. Known traps

**`border(n)` presets do not render.** `DEFAULT_BORDERS` resolves to
`var(--ds__color__gray-300…600)`, and this project never imports
`postcss-uxdsl/theme/default-colors.css` (`src/app/uxdsl.uxdsl` is
comment-only), so those variables are undefined and the whole `border`
declaration is dropped by the browser. Write borders explicitly instead:

```css
border: 1px solid palette(neutral-light);
```

**`density(16)` and above do not exist.** The default map stops at 15. Earlier
versions accepted the reference and emitted a dangling `var(--density-16)`;
`0.5.0` raises `UXD_DENSITY_REFERENCE` instead.

**Never write `:root` in a `*.module.uxdsl` source.** Those compile to CSS
Modules, which reject non-pure selectors. Global tokens belong to the theme
entry.

**Config changes need a rebuild.** Editing `uxdsl.config.js` only takes effect
after `npm run uxdsl:build` (or the dev watcher). `npm run dev` and
`npm run build` both run it first.

---

## 8. Commands

```bash
npm run uxdsl:build     # all five entries, theme first
npm run uxdsl:watch     # rebuild on change (used by npm run dev)
```

Individual entries: `uxdsl:build:theme`, `:dashboard`, `:creative`,
`:editorial`, `:topic`.

---

## 9. Verifying a style change

A UXDSL build can succeed and still produce dead CSS, because an undefined
custom property is only detected at computed-value time. After a change that
touches tokens, the theme, or the config, confirm that every `var(--token)`
used without a fallback is defined somewhere in the compiled output — the
theme CSS plus the generated modules. The two failures this catches are a token
referenced under the wrong name (§2) and a scale step that does not exist (§7).

Then run the normal checks:

```bash
npm run lint
npm run build
```
