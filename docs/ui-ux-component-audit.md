# UI/UX component audit

**Product:** Press Craftor  
**Date:** September 27, 2026  
**Scope:** 28 TSX files, 89 named rendering components, the four panel UXDSL modules, shared tokens/theme resolution, and embedded task regions.  
**Deliverables:** [Feature and design contract](features/ui-ux-consistency.md) · [22 implementation stories](features/ui-ux-consistency.kanban.md) · [Navigation specification](navigation-redesign.md)

## Method and limits

This is a source and interaction-contract review. Each row identifies a real rendering component, its purpose, an observed implementation detail, and a specific improvement. Inventory includes internal helpers that render JSX, not only exported panels. Utility functions and server services are reviewed where they determine the visible state, but are not counted as UI components.

No authenticated browser session or participant study was used. Layout pressure, contrast, focus behavior across browsers, and task completion must be measured in UX-22. A CSS declaration is evidence of a design choice, not proof of a measured visual defect. Existing error handling, provenance, approvals, and version preservation are retained unless a story explicitly identifies an improvement.

English remains the interface language. Source text and generated content keep their configured language.

## Main findings and priority

| Finding | Evidence | Effect on the editor | Owner |
|---|---|---|---|
| Shared tokens, independently styled controls | Four panel modules define separate buttons, fields, headers, badges, and feedback. Studio labels include local 10–12 px overrides; source-panel textareas use `density(15)` as minimum height. | Moving between panels changes density and action hierarchy. Computed size/readability needs browser verification. | [UX-01](stories/UX-01.md), [UX-02](stories/UX-02.md) |
| Different theme inputs across routes | Dashboard uses `topicThemeStyle(themeKey, selectedCreativeProfile)`; the Story route uses only `themeKey`. | A brand-derived interface palette can change on entering the studio. | [UX-01](stories/UX-01.md) |
| Editing protections are uneven | Creation dialogs have input focus and Escape; content viewer closes from backdrop; there is no shared overlay contract. | Users can lose their editing context or reach background controls. | [UX-03](stories/UX-03.md) |
| Old links and duplicate work views | Overview's In production points to Discover via `#stories`; Production renders planner, queue, and selected table. | The next destination or authoritative list is unclear. | [UX-05](stories/UX-05.md), [UX-08](stories/UX-08.md) |
| Save and approval language varies | Profile save, reference save, script version save, generic Approve, and publication authorization coexist. | The user must infer which revision or object an action affects. | [UX-02](stories/UX-02.md), [UX-04](stories/UX-04.md) |
| Internal publication steps dominate review | Candidate validation, package freezing, hashes, transforms, and file links are first-class controls. | Reviewing account, copy, and ordered images requires interpreting implementation details. | [UX-18](stories/UX-18.md) |
| Manual tracking resembles actual delivery | PublicationQuickControl offers Scheduled/Published and persists on select change. | A manually recorded state can be mistaken for scheduling or provider confirmation. | [UX-20](stories/UX-20.md) |
| Help and defaults leave ambiguity | New story uses en/global and Publish date; period fields request raw ISO values; one label says Topics disponibles. | Topic defaults, dates, and terminology need clearer meaning. | [UX-04](stories/UX-04.md), [UX-12](stories/UX-12.md), [UX-13](stories/UX-13.md) |

## Capabilities to retain

The current app already supports explicit daily preparation targets, exact-draft human approval before images, historical draft and image records, read-only version inspection, source provenance, private asset access, and recoverable Instagram publishing. The work below improves how those capabilities are understood and reached.

The existing navigation document had an earlier statement about automatic draft approval; current `daily-preparation.ts` requires the exact draft to be approved and current before advancing. The document has been corrected to match that code.

## Component-by-component review

Source links point to the audited file; line numbers identify the reviewed declaration and may move during implementation. A row can be satisfied by adopting a shared pattern rather than redesigning a working component from scratch.

### Shell and navigation

