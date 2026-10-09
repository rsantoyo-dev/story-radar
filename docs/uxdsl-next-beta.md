# UXDSL — proposals for the next beta

What migrating Press Craftor fully onto UXDSL 0.5.0-beta.8 (8 October 2026)
says the next beta should change. Evidence for each item is in the
[findings log](uxdsl-findings.md), cited as F‑n; the migration itself is
described in [UXDSL alignment](features/uxdsl-alignment.md).

## Verdict

The core idea holds: design decisions live in one theme and components only
choose. Moving ~1,400 literal values to roles and tokens was mechanical (two
PostCSS codemods), which says the language is well designed. What keeps it
from being ready for other teams is a set of **silent behaviors**: the code
says one thing, the browser shows another, and nothing warns.

| Area | Score | Why |
|---|---|---|
| Concept | 9/10 | Functions that read like CSS, roles with states, compile-time validation of references |
| Ergonomics | 7/10 | Custom roles need every default restated; typography roles are all-or-nothing |
| Safety | 5/10 | Ignored arguments, inherited states and root-resolved tokens fail silently |
| Docs and releases | 6/10 | Missing beta.8 notes, internal jargon, two palette spellings |
| **Overall** | **7/10** | Items 1 and 2 below would take it to 8.5–9 |

## What to keep

- **Plain functions** (`palette()`, `density()`, `radius()`, `border()`, `shadow()`): readable in a diff and transformable by tools.
- **Roles with states:** 23 Button roles replaced 85 hand-built buttons, with focus, hover and disabled defined once.
- **Failing on unknown references** (`UXD_TYPO_REFERENCE` and friends): it caught mistakes during the migration immediately.
- **Upgrade stability:** beta.6 → beta.8 changed no compiled component CSS (F‑8).
- **A JavaScript theme:** a helper generated 23 Button roles without repeating their states.

## Proposals, by priority

### 1. Composite tokens must follow a scoped palette (F‑16)

**Problem.** Border, Shadow, Surface, Button and Input variables are declared on
`:root` as `var(--uxdsl__palette__…)` and resolve there, once. An element that
sets its own `--uxdsl__palette__*` (a theme per brand, a dark section) keeps
the root colors in every preset and role, while direct `palette()` calls
follow it. Nothing fails; it only looks wrong.

**Proposal**, either:
- compile presets at the point of use (`border: border(primary)` →
  `border: 1px solid var(--uxdsl__palette__primary-main)`), so `var()` resolves
  on the element; or
- expose a `scope` option that emits the composite tokens for
  `:root, <selector>` (the generators already take a selector; the plugin
  hard-codes `:root`).

**Done when** a container that overrides `--uxdsl__palette__primary-main`
shows that color in `border(primary)`, `@ds-surface(card)` and
`@ds-button(primary)` with no project code. Press Craftor's workaround (a
PostCSS step that re-declares composites on `[style*="--uxdsl__palette__"]`)
can then be deleted.

### 2. Nothing is dropped or overridden silently (F‑10, F‑11, F‑12, F‑9)

| Behavior today | Proposal |
|---|---|
| `border(n, color, style)` ignores `color` and `style` when preset `n` exists (37 edges rendered gray instead of the requested color) | A compile warning, or an error under a strict flag |
| A custom Button role inherits the stock `hover`/`selected` dark fill | Custom roles start from neutral states (states default to the role's own base), or warn when a role leaves them implicit |
| A custom role inherits `contained`'s padding (`density(2)`) and `shadow(1)` | Same: start from the role's own fields, not `contained` |
| `@ds-input` styles native `:invalid`, so an empty required field is red before the reader types | Use `:user-invalid` (and `[aria-invalid="true"]`) |
| `@ds-typo` emits `margin-block: 0`, cancelling a margin written before it (137 rules here) | Warn when a typography directive overrides a declaration earlier in the same rule, or see item 3 |

**Done when** each case either renders what the source asks or produces a
diagnostic that names the rule.

### 3. Typography roles emit only what they declare (F‑13, F‑2, F‑9)

**Problem.** Every role emits size, leading, family, tracking and margins,
with `default` filling the gaps. There is no way to ask for "bold inside the
surrounding text", and margins live in typography. Press Craftor ended with
48 roles, several only to keep one-off sizes, plus `inherit`-valued roles
that inherit from the parent, not from another rule styling the same element.

**Proposal:**
- an opt-in for roles to emit only their own fields (no `default` merge);
- a weight or emphasis modifier, for example `@ds-typo(caption strong)`;
- typography margins off by default, with spacing left to Density.

**Done when** a weight-only change and a margin-free role are expressible
without `inherit` tricks.

### 4. A focus primitive (F‑14, F‑3)

**Problem.** Only Button and Input roles carry a focus state; links,
`summary`, tabs and custom controls each repeat a ring (66 copies here).

**Proposal:** a `focus` token family and a directive or generated rule, for
example `@ds-focus;` or a theme option that emits
`:where(a, button, summary, [tabindex]):focus-visible { … }`.

**Done when** a project gets one consistent ring without hand-written
`:focus-visible` rules.

### 5. Ship the audit and a migration helper

Press Craftor's `scripts/uxdsl-audit.mjs` counts decisions the theme should
own (literal colors, spacing, radii, edges, shadows, type, hand-built
buttons, containers and focus rings), supports a documented-exception
marker, and fails CI when any count grows past a baseline. It was the
reason the migration could be finished and kept finished.

**Proposal:**
- `uxdsl audit [--check] [--update]` with the same categories and the
  `/* uxdsl-exception: <reason> */` marker;
- `uxdsl migrate --suggest`, which proposes the nearest token or role for
  each literal (sizes to the type scale, radii to `radius(n)`, edges and
  shadows to presets) without writing them.

### 6. Release and docs hygiene (F‑4, F‑5, F‑6)

- A CHANGELOG section for every published version (beta.8 has none; beta.7
  still says "unreleased").
- A short "what changes for you" summary at the top of each version, before
  the internal detail (ticket IDs, contrast counts).
- One documented palette spelling: `palette(role.variant)` and
  `palette(role-variant)` both compile; the guide shows one, real projects use
  the other.
- The packaged agent guide should use paths that resolve inside the
  installed package, or say clearly which paths are repository-relative.

### 7. Build integration notes

- In Next.js the CLI writes the theme's `:root` blocks into every generated
  CSS Module, which Next rejects ("Selector :root is not pure"); the project
  strips them in its own PostCSS step. A `--no-theme` flag per entry, or not
  emitting the theme into module entries, would remove that step.
- Next reuses processed CSS when a CSS file is unchanged, even after the
  PostCSS plugin changed. Worth a line in the Next.js integration guide.

## Evidence in this repository

- Theme: `uxdsl.config.js` (48 typography roles, 40 border and 11 shadow
  presets, 8 Surface, 23 Button and 1 Input role, shared state helpers).
- Workarounds the proposals would retire: `postcss-uxdsl-source.cjs`
  (scoped composites, stripped `:root` in modules) and the global focus rule
  in `src/app/uxdsl.uxdsl`.
- Audit and baseline: `scripts/uxdsl-audit.mjs`,
  `docs/uxdsl-alignment.baseline.json`.
- Migration commit: `e092640`.
