# Consistent interface and editorial experience

**ID:** FEAT-UX-001  
**Status:** In progress. UX-01–22 have implementation work; cross-component acceptance review remains.  
**Audit date:** September 27, 2026  
**Board:** [UI and UX consistency](ui-ux-consistency.kanban.md)  
**Evidence:** [Component audit](../ui-ux-component-audit.md) · [Navigation specification](../navigation-redesign.md)

## Outcome

An editor should recognize the same controls, hierarchy, and status language throughout Press Craftor. Every work view should make the current Topic, saved version, pending decision, and next useful action clear.

This feature applies the navigation redesign to the components inside each screen. It covers 28 TSX files and 89 named functions that render JSX, plus embedded source, preference, collection, production, and administration sections. The audit is based on source and style inspection. It is not a claim of browser validation, measured contrast, or observed usability results.

## What needs attention first

1. **Shared interaction and visual rules.** Four panel stylesheets independently define controls, headings, messages, and badges. Token reuse alone has not standardized their composition.
2. **Safe editing and clear feedback.** The creation dialogs focus an input and support Escape, but lack a common focus containment and return pattern. Content editing can close through the backdrop. Save boundaries vary across profile, asset, and script editors.
3. **One workspace for each task.** Production currently shows a planner, a card queue, and the selected-story evaluation table. Creative identity tabs scroll into accordions instead of isolating their section. Story Content opens another dialog.
4. **A clear publication review.** Editors currently see “Validate publication candidate,” “Freeze publication package,” hashes, and file links. The same underlying checks should support a clear review of the account, caption, images, and approval.
5. **Consistent brand context.** The dashboard resolves the Topic theme with its creative profile; the Story route supplies only the theme key, and Help has no equivalent Topic theme resolution. The same Topic can therefore receive different interface palettes.

The detailed audit records evidence, retained capabilities, and an owner story for every component.

## Shared visual and interaction contract

| Element | Required experience |
|---|---|
| Page header | One clear title, concise purpose when needed, Topic context, and one primary task action. Supporting details stay secondary. |
| Sections and cards | Shared header, content, and footer patterns. Use borders and spacing to group work; avoid a card inside a card unless it represents a separate entity. |
| Typography | Configured body/small/caption roles: 16 px reading text, 14 px compact controls, 12 px metadata as initial targets. Use a shared scoped page-title treatment around 24–28 px and section headings around 18–20 px. Do not change global typography merely to shrink one panel. |
| Buttons | Primary, secondary, quiet, and destructive treatments share geometry. Start with 36 px compact desktop and 40 px regular controls; provide at least a 44 px interactive target for touch. Width follows the label. Equal rank in one row means equal height. |
| Inputs | Consistent label, required/optional indicator, description, error, and disabled reason. Labels remain visible. Checkbox/radio/switch patterns do not inherit text-field dimensions. |
| Layout | Use existing density tokens for component spacing and existing breakpoints. Headers, form groups, lists, and action rows each use a documented spacing pattern. |
| Color and shape | Use the effective Topic palette, semantic status colors, shared radius and elevation roles, and one icon family. Preview colors may reflect brand artwork; app controls follow the interface roles. |
| Actions | One primary next action per task region. Secondary actions are available without competing for attention. Menus group infrequent actions and expose keyboard behavior. |
| Feedback | Loading, empty, filtered-empty, error, blocked, stale, read-only, unsaved, saving, and saved are distinct. A blocker names the reason and next action; critical information does not depend on hover. |
| Versions | Show the revision being edited, reviewed, generated, or published. Editing creates the existing versioned result; UI changes do not transfer historical approval. |
| Language | English interface copy, including hidden labels, errors, dates, counts, and help. Use “Story,” “Script,” “Visuals,” and “Publication” consistently; content retains its configured language. |
| Accessibility | Visible focus, logical heading order, labeled controls, keyboard operation, modal focus management, and non-color status cues. Announce state changes without repeatedly announcing full job output. |
| Responsive behavior | Verify at 390, 768, 1024, and 1440 px, plus 200% zoom. Prevent page-level horizontal overflow. Deliberately scrollable tables or thumbnail strips must retain context and accessible controls. |