| Component and use | Observed implementation | Proposed improvement | Stories |
|---|---|---|---|
| [HelpPage](../src/app/help/page.tsx) (line 4) — Explain the editorial journey | Static four-step guidance has a separate shell and limited contextual links. | Use shared shell, current vocabulary, and task-specific return/help links. | [UX-05](stories/UX-05.md), [UX-21](stories/UX-21.md) |
| [RootLayout](../src/app/layout.tsx) (line 20) — App-wide language and typography | Loads Geist, UXDSL, and lang=en; page and panel contracts are delegated to consumers. | Retain the foundation and add shared shell/accessibility conventions. | [UX-01](stories/UX-01.md), [UX-05](stories/UX-05.md), [UX-22](stories/UX-22.md) |
| [Home](../src/app/page.tsx) (line 10) — Load Topic context and render the dashboard | Resolves active/default Topic and preferences before rendering RadarDashboard. | Preserve read-only initialization and surface context/loading failures consistently. | [UX-05](stories/UX-05.md), [UX-09](stories/UX-09.md) |
| [NavGlyph](../src/app/radar-dashboard.tsx) (line 138) — Identify sidebar destinations | Provides SVG navigation icons; other panels also use independent glyphs. | Reuse one icon family and consistent size, stroke, and accessible naming rules. | [UX-01](stories/UX-01.md) |
| [RadarDashboard](../src/app/radar-dashboard.tsx) (line 459) — Navigate daily work and brand configuration | Contains shell, multiple task regions, data operations, and repeated presentation styles. | Adopt shared composition and give each visible view one primary task. | [UX-01](stories/UX-01.md), [UX-05](stories/UX-05.md), [UX-08](stories/UX-08.md) |
| [StoryPage](../src/app/topics/[topicId]/stories/[storyId]/page.tsx) (line 14) — Resolve a direct Story URL | Server route delegates the editing surface to StoryWorkspacePageClient. | Keep direct links, missing-entity recovery, and selected Topic context aligned. | [UX-05](stories/UX-05.md), [UX-15](stories/UX-15.md) |
| [StoryWorkspacePageClient](../src/app/topics/[topicId]/stories/[storyId]/story-workspace-page-client.tsx) (line 18) — Open a Story with return context | Uses a separate header and theme-key-only palette; content editing opens a dialog and requires manual refresh. | Resolve the same theme and preserve list state and revision context. | [UX-01](stories/UX-01.md), [UX-05](stories/UX-05.md), [UX-15](stories/UX-15.md) |

### Today and discovery

| Component and use | Observed implementation | Proposed improvement | Stories |
|---|---|---|---|
| [DailyEditorialPlannerPanel](../src/app/daily-editorial-planner-panel.tsx) (line 11) — Recommend the next Story | Supports alternatives, stale decisions, and uncertainty; also appears above the Production queue. | Keep recommendation comparison focused and avoid competing production entry points. | [UX-06](stories/UX-06.md), [UX-08](stories/UX-08.md) |
| [DailyPreparationPanel](../src/app/daily-preparation-panel.tsx) (line 27) — Prepare or continue the editorial workflow | Shows all nine stages, explicit run controls, and review states; stage language differs from studio tabs. | Clarify target, human checkpoints, completed results, and safe recovery. | [UX-04](stories/UX-04.md), [UX-06](stories/UX-06.md) |
| [Metric](../src/app/radar-dashboard.tsx) (line 1945) — Display dashboard totals | Small label/value component has an undefined dash but its own styling. | Use shared metric typography, scope, and missing-value presentation. | [UX-01](stories/UX-01.md), [UX-06](stories/UX-06.md) |
| [OptimizationPanel](../src/app/radar-dashboard.tsx) (line 1954) — Explain collection and deduplication outcomes | Presents collection efficiency and provider-oriented operational details. | Keep diagnostics accessible from Discover without competing with editorial decisions. | [UX-07](stories/UX-07.md), [UX-21](stories/UX-21.md) |
| [EditorialEvaluationPanel](../src/app/radar-dashboard.tsx) (line 2033) — Evaluate and approve eligible candidates | Displays provider/limit details, legacy section numbers, multiple list views, and selection controls. | Prioritize candidate decisions; move diagnostics to a contextual disclosure. | [UX-07](stories/UX-07.md) |
| [StoryListControls](../src/app/radar-dashboard.tsx) (line 2720) — Filter and rank candidates | Several ranking, threshold, freshness, and publication controls are visible together; label says News list controls. | Use basic/advanced filters, visible applied scope, and domain-agnostic terminology. | [UX-04](stories/UX-04.md), [UX-07](stories/UX-07.md) |
| [SortableStoriesTable](../src/app/radar-dashboard.tsx) (line 2927) — Compare and act on Stories | Wide rows combine scores, source, content, review, and publication actions. | Keep core columns and one next action; provide intentional mobile behavior. | [UX-07](stories/UX-07.md), [UX-08](stories/UX-08.md) |
| [TableHeader](../src/app/radar-dashboard.tsx) (line 3437) — Label table columns | Renders a th and span, without an explicit scope attribute. | Use explicit column semantics and make the active ordering discoverable. | [UX-07](stories/UX-07.md) |
| [ScoreCell](../src/app/radar-dashboard.tsx) (line 3445) — Display a numeric signal | Shows value or a dash with optional accent; does not itself describe missing/legacy state. | Attach signal meaning and availability without inventing completed scores. | [UX-04](stories/UX-04.md), [UX-07](stories/UX-07.md) |
| [GrowthScoreCell](../src/app/radar-dashboard.tsx) (line 3459) — Explain growth potential | Already offers a Signals disclosure in addition to a title tooltip. | Keep accessible details while unifying the score and popover treatment. | [UX-07](stories/UX-07.md) |
| [OptimizationMetric](../src/app/radar-dashboard.tsx) (line 3614) — Describe an operational number | Displays label, value, and detail in a dedicated card pattern. | Reuse the metric layout with clear unit and context. | [UX-01](stories/UX-01.md), [UX-21](stories/UX-21.md) |
| [EfficiencyBar](../src/app/radar-dashboard.tsx) (line 3632) — Visualize collection percentages | Provides a textual percentage and decorative width bar. | Retain the text equivalent and align its scale and status styling. | [UX-01](stories/UX-01.md), [UX-21](stories/UX-21.md) |
| [TopicOverviewPanel](../src/app/topic-overview-panel.tsx) (line 90) — Summarize the current Topic | Has period controls and partial states; In production still links to #stories and attention is a total. | Prioritize actionable attention with precise destinations and truthful count scopes. | [UX-05](stories/UX-05.md), [UX-06](stories/UX-06.md) |
| [SectionCard](../src/app/topic-overview-panel.tsx) (line 522) — Render an Overview data section | Supports loading, empty, and unavailable/error states with Retry. | Preserve this state coverage through a common section/state pattern. | [UX-01](stories/UX-01.md), [UX-04](stories/UX-04.md), [UX-06](stories/UX-06.md) |

