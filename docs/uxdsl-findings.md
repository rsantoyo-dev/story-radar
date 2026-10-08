# UXDSL findings log

What aligning Press Craftor with UXDSL teaches about UXDSL itself (see
[UXDSL alignment](features/uxdsl-alignment.md)). Newest first. Types: **bug**,
**gap**, **friction**, **advantage**. Each entry is meant to be filed or
quoted upstream as written.

| # | Date | Version | Type | Finding | Evidence | Workaround / status |
|---|---|---|---|---|---|---|
| 8 | 2026-10-08 | 0.5.0-beta.8 | advantage | Upgrading beta.6 → beta.8 changed no component CSS. | All five generated CSS Modules compiled byte-identical with beta.6 and beta.8 from the same sources; `uxdsl.css` differed only in the position of an author comment (MIG-B7-14) and blank lines. | — |
| 7 | 2026-10-08 | 0.5.0-beta.8 | advantage | Palette and Density are adopted almost everywhere, translucency included. | Baseline audit: 2 literal colors and 34 literal spacings across ~8,300 lines; 247 `palette(role, alpha)` uses replace rgba borders and tints. | — |
| 6 | 2026-10-08 | 0.5.0-beta.8 | friction | The package CHANGELOG has no beta.8 section and still marks beta.7 "unreleased". | `node_modules/postcss-uxdsl/CHANGELOG.md` starts at `## 0.5.0-beta.7 — unreleased` while every package reports 0.5.0-beta.8. | Read the beta.7 notes; ask upstream for a beta.8 entry. |
| 5 | 2026-10-08 | 0.5.0-beta.8 | friction | The packaged agent guide uses paths relative to the UXDSL repository, not to the installed package. | Header of `node_modules/postcss-uxdsl/docs/agent-guide.md`. | Read it for the API; resolve paths against the repository. |
| 4 | 2026-10-08 | 0.5.0-beta.8 | friction | Two spellings of a palette reference: the guide documents `palette(role.variant)`, this project uses `palette(role-variant)` everywhere and it compiles. | Guide table "Palette"; ~1,570 `palette(primary-main)`-style uses in `src/app/*.uxdsl`. | To confirm upstream which form is canonical; pick one for the showcase. |
| 3 | 2026-10-08 | 0.5.0-beta.8 | gap (to confirm) | No shared focus treatment outside Button/Input states: every other focusable element repeats its own ring. | Audit: 66 hand-written focus rules, 44 of them the same `outline: 2px solid palette(primary-main); outline-offset: 2px`. | Phase 1 moves buttons' focus into role states; whatever remains is a candidate for an upstream focus primitive. |
| 2 | 2026-10-08 | 0.5.0-beta.8 | gap (to confirm) | The typography roles in use do not cover small interface text, so components override `@ds-typo` with local sizes. | Audit: 741 type declarations; 118 rules set a `font-size` right after `@ds-typo(...)`; most common sizes 10, 11, 9 px. | Phase 1 defines project roles; record whatever the roles cannot express (letter-spacing, uppercase labels). |
| 1 | 2026-09 | 0.5.0-beta.6 | friction | `@ds-typo` also emits margins, so a margin written before it in the same rule is silently overridden. | Fixed during the dashboard polish by writing `@ds-typo` first in each rule. | Convention: directives first, local declarations after. Ask upstream for a lint or a note in the guide. |