These are project acceptance targets. Browser measurements and assistive-technology checks are required during implementation; this document does not certify conformance to an external standard.

## UXDSL implementation boundary

Read [the local UXDSL guide](../uxdsl-agent-guide.md) before implementation. Reuse `density()`, `palette()`, configured typography, `@ds-surface`, `@ds-button`, and `@ds-input`. Use existing radius and shadow roles. Keep deliberate structural dimensions separate from component spacing.

Build shared UI primitives with one style source and document their variants. Proposed locations such as `src/app/ui/` are implementation choices, not existing files. Reuse native HTML semantics where suitable. A playground with safe fixtures should show every variant and state without production data.

Edit `.uxdsl` files, never generated CSS. Add any new shared entry to the existing `uxdsl.config.cjs` orchestration; `uxdsl.theme.config.cjs` remains the single theme entry. Verify installed UXDSL behavior when the guide is unclear. Audit `border(...)` uses before replacing them; the guide records a known preset trap, which is not proof that every current border is missing.

A migration must remove superseded consumer styling where it applies. Appending more overrides to the dashboard stylesheet is not a shared design system. Prove parity on at least three different panel families before rolling out the shared primitives.

### UX-01 implementation contract

The shared controls live in [`src/app/ui/primitives.tsx`](../../src/app/ui/primitives.tsx) and one UXDSL source, [`primitives.module.uxdsl`](../../src/app/ui/primitives.module.uxdsl). The development-only `/ui-showcase` route uses safe fixtures. Its production route returns 404.

| Primitive | Supported contract |
|---|---|
| Button, IconButton | `primary`, `secondary`, `quiet`, `destructive`; regular 40 px and compact 36 px on desktop, at least 44 px at narrow/touch widths. Busy disables repeated activation and exposes `aria-busy`. IconButton requires an accessible name. |
| Surface, SectionHeader, ActionRow | Two surface tones, heading level 2 or 3, optional eyebrow/description/actions, wrapping action layout. |
| FormField | Visible label, optional marker, description, and error. Rich validation and save boundaries remain UX-02 work. |
| StatusBadge, InlineNotice | Semantic tone and text; error notices announce as alerts. State meaning must remain in visible copy. |
| EmptyState, LoadingState, Tabs | Distinct empty/loading presentation and native-link navigation with `aria-current`. |

`resolveTopicUiTheme` reads an existing creative profile without creating one, then applies its brand colors over the Topic theme. Dashboard, Story, and Help use that same server resolution. The dashboard keeps a stable initial palette until its client profile loads; an absent profile falls back to the Topic theme. The shared modal layer copies the resolved Topic palette into its portal so dialogs retain those interface colors.

## Product rules that every story preserves

- Topic owns visual identity and connections; Editorial Lines inherit them. Moving a field does not change its owner.
- Never create an editorial-profile row just to display setup progress: legacy evaluation currently changes when such a row is created.
- RSS, research, documents, and original content converge on the same Story model. UI terminology remains domain-agnostic.
- Keep editorial score, growth score, evidence, and status separate. Unknown or legacy zero scores are not presented as completed weak scores.
- Human Story approval, script approval, image approval, and publication authorization are separate decisions.
- Saving, generating, and publishing are separate actions. Opening a view, tab, or preview must not start a paid generation or publish.
- Preserve drafts, image versions, approvals, source provenance, publication packages, and historical links.
- Continue to use authenticated handlers and existing server validation. Preview requests do not expose provider credentials, R2 object keys, or long-lived tokens.
- Do not promise durable background work where only a browser request exists. Confirm the actual execution contract before allowing a “safe to leave” message.
- Social sending remains idempotent and tied to an immutable publication package. An uncertain delivery state requires reconciliation, not a new send.
- Facebook, scheduling, user sessions, and autonomous publishing depend on their existing feature stories. A new label does not enable a backend capability.

## Story index and sequence

P0 means foundations or a critical daily-flow ambiguity. P1 means an essential screen improvement after those foundations. UX-01–22 are in progress; no story has passed its full acceptance review.