### Shared controls and configuration

| Component and use | Observed implementation | Proposed improvement | Stories |
|---|---|---|---|
| [AddSourceDialog](../src/app/add-source-dialog.tsx) (line 22) — Detect and add source material | Useful detect/confirm flow; custom overlay and drop handler have separate state/focus behavior. | Keep the preview exact, protect active requests, and adopt shared modal behavior. | [UX-03](stories/UX-03.md), [UX-13](stories/UX-13.md) |
| [ProgressStep](../src/app/creative-draft-workspace.tsx) (line 3615) — Show creative progress | Decorative progress item uses classes and a checkmark separately from workspace tabs. | Use a shared step state with explicit non-color status and avoid duplicate progress hierarchies. | [UX-04](stories/UX-04.md), [UX-16](stories/UX-16.md) |
| [StatusPill](../src/app/creative-draft-workspace.tsx) (line 3619) — Show draft state and version | Maps approved to Approved and every other input to Draft. | Preserve exact meaningful review/state distinctions through a shared status contract. | [UX-04](stories/UX-04.md), [UX-16](stories/UX-16.md) |
| [ErrorMessage](../src/app/creative-draft-workspace.tsx) (line 3834) — Report studio errors | Generic Creative studio error heading wraps raw message text. | Attach recovery to the affected operation and use shared alert presentation. | [UX-04](stories/UX-04.md) |
| [TextField](../src/app/creative-profile-fields.tsx) (line 41) — Edit short profile text | Local controlled input has label but no standardized hint or error props. | Adopt shared field states and content-language guidance. | [UX-02](stories/UX-02.md) |
| [TextAreaField](../src/app/creative-profile-fields.tsx) (line 45) — Edit long profile guidance | Supports a character counter; label/help/error structure differs from other forms. | Keep counters and use the shared field and validation contract. | [UX-02](stories/UX-02.md) |
| [ListField](../src/app/creative-profile-fields.tsx) (line 87) — Edit list-valued profile settings | Buffers text locally and sends parsed values only on blur. | Ensure Save consumes the last typed value and validation is visible. | [UX-02](stories/UX-02.md) |
| [Group](../src/app/creative-profile-panel.tsx) (line 566) — Expand creative settings sections | A hash opens and scrolls an accordion; several groups can stay open. | Give section navigation honest semantics and preserve section editing state. | [UX-05](stories/UX-05.md), [UX-10](stories/UX-10.md) |
| [NumberField](../src/app/editorial-profile-panel.tsx) (line 362) — Edit a bounded criterion or weight | Local numeric control with an overlaid unit uses a distinct layout. | Unify unit placement, invalid states, and intermediate numeric editing. | [UX-02](stories/UX-02.md), [UX-12](stories/UX-12.md) |
| [NewStoryDialog](../src/app/new-story-dialog.tsx) (line 60) — Create a manual Story | Starts with campaign/en/global and Publish date; custom dialog closes through Escape/backdrop. | Use Topic defaults and clear material-date copy with protected editing. | [UX-02](stories/UX-02.md), [UX-03](stories/UX-03.md), [UX-13](stories/UX-13.md) |
| [StatusBadge](../src/app/radar-dashboard.tsx) (line 3509) — Display editorial state | Local neutral/positive/warning/negative mapping differs from other status components. | Migrate to the shared status treatment while preserving domain labels. | [UX-01](stories/UX-01.md), [UX-04](stories/UX-04.md) |
| [TopicConfigurationPanel](../src/app/topic-configuration-panel.tsx) (line 155) — Manage Topics and source families | One component contains Topic cards/forms, RSS, AI research, documents, and original content; one ARIA label remains Spanish. | Use focused view composition and shared lists/forms for each source task. | [UX-04](stories/UX-04.md), [UX-09](stories/UX-09.md), [UX-13](stories/UX-13.md), [UX-14](stories/UX-14.md) |
| [Field](../src/app/topic-configuration-panel.tsx) (line 1418) — Label source/configuration input | A local label/span wrapper lacks the common hint/error contract. | Migrate to the shared field behavior. | [UX-02](stories/UX-02.md) |

