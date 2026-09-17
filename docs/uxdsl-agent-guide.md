# UXDSL Agent Guide — Press Craftor

Implementation reference for the UXDSL version installed in this repository.
Read this before creating or modifying UI styles. Where this guide and prior
UXDSL knowledge disagree, the installed package wins: verify against
`node_modules/postcss-uxdsl/src/`.

**Installed version: `0.5.0-beta.4`** (`postcss-uxdsl`, `uxdsl-cli`,
`uxdsl-core`, `vite-plugin-uxdsl`, pinned exactly because the beta's grammar is
not compatible with `0.3.x`).

**Everything compiles from one config file, in one process.** Since
`0.5.0-beta.4`, `uxdsl.config.cjs` declares all five entries in a `builds`
array; `uxdsl build`/`uxdsl watch` with no flags compiles all of them from a
single invocation. This replaced five separate per-entry config files and five
concurrent CLI processes. The build is atomic across the whole array: one
entry failing writes none of the five outputs, rather than leaving some fresh
and some stale.

**Theme data lives in its own file, auto-discovered by the CLI.**
`uxdsl.theme.config.cjs` at the project root — `{ theme, references }`,
sourced from `uxdsl.config.js` — is the one place tokens are declared. The CLI
finds it next to `uxdsl.config.cjs` and shares it across every build in the
array; `postcss.config.mjs`'s separate Next.js-level pass imports the same
file, so the external-token list is declared exactly once project-wide. Do not
repurpose the exact filename `uxdsl.theme.config.cjs` for anything else — the
CLI reserves it and will try to read whatever's there as theme data.

**`includeTheme` is real again.** Before `4`, `uxdsl-cli` accepted
`includeTheme` in a config file but never forwarded it to the plugin — every
CLI-built entry silently got `includeTheme: true` regardless of what the
config said, duplicating the full global token set into every CSS Module. Now
it's forwarded correctly: only the theme entry (`includeTheme: true` in
`uxdsl.config.cjs`'s `builds` array) emits `:root`; the four panel entries
default to `false` and stay clean. Verified empirically on this project: the
panel bundles shrank 19–78% and dropped to zero `:root` blocks the moment the
flag started working.

**A library-default typography change landed in beta.2, undocumented at the
time.** `h2`/`h3` line-height tightens at `md` and up (`1.2→1.15`,
`1.3→1.25`) even though this project's `typography_details` never configured
`line` for either tag — it comes from a shared default heading typography the
library added. Retroactively documented in beta.3's changelog. Verified
harmless and left as-is; `uxdsl theme --diff` (see §8) confirms both values
still read `"source": "default"`, not `"project"`. Pin `line` explicitly under
`typography_details` in `uxdsl.config.js` if a fixed value is ever wanted
instead.

---

## 1. Where things live

| File | Role |
| --- | --- |
| `uxdsl.config.js` | Raw data: breakpoints, palette, spacing, typography, fonts. Single source of truth for design tokens. |
| `uxdsl.theme.config.cjs` | `{ theme, references }`, sourced from `uxdsl.config.js`. Auto-discovered by `uxdsl-cli` — **do not** repurpose this exact filename for anything else. |
| `uxdsl.config.cjs` | The one build/watch orchestration file: `breakpoints`, a `builds` array (all five entries), and `watch` globs. No `theme` here — that's the file above. |
| `postcss-uxdsl-source.cjs` | PostCSS guard applied to already-compiled output for the separate Next.js-level pass (see §3). |

Entries and their outputs (all five declared in `uxdsl.config.cjs`'s `builds`
array, in this order):

| Source | Output | Kind |
| --- | --- | --- |
| `src/app/uxdsl.uxdsl` | `src/app/uxdsl.css` | global, `includeTheme: true`, imported in `layout.tsx` |
| `src/app/radar-dashboard.module.uxdsl` | `radar-dashboard.generated.module.css` | CSS Module |
| `src/app/creative-draft-workspace.module.uxdsl` | `creative-draft-workspace.generated.module.css` | CSS Module |
| `src/app/editorial-profile-panel.module.uxdsl` | `editorial-profile-panel.generated.module.css` | CSS Module |
| `src/app/topic-configuration-panel.module.uxdsl` | `topic-configuration-panel.generated.module.css` | CSS Module |