| Story | Priority | Deliverable |
|---|---|---|
| [UX-01](../stories/UX-01.md) | P0 | Shared visual primitives and consistent Topic theme |
| [UX-02](../stories/UX-02.md) | P0 | Form fields, validation, and save boundaries |
| [UX-03](../stories/UX-03.md) | P0 | Dialogs, menus, and protection for unsaved work |
| [UX-04](../stories/UX-04.md) | P0 | Status, feedback, and English action language |
| [UX-05](../stories/UX-05.md) | P0 | Navigation context, return paths, and accurate destinations |
| [UX-06](../stories/UX-06.md) | P0 | Today, daily preparation, and recommendations |
| [UX-07](../stories/UX-07.md) | P0 | Discovery, evaluation, and Story lists |
| [UX-08](../stories/UX-08.md) | P0 | One actionable Production queue |
| [UX-09](../stories/UX-09.md) | P1 | Topic setup and management |
| [UX-10](../stories/UX-10.md) | P1 | Creative identity and profile editing |
| [UX-11](../stories/UX-11.md) | P1 | Palette, logos, references, and characters |
| [UX-12](../stories/UX-12.md) | P1 | Editorial strategy, lines, angles, and preferences |
| [UX-13](../stories/UX-13.md) | P1 | Source catalog, Add source, and New story |
| [UX-14](../stories/UX-14.md) | P1 | Document extraction and evidence selection |
| [UX-15](../stories/UX-15.md) | P0 | Story content, evidence, and focus |
| [UX-16](../stories/UX-16.md) | P0 | Script composition, preview, and approval |
| [UX-17](../stories/UX-17.md) | P0 | Image review, editing, and version comparison |
| [UX-18](../stories/UX-18.md) | P0 | Publication preview, authorization, and recovery |
| [UX-19](../stories/UX-19.md) | P1 | Channel connection and capability guidance |
| [UX-20](../stories/UX-20.md) | P1 | Publication history, links, and results |
| [UX-21](../stories/UX-21.md) | P1 | Contextual Help and clear administration |
| [UX-22](../stories/UX-22.md) | P0 | Cross-component and end-to-end experience validation |

Implement UX-01–04 first, then UX-05–08 and UX-15–18 to improve the daily journey. Apply the same system to brand setup and supporting screens. UX-22 is the release gate and is designed alongside UX-01; it does not wait until the end to define expectations. Priorities do not override explicit dependencies in each story.

## Relationship to existing work

| Existing feature | Ownership |
|---|---|
| OVW-03 / OVW-04 / OVW-06 | Own attention data, resumable production records, and navigation data. UX-06 and UX-08 compose them; if an aggregate is missing, complete the owning story instead of fabricating a count. |
| SRC-01–08 | Own source ingestion and creation behavior. UX-13/14 improve presentation and recovery over those contracts. |
| IMG-01–08 | Own image edit persistence, generation, comparison, selection, and protections. UX-17 provides the consistent workspace and acceptance checks; missing editing capabilities remain IMG work. |
| PUB-01–08 / PUB-14 | Own candidate checks, immutable delivery packages, sending, reconciliation, and previews. UX-18 supplies the common review interaction and coordinates with PUB-14 rather than creating another preview system. |
| PUB-05 / PUB-09 / PUB-10 / PUB-15 / PUB-18 | Own scheduling, Meta destinations, sync, and additional metrics. UX stories expose them only when implemented. |
| AUTH-03–06 | Own session UI, server authorization, removal of the browser secret, and workspace isolation. UX-05/19/21 style and integrate those capabilities. |
| GEO / BRAND / RCP / VID | Their formats, reference policies, and domain constraints remain authoritative. UX work must support their current states without inventing capabilities. |

## Definition of done

Each story includes a screenshot or recording of its principal happy path, empty state, error, and relevant blocked/read-only state, with the viewport, Topic theme, and fixture noted. Shared patterns must be tested in their actual consumers.

Run lint and production build for UI changes, focused behavioral tests for changed interactions, and affected domain tests when domain behavior changes. Schema changes require the repository's migration checks and belong only to an explicit domain requirement. Documentation-only work requires link, coverage, dependency, and status checks.

Record usability observations, remaining limitations, and task completion against UX-22. Mark a story done only when its implementation, interaction checks, and visual evidence are complete. Maintain this board and each story's status together. The current `foam-sync.py` only indexes selected legacy features; it does not register UX stories, so this feature and board are the entry points.