### Creative identity and assets

| Component and use | Observed implementation | Proposed improvement | Stories |
|---|---|---|---|
| [BrandPaletteAssistant](../src/app/creative-palette-assistant.tsx) (line 21) — Suggest a palette from instructions | Provides suggested swatches and undo while updating unsaved profile state. | Clarify suggested/applied/saved states and align its actions with profile editing. | [UX-02](stories/UX-02.md), [UX-11](stories/UX-11.md) |
| [BrandPaletteEditor](../src/app/creative-profile-fields.tsx) (line 110) — Edit brand colors and usage | Includes color roles, usage shares, and UI preview with detailed controls. | Keep diagnostics while standardizing field, action, and preview hierarchy. | [UX-11](stories/UX-11.md) |
| [BrandUiPreview](../src/app/creative-profile-fields.tsx) (line 327) — Preview palette roles and contrast | Shows derived UI samples and contrast results from existing color utilities. | Reuse common controls and retain explicit measured contrast information. | [UX-01](stories/UX-01.md), [UX-11](stories/UX-11.md) |
| [CarouselNumberingEditor](../src/app/creative-profile-fields.tsx) (line 443) — Configure carousel navigation chrome | Uses its own segmented controls and preview. | Reuse segmented selection geometry and explain output scope. | [UX-11](stories/UX-11.md) |
| [CarouselChromePaletteSelect](../src/app/creative-profile-fields.tsx) (line 549) — Choose a palette color for chrome | Small select is tied to the current palette choices. | Use consistent naming and handle a missing/historical palette choice clearly. | [UX-02](stories/UX-02.md), [UX-11](stories/UX-11.md) |
| [BrandOverlayEditor](../src/app/creative-profile-fields.tsx) (line 574) — Set logo asset, scope, and placement | Upload, segmented scope, placement grid, scale, and backdrop controls share a large panel. | Provide a focused preview/inspector and explicit upload versus profile-save states. | [UX-11](stories/UX-11.md) |
| [BrandAssetPreview](../src/app/creative-profile-fields.tsx) (line 820) — Display a private logo asset | Uses a dedicated asynchronous preview implementation. | Adopt consistent loading, unavailable, sizing, and accessible preview behavior. | [UX-04](stories/UX-04.md), [UX-11](stories/UX-11.md) |
| [BrandReferenceLibrary](../src/app/creative-profile-fields.tsx) (line 917) — Upload and manage visual references | Upload form precedes reference cards; permission and provenance are already recorded. | Make the library scannable with consistent upload and independent save states. | [UX-11](stories/UX-11.md) |
| [BrandReferenceCard](../src/app/creative-profile-fields.tsx) (line 1243) — Edit one versioned reference | Accordion contains replace/download, detailed guidance, analysis, and activation controls. | Show identity/status first and keep version-changing actions explicit. | [UX-11](stories/UX-11.md) |
| [BrandReferencePreview](../src/app/creative-profile-fields.tsx) (line 1568) — Load a private reference version | Handles fetch cancellation and object-URL cleanup; shows its own placeholder. | Preserve protected access and standardize loading/unavailable presentation. | [UX-04](stories/UX-04.md), [UX-11](stories/UX-11.md) |
| [SupportingCharactersEditor](../src/app/creative-profile-fields.tsx) (line 1665) — Manage fictional visual narrators | Two slots contain separate character save, upload, archive, and reference controls. | Use the same asset card pattern with clear per-character save scope. | [UX-11](stories/UX-11.md) |
| [CharacterReferencePreview](../src/app/creative-profile-fields.tsx) (line 2011) — Display one character reference | Another specialized private-preview component. | Share display/state rules without exposing storage identity. | [UX-04](stories/UX-04.md), [UX-11](stories/UX-11.md) |
| [CreativeProfilePanel](../src/app/creative-profile-panel.tsx) (line 59) — Configure creative identity | Long accordion form spans identity, strategy, place policy, voice, visual assets, and numbering. | Use focused sections and visible save/effective-setting summaries. | [UX-10](stories/UX-10.md) |
| [GoogleMapsPreviewPanel](../src/app/google-maps-preview-panel.tsx) (line 8) — Test map composition for a place | Combines geographic input, provider checks, demo, and layout diagnostics. | Keep as an advanced preview with clear policy, scope, and cost/action boundaries. | [UX-10](stories/UX-10.md), [UX-21](stories/UX-21.md) |

