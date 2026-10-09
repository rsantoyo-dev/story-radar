# UXDSL alignment — FEAT-UXA-001

**Status:** UXA-00–07 done on 8 October 2026 (stylesheets at zero findings). Next: UXA-08, UXA-10, UXA-09.  
**Feature:** [Plan, rules and baseline](uxdsl-alignment.md)  
**Findings:** [UXDSL findings log](../uxdsl-findings.md)

Goal: every styling decision expressed through UXDSL roles and tokens, so the
work exposes UXDSL's real bugs, gaps and advantages. Before each story, run
`npm run uxdsl:audit`; after it, lower the baseline with
`node scripts/uxdsl-audit.mjs --update` and log what was learned.

## To do

### UXA-08 — Action buttons use the shared primitive

  - priority: medium
  - tags: [uxdsl, ui, phase-4]
  - 280 raw `<button>` against 45 `<Button>`: actions become `<Button>`; raw buttons remain only for non-action elements (disclosure, tab, list item), styled by a role.
  - Accept: the audit's raw-button count drops to those elements.

### UXA-10 — Margins cancelled by `@ds-typo`

  - priority: medium
  - tags: [uxdsl, ui]
  - 137 rules write a block margin before `@ds-typo`, whose role sets `margin-block: 0` (finding 9). Per rule: move the directive first when the margin was meant, or delete the dead margin; screenshots before and after.

### UXA-11 — Decide the edges `border(n, color)` asked for

  - priority: low
  - tags: [uxdsl, design]
  - 37 edges keep the gray they rendered (finding 10). Decide per component whether the requested color (primary, error, info) should now show.

### UXA-12 — Split the two large stylesheets by feature

  - priority: low
  - tags: [uxdsl, ui]
  - `radar-dashboard.module.uxdsl` (shell, sources, activity, spending, settings) and `creative-draft-workspace.module.uxdsl` (script, visuals, publication) are migrated but still one file each; split them without changing the compiled rules.

### UXA-09 — Report upstream

  - priority: medium
  - tags: [uxdsl, upstream]
  - File the findings log's bugs, gaps and frictions in the UXDSL repository; record their status in the log.

## Done

### UXA-01 — Typography roles for small interface text

  - priority: high
  - tags: [uxdsl, theme, phase-1]
  - Define label, metadata, eyebrow and button-text roles in `uxdsl.config.js` covering the local 9–13 px sizes (118 rules override `@ds-typo` right after it). Readable floor: no 9 px text.
  - Accept: consumers compile byte-identical; findings logged for what roles cannot express (letter-spacing, uppercase).

### UXA-02 — Surface roles: card, panel, notice, chip, overlay

  - priority: high
  - tags: [uxdsl, theme, phase-1]
  - Replace the 17 ad hoc `@ds-surface(<default role> <tone> <size>)` combinations and the 127 hand-built containers with named roles; Border, Radius and Shadow tokens for the hairlines, corners and elevations in use.
  - Accept: consumers compile byte-identical; `uxdsl theme --contrast` reports no new failures.

### UXA-03 — Button roles with their states

  - priority: high
  - tags: [uxdsl, theme, phase-1]
  - `primary`, `secondary`, `quiet`, `danger`, `compact`, each with `hover`, `focusvisible` and `disabled`, so the focus ring is defined once (66 hand-written focus rules today).
  - Accept: as UXA-01; a focus need no role covers becomes a finding.

### UXA-04 — Primitives on the roles

  - priority: high
  - tags: [uxdsl, ui, phase-2]
  - `src/app/ui/primitives.module.uxdsl` and `primitives.tsx` use only UXA-01–03 roles; `<Button>` exposes every button role.
  - Accept: audit for `ui/primitives` is zero.

### UXA-05 — Small stylesheets

  - priority: medium
  - tags: [uxdsl, ui, phase-3]
  - `uxdsl.uxdsl`, `editorial-profile-panel`, `topic-configuration-panel`.
  - Accept: audit zero or documented exceptions; screenshots before and after at 390 px and 1280 px.

### UXA-06 — Dashboard stylesheet

  - priority: medium
  - tags: [uxdsl, ui, phase-3]
  - `radar-dashboard.module.uxdsl` (about 4,000 lines) split into shell, sources, activity, spending and settings modules while migrating. The Activity styles still uncommitted with the paused request-trace work are written with roles when that work resumes.
  - Accept: as UXA-05.

### UXA-07 — Creative Studio stylesheet

  - priority: medium
  - tags: [uxdsl, ui, phase-3]
  - `creative-draft-workspace.module.uxdsl` (about 3,600 lines) split into script, visuals and publication modules; its `primaryButton`/`secondaryButton` (65 uses, 10 px text, hand-built) move to the Button roles.
  - Accept: as UXA-05.


### UXA-00 — Measure alignment and stop regressions

  - `npm run uxdsl:audit`, baseline in `docs/uxdsl-alignment.baseline.json`, `npm run lint` fails on growth, exception marker, findings log with 8 entries, UXDSL 0.5.0-beta.8 verified (component CSS identical to beta.6).