Never edit a `*.generated.module.css` by hand. Edit the `.uxdsl` source and
rebuild. Adding a sixth entry means adding one object to the `builds` array —
no new config file, no new npm script.

---

## 2. The token chain

Every spacing and radius value resolves through three hops:

```text
padding: var(--uxdsl__density__2)  →  --uxdsl__density__2: var(--uxdsl__space__2)  →  --uxdsl__space__2: 0.25rem
```

Only the theme entry emits the definitions; the module bundles only reference
them. This is why `src/app/uxdsl.css` must stay imported globally.

**Spacing keys in `uxdsl.config.js` must be bare scale steps** (`1:`, `2:`, …),
never `"space-1"`. The generator emits each key as `--space-<key>`
(`foundations.ts`), so a prefixed key produces `--space-space-1`, which nothing
references. The failure is silent: the build passes and every padding and
border-radius in the app resolves to nothing.

---

## 3. Why the compiled panels are still post-processed

`includeTheme` now correctly suppresses `:root` in every CLI-built panel (see
above), so the raw output of `uxdsl build` is already clean. The Next.js-level
`postcss.config.mjs` pass still wraps `postcss-uxdsl` in
`postcss-uxdsl-source.cjs`, which skips re-running the plugin over any
`*.generated.module.css` file entirely — this remains correct and cheap even
though there's nothing left to strip. Do not remove the guard: it is what lets
`next build`/`next dev` reprocess `src/app/uxdsl.css` (for the global pass)
without re-validating references on files the CLI already compiled and
validated once.

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
`pre`. Sizes come from `uxdsl.config.js` → `theme.typography_details`
(`h1.fontSize`, `body.fontSize`, `caption.fontSize`, `code.fontSize`, …).
Font families are `ui`, `ui-2` and `code`.

Typography emits `var(--<tag>-<property>, <default>)`, so an unconfigured
property falls back silently rather than breaking. That is intended — do not
"fix" those by defining every variable. Use `uxdsl theme --diff` (§8) to see
exactly which typography leaves are the project's own vs. inherited.

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
entry, and only the theme entry, via `includeTheme: true`.

**A `uxdsl.theme.config.cjs` shaped like a build config gets a CLI warning,
not silent misuse.** If it has `entry`/`outFile`/`watch`/`builds` but no
`theme`/`references` key, `uxdsl-cli` now names the file and the stray keys
instead of trying to use it as theme data. Still — never create a second file
with this exact name for a different purpose.

**Config changes need a rebuild.** Editing `uxdsl.config.js` or
`uxdsl.theme.config.cjs` only takes effect after `npm run uxdsl:build` (or the
dev watcher — both are in `uxdsl.config.cjs`'s `watch` globs, so editing them
while `npm run dev` is running does trigger a rebuild).

---

## 8. Commands

```bash
npm run uxdsl:build     # all five entries, one process, atomic
npm run uxdsl:watch     # same, then rebuild on change (used by npm run dev)
```

```bash
npx uxdsl theme                    # resolved effective theme as JSON
npx uxdsl theme --diff             # only the leaves this project's config mentions,
                                    # each labeled "project" or "default"
npx uxdsl theme --diff --strict    # same, exits non-zero if any declared family
                                    # is only partially filled in (see §5)
```

`UXDSL_DEBUG=1` in front of any command prints which config and theme files
were discovered and which external tokens were loaded (never their values).

---

## 9. Verifying a style change

A UXDSL build can succeed and still produce dead CSS, because an undefined
custom property is only detected at computed-value time. After a change that
touches tokens, the theme, or the config, confirm that every `var(--token)`
used without a fallback is defined somewhere in the compiled output — the
theme CSS plus the generated modules. The two failures this catches are a token
referenced under the wrong name (§2) and a scale step that does not exist (§7).

For a theme change specifically, `npx uxdsl theme --diff --strict` (§8) is
faster than inspecting compiled CSS — it says directly which values are the
project's own and which silently fell back to a library default.

Then run the normal checks:

```bash
npm run lint
npm run build
```