### Editorial strategy

| Component and use | Observed implementation | Proposed improvement | Stories |
|---|---|---|---|
| [AcquisitionLensesPanel](../src/app/acquisition-lenses-panel.tsx) (line 19) — Version the Topic's growth-angle vocabulary | Editable keys, fallback, shares, and a publish operation appear together. | Lead with editor-facing definitions and label the configuration version action clearly. | [UX-04](stories/UX-04.md), [UX-12](stories/UX-12.md) |
| [EditorialLinesPanel](../src/app/editorial-lines-panel.tsx) (line 8) — Select and configure editorial lines | Button list, long form, inherited feeds/research, and outdated configuration link share a view. | Use focused line selection/editing with visible effective inheritance. | [UX-05](stories/UX-05.md), [UX-12](stories/UX-12.md) |
| [PeriodEditor](../src/app/editorial-lines-panel.tsx) (line 56) — Set relative or exact collection period | Relative hours or raw ISO date/time text are entered directly. | Use readable date/time controls with explicit zone and valid range. | [UX-02](stories/UX-02.md), [UX-12](stories/UX-12.md) |
| [ResearchEditor](../src/app/editorial-lines-panel.tsx) (line 65) — Override a line's AI research | Offers inherited/custom modes and raw language/region/priority inputs. | Expose effective defaults and only relevant override controls. | [UX-02](stories/UX-02.md), [UX-12](stories/UX-12.md) |
| [EditorialProfilePanel](../src/app/editorial-profile-panel.tsx) (line 21) — Define editorial criteria and weighting | Copy mentions one priority score; forms and messages use a separate module and compatibility-default state. | Explain actual signal meanings and preserve default behavior during presentation changes. | [UX-02](stories/UX-02.md), [UX-12](stories/UX-12.md) |

### Story content and script

