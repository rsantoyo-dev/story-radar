# UXDSL alignment

**Status:** Phases 0–3 done on 8 October 2026: every stylesheet audits at zero findings, with 7 documented exceptions. Phase 4 (components) and UXA-10 pending.
**Owner:** Press Craftor UI.
**Stories:** [UXA-00–09](uxdsl-alignment.kanban.md) — resume with UXA-01.
**Related:** [UI/UX consistency](ui-ux-consistency.md) · [UXDSL agent guide](../uxdsl-agent-guide.md) · [UXDSL findings log](../uxdsl-findings.md)

## Goal

Every styling decision in the app is expressed through UXDSL: theme roles
(Typography, Surface, Button, Input) and tokens (Palette, Density, Radius,
Border, Shadow). Native CSS remains for layout and behaviour (display, grid,
flex, position, overflow, sizing of layout boxes, transitions) and for
documented exceptions.

This repository is the reference project for UXDSL. Full alignment is how we
learn what UXDSL does well and where it falls short: every place where the
system cannot express a decision becomes a documented exception and a finding,
not a silent local override.

## What counts

`npm run uxdsl:audit` ([scripts/uxdsl-audit.mjs](../../scripts/uxdsl-audit.mjs))
parses every `src/**/*.uxdsl` with PostCSS and counts, per file:

| Category | Finding | Aligned form |
|---|---|---|
| color | literal color (hex, rgb, hsl, oklch, named) | `palette(role-variant[, alpha])`, `color(token)` |
| spacing | a length in padding, margin or gap | `density(n)`, `space(n)` |
| radius | a length in border-radius | `radius(n)` |
| border | a literal border width | `border(n)`, or the role that owns it |
| shadow | a box-shadow without `shadow()` | `shadow(n)` |
| type | font-size, font-weight, line-height, letter-spacing or font-family | an `@ds-typo` role |
| focus | a hand-written focus outline or ring | the Button/Input role's `focusvisible` state, or one shared focus treatment |
| button | a clickable rule (`cursor: pointer`) without `@ds-button`/`@ds-input` | a Button role |
| surface | background + border + radius without a role | a Surface role |
| important | `!important` | specificity through structure |
| exception | a rule marked `/* uxdsl-exception: <reason> */` | stays, with a findings-log entry |

It also counts raw `<button>` elements against the shared `<Button>`
primitive in `src/**/*.tsx`.

`npm run lint` runs `uxdsl-audit --check`: no category may grow past
[the baseline](../uxdsl-alignment.baseline.json) in any file. After a cleanup,
`node scripts/uxdsl-audit.mjs --update` lowers the baseline so it can only go
down.

## Baseline (8 October 2026, UXDSL 0.5.0-beta.8)

| Stylesheet | color | spacing | radius | border | shadow | type | focus | button | surface | important |
|---|---|---|---|---|---|---|---|---|---|---|
| creative-draft-workspace | 2 | 17 | 46 | 79 | 5 | 266 | 10 | 32 | 60 | 3 |
| editorial-profile-panel | 0 | 2 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| radar-dashboard | 0 | 13 | 35 | 129 | 14 | 434 | 52 | 48 | 63 | 3 |
| topic-configuration-panel | 0 | 1 | 0 | 5 | 1 | 18 | 1 | 4 | 3 | 1 |
| ui/primitives | 0 | 1 | 0 | 12 | 1 | 21 | 2 | 1 | 1 | 0 |
| uxdsl | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| **Total** | **2** | **34** | **81** | **225** | **21** | **741** | **66** | **85** | **127** | **7** |

Components: 280 raw `<button>`, 45 shared `<Button>`.

Palette and Density are already near complete. The gaps concentrate in
typography (local font sizes such as 9–13 px over `@ds-typo` roles), in
hand-built buttons and containers (the default Surface and Button roles are
used only through ad hoc arguments, and the theme defines no project roles),
and in 66 copies of the same focus ring.

## Result (8 October 2026)

| Category | Before | After |
|---|---|---|
| color | 2 | 0 |
| spacing | 34 | 0 |
| radius | 81 | 0 |
| border | 225 | 0 |
| shadow | 21 | 0 |
| type | 741 | 0 |
| focus | 66 | 0 |
| button | 85 | 0 |
| surface | 127 | 0 |
| important | 7 | 0 |
| documented exceptions | 0 | 7 |

The theme now defines 45 typography roles (a 10 px floor; display, interface,
emphasis and icon roles), 40 border and 11 shadow presets, 8 Surface roles
(`card`, `panel`, `boxed`, `callout`, `dropzone` and three notices), 19 Button
roles (filled, outlined, on-image, chip, tab and text styles, each with every
state spelled out) and an Input role, plus one focus treatment for every
focusable element. The audit's definitions were tightened while migrating: a
focus ring built from tokens, a rule that only sets the cursor and a
container with no visible edge are not findings.

Two choices kept the interface as it looked rather than as the code asked:
the 37 edges written `border(n, color, style)` keep the gray they actually
rendered (finding 10), and the 137 rules whose `@ds-typo` follows a block
margin keep the directive's position (finding 9).

## Phases

Each phase is its own change. A phase never mixes theme definitions with a
redesign: the goal is the same interface expressed through the system, and any
intended visual change is called out.

### Phase 1 — Project roles in the theme

Define the roles the app actually uses, in `uxdsl.config.js`, without
touching consumers:

- Typography: roles for the small interface text now set by hand (label,
  metadata, eyebrow, button text), on a readable floor (no 9 px text).
- Surfaces: `card`, `panel`, `notice`, `chip`, `overlay`.
- Buttons: `primary`, `secondary`, `quiet` (link-like), `danger`, `compact`,
  each with `hover`, `focusvisible` and `disabled` states, so focus is defined
  once.
- Border, Radius and Shadow tokens for the hairlines, corners and elevations
  in use.

Acceptance: every consumer stylesheet compiles byte-identical (only new role
CSS is added); `uxdsl theme --contrast` reports no new failures.

### Phase 2 — Primitives on the roles

`src/app/ui/primitives.module.uxdsl` and `primitives.tsx` use only the
Phase 1 roles; `<Button>` covers every role. Audit for `ui/primitives`: zero.

### Phase 3 — Stylesheets, smallest first

`uxdsl`, `editorial-profile-panel`, `topic-configuration-panel`, then
`radar-dashboard` and `creative-draft-workspace`, each split into
feature-sized modules (shell, sources, activity and spending for the
dashboard; script, visuals and publication for the studio) as it is migrated.
Per change: the file's audit counts reach zero or documented exceptions,
screenshots of the affected views before and after at 390 px and 1280 px,
and a lowered baseline.

### Phase 4 — Components

Action `<button>` elements become `<Button>`. Raw buttons remain only where
the element is not an action (disclosure, tab, list item), styled by a role.

### Done

The audit totals are zero except documented exceptions, and every exception
has an entry in the findings log with its UXDSL version and status.

## Recording what we learn

While migrating, record in [the findings log](../uxdsl-findings.md):

- **Bug** — UXDSL produces wrong CSS or fails on valid input.
- **Gap** — a decision the system cannot express; the rule stays as a
  documented exception.
- **Friction** — expressible, but surprising or verbose (ordering, naming,
  docs that disagree with the compiler).
- **Advantage** — a measurable benefit (a change made once in the theme, an
  upgrade with identical output).

Each entry names the version, the evidence (file and line, compiled output)
and the workaround, so the log is ready to file upstream.