| Component and use | Observed implementation | Proposed improvement | Stories |
|---|---|---|---|
| [CreativeDraftWorkspace](../src/app/creative-draft-workspace.tsx) (line 188) — Produce and review a Story | Five tabs coexist with a second progress display and many local actions; completion checks vary by stage. | Make stage/current-version/next-action explicit without implying approval from existence. | [UX-04](stories/UX-04.md), [UX-15](stories/UX-15.md), [UX-16](stories/UX-16.md), [UX-17](stories/UX-17.md), [UX-18](stories/UX-18.md) |
| [CreativeDraftHistory](../src/app/creative-draft-workspace.tsx) (line 2474) — Open saved creative revisions | History uses a disclosure and Saved studies terminology. | Use consistent version naming, date, state, and read-only selection. | [UX-04](stories/UX-04.md), [UX-16](stories/UX-16.md) |
| [HistoricalDraftDetails](../src/app/creative-draft-workspace.tsx) (line 2526) — Review or improve a past draft | Preserves saved copy/prompts and allows explicit improved-version creation. | Keep history read-only and make the new-version action's effect clear. | [UX-16](stories/UX-16.md) |
| [ReadOnlyDraftField](../src/app/creative-draft-workspace.tsx) (line 2649) — Display a historical field | Dedicated label/value display inside history. | Reuse readable read-only field treatment without suggesting editability. | [UX-01](stories/UX-01.md), [UX-16](stories/UX-16.md) |
| [CompleteDraftScript](../src/app/creative-draft-workspace.tsx) (line 2666) — Copy the full generated script | Copyable script sits inside another disclosure and includes an error state. | Name exactly what is copied and keep the output accessible. | [UX-16](stories/UX-16.md) |
| [CaptionForPosting](../src/app/creative-draft-workspace.tsx) (line 2734) — Copy publication caption | Separate copyable output and clipboard error handling. | Give caption one consistent location and identify the saved revision. | [UX-16](stories/UX-16.md), [UX-18](stories/UX-18.md) |
| [BriefView](../src/app/creative-draft-workspace.tsx) (line 3025) — Inspect narrative plan, facts, and risks | Shows planned slides, fact packet, constraints, and risk flags in one view. | Group supported facts, unresolved gaps, and creative direction for review. | [UX-15](stories/UX-15.md) |
| [DraftEditor](../src/app/creative-draft-workspace.tsx) (line 3122) — Edit script, quality findings, and each unit | Long editing surface combines caption, hooks, review notes, units, references, and visual directions. | Use selected-piece editing, linked review findings, and stable Save/Approve. | [UX-16](stories/UX-16.md) |
| [BriefCopy](../src/app/creative-draft-workspace.tsx) (line 3623) — Display a brief label and text | Local label/value presentation uses small uppercase labels. | Use shared readable content-field hierarchy. | [UX-01](stories/UX-01.md), [UX-15](stories/UX-15.md) |
| [EditorialAngleSummary](../src/app/creative-draft-workspace.tsx) (line 3638) — Explain the selected acquisition angle | Keeps taxonomy version, retired/unknown notes, reasons, and alternatives. | Retain historical meaning and give the selected angle a clear summary. | [UX-15](stories/UX-15.md) |
| [StoryContentViewer](../src/app/radar-dashboard.tsx) (line 3308) — Review or edit Story content and revisions | Dialog also contains photos; backdrop can close it and save asks for a studio refresh. | Embed the core editor in Content and protect edits/refresh transitions. | [UX-03](stories/UX-03.md), [UX-15](stories/UX-15.md) |
| [PhotoPreview](../src/app/story-photos-panel.tsx) (line 25) — Load a Story photo | Dedicated private-image loading component. | Standardize preview size, fallback, and meaningful photo label. | [UX-04](stories/UX-04.md), [UX-11](stories/UX-11.md) |
| [StoryPhotosPanel](../src/app/story-photos-panel.tsx) (line 40) — Add and revoke Story evidence photos | Has separate upload form, provenance, transmission permission, and preview rows. | Use shared asset states while keeping evidence scope and permissions explicit. | [UX-11](stories/UX-11.md), [UX-15](stories/UX-15.md) |
| [StoryPhotoPicker](../src/app/story-photos-panel.tsx) (line 86) — Attach photo references to a unit | Checkboxes and purpose selects enforce availability and a selection limit. | Use a common picker and explain unavailable or limit-blocked choices. | [UX-11](stories/UX-11.md), [UX-17](stories/UX-17.md) |

### Image production and review

| Component and use | Observed implementation | Proposed improvement | Stories |
|---|---|---|---|
| [CreativeBrandImageEditor](../src/app/creative-brand-image-editor.tsx) (line 23) — Save and apply a versioned edit request | Already distinguishes unsaved, saved, running, failed, and applied with separate save/apply actions. | Reuse the common edit-state and action system while retaining request revision semantics. | [UX-02](stories/UX-02.md), [UX-04](stories/UX-04.md), [UX-17](stories/UX-17.md) |
| [EditBasePreview](../src/app/creative-brand-image-editor.tsx) (line 176) — Inspect the base image for an edit | Dedicated base preview is shown in the image edit disclosure. | Pair base and result in the common comparison view. | [UX-17](stories/UX-17.md) |
| [CreativeDocumentaryPanel](../src/app/creative-documentary-panel.tsx) (line 12) — Review an earlier documentary preparation | Separate workflow includes evidence, original comparison, reviewer name, and complete-publication approval. | Keep compatibility access but visually distinguish the approved artifact and its actual delivery state. | [UX-17](stories/UX-17.md), [UX-18](stories/UX-18.md) |
| [PrivateDocumentaryImage](../src/app/creative-documentary-panel.tsx) (line 114) — Display/download a documentary image | Private preview has independent loading, error, and approved download UI. | Use protected common preview controls and clear approved-download scope. | [UX-04](stories/UX-04.md), [UX-17](stories/UX-17.md) |
| [CreativeAssetCard](../src/app/creative-draft-workspace.tsx) (line 2791) — Inspect, edit, regenerate, and approve one image | A large card combines image, source evidence, text drift, edit request, prompt, and review controls. | Move selected-image work to a focused canvas/inspector with contextual details. | [UX-17](stories/UX-17.md) |
| [BrandSelectionSummary](../src/app/creative-draft-workspace.tsx) (line 3577) — Explain included/excluded brand references | Shows chosen references with an expandable exclusion list. | Keep selection reasons discoverable in the inspector without overwhelming the canvas. | [UX-11](stories/UX-11.md), [UX-17](stories/UX-17.md) |
| [VisualFidelityControl](../src/app/creative-draft-workspace.tsx) (line 3682) — Inspect or override place policy | Correctly distinguishes inherited policy and overrides and requires reasons where necessary. | Retain the guard while standardizing the form and consequence summary. | [UX-02](stories/UX-02.md), [UX-17](stories/UX-17.md) |

### Channels, publication, history, and results

| Component and use | Observed implementation | Proposed improvement | Stories |
|---|---|---|---|
| [InstagramGalleryPanel](../src/app/instagram-gallery-panel.tsx) (line 115) — Browse imported/published Instagram posts | Has useful filters and pagination; each card includes linking and metric controls. | Use one publication identity/detail pattern and consistent filtered states. | [UX-20](stories/UX-20.md) |
| [MetricValue (gallery)](../src/app/instagram-gallery-panel.tsx) (line 566) — Display one publication metric | Gallery-specific label/value/state rendering. | Reuse the same supported, missing, stale, and zero-value semantics. | [UX-04](stories/UX-04.md), [UX-20](stories/UX-20.md) |
| [MediaMetrics](../src/app/instagram-gallery-panel.tsx) (line 600) — Read or refresh metrics on a gallery item | Implements its own metric grouping, freshness, and refresh presentation. | Reuse a common metric state and definition pattern with Story results. | [UX-20](stories/UX-20.md) |
| [MediaLinkControl](../src/app/instagram-gallery-panel.tsx) (line 713) — Associate a remote post with a Story/version | Nested Story, optional draft, batch, and name fields coexist on a post card. | Use an explicit link review with searchable choices and preserved historical attribution. | [UX-20](stories/UX-20.md) |
| [InstagramPublicationCandidatePanel](../src/app/instagram-publication-candidate-panel.tsx) (line 33) — Validate, package, and send approved media | Exposes candidate, freeze, hashes, file links, and job recovery in a stacked operational panel. | Offer exact-media review and explicit Publish now with technical diagnostics behind details. | [UX-18](stories/UX-18.md) |
| [InstagramPublishingAccessPanel](../src/app/instagram-publishing-access-panel.tsx) (line 19) — Verify ability to publish | Shows a capability-specific check separately from connection state. | Integrate it into a readable capability checklist with a next action. | [UX-19](stories/UX-19.md) |
| [MetaConnectionPanel](../src/app/meta-connection-panel.tsx) (line 85) — Connect and inspect the Topic's account | Uses brand-overlay styles for connection, verification, sync, health, and custom app configuration. | Use a channel card with separate capabilities and advanced administration. | [UX-19](stories/UX-19.md) |
| [PublicationStatusChips](../src/app/radar-dashboard.tsx) (line 3523) — Summarize destination tracking | Uses platform/status text but does not itself distinguish manual from provider evidence. | Expose tracking provenance and destination-specific readiness. | [UX-04](stories/UX-04.md), [UX-20](stories/UX-20.md) |
| [PublicationQuickControl](../src/app/radar-dashboard.tsx) (line 3546) — Update manual publication tracking | Changing the status select immediately writes Draft/Scheduled/Published tracking. | Make manual scope and save consequence explicit; never imply actual scheduling. | [UX-20](stories/UX-20.md) |
| [StoryInstagramResults](../src/app/story-instagram-results.tsx) (line 88) — Show a Story's linked posts | Provides another publication list, pending-post picker, and historical-version view. | Unify cards/linking behavior while keeping Story-specific context. | [UX-20](stories/UX-20.md) |
| [Thumb](../src/app/story-instagram-results.tsx) (line 386) — Show a post thumbnail or fallback | Has independent external thumbnail/failure handling. | Reuse accessible sizing/fallback treatment that leaves post details available. | [UX-20](stories/UX-20.md) |
| [PostMetrics](../src/app/story-instagram-results.tsx) (line 422) — Show a Story publication's metrics | Separate implementation from gallery MediaMetrics. | Share metric meaning, freshness, unavailable states, and ratio labels. | [UX-20](stories/UX-20.md) |
| [MetricValue (Story results)](../src/app/story-instagram-results.tsx) (line 453) — Display one publication metric | Story-results-specific label/value/state rendering. | Reuse the same supported, missing, stale, and zero-value semantics. | [UX-04](stories/UX-04.md), [UX-20](stories/UX-20.md) |
| [HistoricalVersion](../src/app/story-instagram-results.tsx) (line 532) — Inspect the exact linked creative version | Inline read-only version view loads text/assets separately. | Use consistent historical detail presentation and unavailable-version recovery. | [UX-20](stories/UX-20.md) |
| [VersionImage](../src/app/story-instagram-results.tsx) (line 553) — Load a historical image | Supports protected API blobs and external URLs with fallback text. | Preserve exact historical media and standardize preview/error states. | [UX-20](stories/UX-20.md) |

## Embedded work regions

These regions do not have their own named React component. They are included so extracting shared primitives does not leave the main user tasks unaudited.

| Region | Existing behavior and usability finding | Improvement owner |
|---|---|---|
| Global creation menu and session controls | Compact split action exists; Processes is a Today shortcut and session is still collector-secret based. | UX-03/05/21; AUTH retains session ownership. |
| Collection controls | Editorial-line context and diagnostics are available but spread between collection, evaluation, and preferences. | UX-07/12; show effective scope before Search. |
| Keyword preferences | Separate form saves favored/unfavored terms and displays “Saved in Neon.” | UX-02/04/12; retain terms, simplify save feedback. |
| Production queue | Card queue, recommendations, and selected table overlap. | UX-08; one primary work queue. |
| Pending publications queue | Filters selected Stories without a published Instagram record; it is not an aggregate of all ready packages/jobs. | UX-18; accurate queue name/data, readiness and job state from existing contracts. |
| Topic cards and edit form | Cards, another selector, edit form, and linked-source disclosure coexist. | UX-09; one clear management context and resumable guidance. |
| RSS catalog and Topic feed settings | Workspace links and Topic settings are both useful but visually stacked; Remove/Unlink/Delete have different scopes. | UX-13; separate visible scope and safe action meaning. |
| AI research catalog/settings | Lists research across Topics and also edits current Topic settings. | UX-12/13; keep Topic ownership and line inheritance explicit. |
| Original-content catalog | Opens existing Stories, while creation lives in a separate dialog. | UX-13; consistent list and success destination. |
| Documents, chapters, and dossiers | Extraction, links, chapter selection, title, and create-candidate actions share a long screen. | UX-14; focused inspection and stable selection summary. |
| Script approval and companion output | Repair, generation, save, approval, and social Story creation compete in one area. | UX-16; stable next action and clear revision/format scope. |
| Administrative clear/regenerate actions | Text describes broad data removal and requires DELETE, inside a Topic-scoped app shell. | UX-21; display actual operation scope and preserve authorization. |

## State and scenario checklist

| Scenario | Expected behavior to validate |
|---|---|
| First Topic / no source / no Story | Relevant setup or creation action, never a wall of unexplained empty panels. |
| No filtered results | Keep active filters visible and offer Reset; distinguish from no data. |
| Loading or partial failure | Preserve layout and scope; retry the affected operation with a clear announcement. |
| Unsaved data / conflicting revision | Retain input and require a meaningful navigation or conflict decision. |
| Missing or stale evidence | Explain the affected draft and next step; never silently regenerate or strengthen facts. |
| Missing image / failed generation / changed text | Preview placeholder, exact unit/revision state, bounded recovery, and valid approval gate. |
| Historical artifact unavailable | State the absence; do not substitute a current artifact under an old version label. |
| Connection without publishing or metrics capability | Display separate capabilities and account identity. |
| Publication uncertain / local record pending | Distinguish provider confirmation and local persistence; preserve existing idempotent recovery. |
| Long names, non-English source content, large lists | Retain readable interface controls, sensible overflow, and precise Topic/Story identification. |
| Keyboard, zoom, touch, reduced motion | Every primary task is reachable and understandable; no hidden focus or accidental side effect. |

## Completion record

All 89 components and 12 embedded regions have an improvement owner. No runtime code was changed as part of this audit. The [feature](features/ui-ux-consistency.md) defines shared visual decisions, implementation sequencing, existing-domain dependencies, and delivery checks. Browser evidence and observed user task results remain implementation work under [UX-22](stories/UX-22.md).

### UX-01 migration update — September 27, 2026

Shared primitives, a safe showcase, and consistent server-side Topic palette resolution now exist. The dashboard production queue, studio brief action, and Topic edit form are representative adopters. The dashboard queue's old button geometry rule was removed; the configuration panel's broad button selector no longer overrides shared controls. A studio profile/research select expanded the mobile page to 1482 px; its grid and select width are now constrained, and the actual studio measured 390 px at a 390 px viewport. Showcase captures, consumer control measurements, and actual route palette measurements are in [UX-01](stories/UX-01.md).

Remaining migration targets include dashboard collection and creation controls, both creation dialogs, studio script/approval/image actions, Topic/source forms, Editorial Profile controls, and all other panels listed in the tables above. UX-02 owns form validation and save feedback; UX-03 owns overlay focus and unsaved-work behavior; UX-04 owns status language. Authenticated consumer screenshots and state review at mobile and desktop widths remain the completion gate for UX-01.
