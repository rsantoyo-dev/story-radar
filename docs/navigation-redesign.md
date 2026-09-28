# Press Craftor — navigation and editorial workspace

**Date:** September 27, 2026.  
**Status:** Main navigation, task views, visual Topic management, and the story studio are implemented. Unified search, an aggregated process queue, Facebook publishing, and the calendar remain future capabilities.  
**Review basis:** Current components, workflow contracts, product documentation, and UXDSL configuration.

## 1. Product structure

Organize Press Craftor around the **Topic as the brand** and the **Story as the unit of work**. The top Topic selector answers “Which brand am I working on?” The sidebar has two groups: **Daily work** and **Brand**. Contextual navigation within a Story moves from source content through publication.

The interface should support three clear journeys:

1. **Set up a brand:** create a Topic → define identity and strategy → configure sources → connect channels.
2. **Work each day:** discover opportunities → select a Story → produce it → review it → publish it.
3. **Resume work:** open Today → see what needs attention → continue from the saved state.

ElevenLabs Studio offers a useful reference for a creation space with contextual tools, a library, and versions. Press Craftor applies that pattern to editorial work, keeping the content central and showing tools in the context where they are needed. [Reference: ElevenCreative Studio](https://elevenlabs.io/docs/eleven-creative/products/studio).

## 2. Existing capabilities and navigation constraints

The review is based on code and contracts. The measurements and layouts below are design targets that still require visual validation.

| Area | Existing evidence | Design implication |
|---|---|---|
| Main navigation | `radar-dashboard.tsx` exposes Overview, Topics, Editorial AI, Creative profile, Sources, Collect, Evaluate, Select, Ready to produce, Instagram, Published, Optimization, and Settings | Configuration, actions, and Story states need a clearer hierarchy |
| Main screen | Many sections are mounted on one page and reached by anchors | Each destination should have a clear task while legacy links keep working during the transition |
| Top bar | Topic selector and connection controls; Add source, New story, and Prepare today beneath | Global and contextual actions need distinct priority |
| Brand setup | `CreativeProfilePanel`, `EditorialProfilePanel`, `AcquisitionLensesPanel`, and preferences | Related capabilities can be grouped without duplicating their data |
| Sources | SRC-01 through SRC-08 cover RSS, AI research, documents, manual content, and source detection | Reorganization must preserve the shared catalog and existing source workflows |
| Daily operation | `daily-preparation.types.ts` defines nine active steps | The existing workflow can support a clearer presentation |
| Production | `CreativeDraftWorkspace` combines brief, draft, approval, images, and publication candidate in a long dialog | A Story workspace with its own URL and focused sections is easier to resume |
| Publishing | Instagram has connection, validation, packages, jobs, recovery, gallery, and metrics | A publication queue can compose these existing capabilities |
| Facebook and scheduling | PUB-05, PUB-09, PUB-10, and Meta extensions remain pending | Show operational controls only when their capabilities exist |
| Optimization | The current panel covers deduplication and collection outcomes | It belongs under search or operational diagnostics, not social performance |

Some feature documents describe earlier states. For example, the Overview proposal still says planned although a panel exists, and the daily preparation guide describes an earlier sequence. Current code establishes what exists; it does not alone prove production quality.

## 3. One interface language and vocabulary

**English is the base language for interface labels, help text, status messages, and accessibility text.** Keep internal identifiers for compatibility. Story content, sources, brand names, and a Topic's configured content language remain as authored. A French or Spanish source should never be translated merely to standardize the interface.

| Term | Meaning | Where it appears |
|---|---|---|
| **Topic / brand** | A publication with its own identity, audience, and publishing channels | Top selector and Manage Topics |
| **Editorial line** | A strategy within a Topic: purpose, audience, subjects, period, sources, and workflow | Editorial strategy, research, and daily preparation |
| **Source** | The origin of material: feed, page, document, or supplied content | Sources and Story evidence |
| **AI research** | A way to find and prepare information | Sources configuration and Discover execution |
| **Editorial intent** | News, context, guide, or another configured intent | Editorial line and Story context |
| **Search orientation** | Informative, trends, or another configured orientation | AI research and line settings |
| **Story** | An editorial opportunity researched, produced, and distributed | Discover and Production |
| **Output format** | Carousel, image, sequence, or another available format | Story studio |
| **Publication** | Delivery of a specific version to a specific account or destination | Publications and Story history |

“Trends” is already a research orientation and does not require a separate source or pipeline. News, recipes, and guides can use the same architecture; available choices come from configuration and implemented capabilities.

The Topic owns visual identity, publishing connections, shared policies, and shared growth vocabularies. Editorial lines inherit those foundations and define their own strategy. Shared feeds and documents remain owned by the workspace. A Topic's Sources view shows its links and settings; unlinking a source from one Topic does not remove it from others.

## 4. Sidebar

```text
PRESS CRAFTOR                         [‹]

DAILY WORK
  Today
  Discover
  Production                        3
  Publications                      1
  Results

BRAND
  Creative identity
  Editorial strategy
  Sources
  Channels

───────────────────────────────────────
  Help
  Administration
```

Counts are illustrative. In the app, badges reflect real pending work within the current Topic. The sidebar has nine primary destinations in two visible groups and one navigation level. Creative profile details live in tabs inside Creative identity.

| Destination | Question it answers | Main content |
|---|---|---|
| **Today** | What needs my attention now? | Daily preparation, pending decisions, recommendations, work in progress, and recent activity |
| **Discover** | What is worth working on? | Research, candidates, evaluation, recommendations, and approval for production |
| **Production** | What are we creating and what is missing? | Selected Stories, content, focus, script, visuals, and revisions |
| **Publications** | What is ready, sending, or published? | Prepared deliveries, in-flight jobs, issues, history, and eventually a calendar |
| **Results** | How did published work perform? | Available metrics, data coverage, and links to exact published versions |
| **Creative identity** | How does this brand look and sound? | Creative profile, voice, visual identity, references, characters, and composition rules |
| **Editorial strategy** | What do we cover, for whom, and by which criteria? | Editorial profile, lines, acquisition angles, criteria, and preferences |
| **Sources** | Where does our material come from? | Linked sources, shared catalog, AI research, documents, and original content |
| **Channels** | Where can this brand publish? | Connections, accounts, permissions, publishing capability, and sync state |

Manage Topics belongs in the top Topic selector. It shows each Topic's image, name, purpose, and setup state. Administration holds access, technical settings, and diagnostics according to permissions. Help opens guidance relevant to the current view.

### Contextual tabs

| View | Intended tabs |
|---|---|
| Discover | Candidates · Recommended · Dismissed |
| Production | In preparation · Needs review · Ready to publish |
| Publications, initial scope | To publish · Deliveries · History |
| Publications, after scheduling | To publish · Calendar · Deliveries · History |
| Creative identity | Profile · Voice · Visual · Assets |
| Editorial strategy | Criteria · Editorial lines · Angles · Workflow and approvals |
| Sources | Linked · RSS · AI research · Documents · Original content |
| Channels | Connected accounts, with account-specific capabilities |

Tabs are views over shared records. A Story does not move to a separate data system when it reaches Publications. Original content retains its source catalog entry and editing controls; its Story appears in the same editorial queues as every other Story. The global creation action remains **New story**.

## 5. Top bar

### First row: global context and utilities

```text
[Topic image · Current Topic ▾]   [Search this Topic… ⌘K]   [+ New story | ▾]   [Processes]   [Account]
```

- **Topic selector:** name, image or initials, Topic search, and create/manage links. It is the only global brand selector.
- **Search:** eventually opens Stories and Publications by title within the Topic. Unified search and `⌘K` remain proposed capabilities; existing list searches remain until then.
- **New story:** compact direct action. Its menu offers **Add source** and, when permitted, **New Topic**. Sources also exposes Add source in its own view.
- **Processes:** shows real jobs, state, and resume actions. It should not imply a notification inbox that does not exist.
- **Account:** session and personal preferences when integrated. A visual change to the current collector-secret control does not replace authentication work.

Creation dialogs show the selected Topic. Creating in a different Topic requires an explicit choice in the dialog.

### Second row: current task

```text
Discover          [Editorial line ▾]   Candidates · Recommended · Dismissed   [Search content]
Production        [All lines ▾]        In preparation · Needs review · Ready
Creative identity                      Profile · Voice · Visual · Assets       [Save changes]
```

The second row belongs to the active view. It contains its tabs, key filters, and one primary action when relevant. **Prepare my day** belongs in Today, **Add source** in Sources, and **Publish** in the context of a reviewed publication.

Lists may show **All lines**. Running a search or preparation requires a specific line and shows its scope first. Current collection uses the selected line, but evaluation and recommendations may include candidates from the whole Topic; the UI should say so until the backend supports a narrower scope.

Changing Topics preserves the current section where meaningful, updates filters, and discards late responses from the previous Topic. An open draft retains its Topic identity, and unsaved changes are resolved before leaving.

## 6. Desktop layout

The following content and counts are illustrative.

```text
┌─────────────────────┬──────────────────────────────────────────────────────────────────────┐
│ PRESS CRAFTOR    [‹]│ [Current Topic ▾]  Search…  [+ New story ▾]  Processes  Account     │
│                     ├──────────────────────────────────────────────────────────────────────┤
│ DAILY WORK          │ Today                 [Editorial line ▾]       [Prepare my day]      │
│ ● Today             ├──────────────────────────────────────────────────────────────────────┤
│   Discover          │ Needs your review                                                    │
│   Production      3 │ Script pending · Story A                           [Review script]    │
│   Publications    1 │ Images ready · Story B                            [Review images]    │
│   Results           │ Continue working                                                     │
│                     │ Story C · Content ✓ · Focus ✓ · Script in progress [Open story]       │
│ BRAND               │ Today's opportunities                    Recent activity             │
│   Creative identity │ Title · evidence · scores               Search completed            │
│   Editorial strategy│ Title · evidence · scores               Publication confirmed       │
│   Sources           │                                                                      │
│   Channels          │                                                                      │
│ Help                │                                                                      │
│ Administration      │                                                                      │
└─────────────────────┴──────────────────────────────────────────────────────────────────────┘
```

Today prioritizes pending decisions and resumable work. Compact metrics link to the lists behind their counts. A restrained Topic summary can show its purpose and brand image; useful work should start within the first viewport.

## 7. Daily editorial journey

The nine active preparation steps are `collect`, `evaluate`, `recommend`, `approve`, `content`, `focus`, `brief`, `approve-draft`, and `images`. The old `draft` identifier remains for compatibility with earlier runs but is not a separate active step.

| User step | Location | Visible outcome and action |
|---|---|---|
| **1. Search** | Discover | Effective line, query, period, and sources → **Search content** |
| **2. Evaluate** | Discover | Separate editorial value, growth potential, evidence, and reasons → **Evaluate pending** |
| **3. Select** | Discover → Recommended | Compare the leading candidate with alternatives and preserve decision reasons |
| **4. Approve Story** | Candidate details | **Approve for production** opens the Story in Production; it does not approve a future script |
| **5. Review and enrich** | Story → Content | Read, correct, and add material while distinguishing evidence, gaps, and limits |
| **6. Set focus** | Story → Focus | Audience, intent, angle, hook, and editorial direction supported by evidence |
| **7. Create draft and carousel** | Story → Script | Generate and edit the draft and creative structure; show a text preview |
| **8. Approve script** | Story → Script | Approve the exact revision that may be used for images |
| **9. Generate images** | Story → Visuals | Generate, compare versions, and approve selected images |
| **10. Publish** | Story → Publication / Publications | Check account, caption, media order, and final files; authorize delivery and view confirmation |

Manual Stories and documents enter at the stage supported by their material. They still use the same downstream provenance, validation, and approvals. Recommendation, editor selection, and persisted approval should be clear without inventing separate backend states where one action already covers selection and approval.

### Prepare my day

In Today, choose an editorial line and preparation target. Show which steps will run, which require intervention, and which already have results. Provide explicit **Prepare through…** and **Continue through…** actions. Completed steps open their output; inspecting a pending step should not unexpectedly run all earlier steps. Errors should identify the failed step and recovery action. Resuming preserves prior results and external side effects. Processes should keep an in-flight run discoverable after navigation.

### Approval boundaries

Distinguish **Story approval**, **script approval**, **image approval**, and **publication authorization**. Show the version and actor for each. Mark automated validation as automated.

The current daily preparation flow checks that the exact saved draft is approved and current before advancing from `approve-draft` to images. Preserve that human approval checkpoint and make it explicit in the interface. A system transition must never appear as human review. This document does not authorize autonomous publishing.

## 8. Story studio

Open a Story in a workspace with its own URL, a return path to the originating list, and the same Topic identity. Sharing the URL and browser back navigation should preserve filters and list position.

```text
Current Topic        Production / Story title                         Saved · v4

Content ✓   Focus ✓   Script ●   Visuals ○   Publication ○
───────────────────────────────────────────────────────────────────────────
Script and piece order             │ Preview
Cover                              │ [Selected slide / composition]
Body                               │ Text preview until images exist
Closing slide                      │
Caption                            │
───────────────────────────────────────────────────────────────────────────
Review pending · 1 issue to resolve                         [Save] [Review and approve]
```

Five sections contain their own stage actions; detailed process progress remains in a collapsible panel. The main sidebar can collapse to widen the studio while Topic and Production remain accessible.

| Section | Work | Gate for the next step |
|---|---|---|
| Content | Editorial text, contributions, sources, evidence, editing, and enrichment | Sufficient material, known limits, preserved provenance |
| Focus | Line context, intent, audience, angle, hook alternatives, and brief | Direction supported by evidence; revisions remain traceable |
| Script | Carousel or sequence structure, caption, hashtags, accessibility text | Visible automated findings and approval of the exact version |
| Visuals | Asset selection, generation, versions, comparisons, approvals | Current images approved and aligned with the script |
| Publication | Destination preview, account, caption, media order, validations, send action | Current content and destination; explicit authorization for the exact package |

For a carousel, use a thumbnail strip and central canvas, with controls for the selected item in an inspector. Keep versions and evidence in contextual panels. Preserve the configured output ratio, currently 4:5 for feed images and carousel slides; vertical formats use their own dimensions.

Show a script preview after generation, with clearly marked placeholders for missing images. The final publication preview uses the approved files in the package that will be sent. Editing approved content may require new review; explain what became pending while keeping the prior version accessible. Opening a historical draft must not silently regenerate or replace it.

## 9. Brand setup

**Manage Topics** shows compact cards with image, name, purpose, lines, and setup status. Creating a Topic starts a short resumable sequence:

1. **Identity:** name, image or logo, content language, and general context.
2. **Strategy:** purpose, audience, criteria, and first editorial line.
3. **Sources:** link existing sources, add material, or configure research.
4. **Channels:** connect an account when ready to publish.

A missing social connection does not block research or content preparation. It blocks sending to that destination and links to connection settings.

| Existing settings | Proposed location |
|---|---|
| Identity: language, region, presentation | Creative identity → Profile |
| Voice: personality, tone, writing rules | Creative identity → Voice |
| Brand and visual: palette, composition, numbering | Creative identity → Visual |
| Characters, logos, visual references | Creative identity → Assets |
| Place fidelity | Creative identity → Visual → Place fidelity |
| Audience and strategy: narrative intent, framing, CTA | Editorial strategy, with explicit ownership |
| Criteria, preferences, acquisition | Editorial strategy → Criteria / Angles |
| Lines and inherited rules | Editorial strategy → Editorial lines |

Moving a field in the UI does not change its owner or create duplicate configuration. Reuse existing readers, writers, and revisions. Lines show what they inherit from the Topic and which overrides are explicit.

## 10. Publishing, history, and results

**Channels** manages connections and permissions. **Publications** operates deliveries. A Story record gathers all its publications across dates and destinations. Instagram is the current operational destination. Facebook and calendar controls appear when their capabilities are implemented in the relevant PUB stories.

The review screen shows the exact account, preview, caption, images, and order. Technical package, transformation, and hash details belong in diagnostics. User actions are **Review publication** and **Publish now**; internal operations retain their validation and idempotency. When scheduling exists, the same context can offer **Schedule** with visible date, time, and time zone. A Press Craftor schedule does not imply an entry in Meta Business Suite.

History distinguishes **Needs review**, **Ready**, **Scheduled**, **Sending**, **Confirmation pending**, **Published**, and **Needs attention** as supported by actual state. It distinguishes a provider confirmation from a manual tracking mark. If delivery succeeded but the local record is pending, offer record recovery without resending. Production counts Stories; Publications counts deliveries or pending publications and names the unit. A Story can be published to one destination while another is pending.

Results begins with available Instagram metrics and their sync time. Each figure links to the exact publication and version. Do not simulate unavailable cross-channel comparisons or metrics. Collection and deduplication diagnostics belong under Discover or Administration.

## 11. Visual direction and UXDSL

Use hierarchy, space, typography, and consistent interaction to make the workspace feel precise. Favor quiet surfaces, subtle separators, icons from one family, and a clear accent for selection and primary actions. The Topic identity appears through its image, context, and creative output within the active app theme.

| Element | Target |
|---|---|
| Sidebar | 240 px expanded, 64 px collapsed; compact header and spaced groups |
| First top row | About 56 px on desktop; selector and utilities vertically aligned |
| Context row | About 44–48 px; actions do not wrap unpredictably |
| Menu item | 36–40 px high, 16–18 px icon, 14 px label; one row per destination |
| Toolbar controls | Shared 32–36 px desktop height, consistent padding, width based on label |
| Touch controls | At least 44 px interactive area in the mobile design |
| View title | Around 24 px; numbers and supporting text secondary to the task |
| Active state | Tonal background, text weight, and accessible indicator beyond color |
| Radius and shadow | Consistent moderate radius; shadows reserved for elevated surfaces |
| Motion | Brief 120–160 ms transitions respecting reduced-motion settings |

“Same size” means consistent height, icon treatment, padding, and alignment. Width can follow text so the menu and toolbar use space well.

Follow the [project UXDSL guide](uxdsl-agent-guide.md): use `density()` for component spacing, configured typography roles, `@ds-surface`, `@ds-button`, `@ds-input`, and `palette()` for semantic colors. Structural widths and minimum target sizes are intentional layout values. Edit `.uxdsl` source files; builds generate CSS. Reuse `uxdsl.config.js`, `uxdsl.config.cjs`, and `uxdsl.theme.config.cjs` rather than inventing a parallel theme.

## 12. Responsive behavior and states

**Wide desktop:** expanded sidebar, two top rows, side-by-side editor and preview. Keep reading columns comfortable. **Intermediate widths:** collapsed sidebar with an expansion option, secondary controls in explicit menus, and a switchable preview when space is tight. **Mobile:** sidebar drawer, always-visible Topic context, horizontally scrollable contextual tabs, and alternating edit/preview views. A fixed primary action must not cover content or the keyboard.

At every size, keyboard navigation, visible focus, and active destination must work. Dialogs and drawers manage focus and Escape behavior. Empty states explain the next action. Loading and errors stay near the affected area. Saved, unsaved, historical, and in-progress states remain distinct. Jobs stay linked to their Topic and Story after navigation, and badges reflect persisted state. Disabled actions explain their blocker, such as “Image 3 needs approval.”

## 13. Delivery path and acceptance criteria

| Delivery | Outcome | Existing base and limits |
|---|---|---|
| **1. Navigation and context** | New shell, Topic selector, two sidebar groups, active views | Reuse dashboard, creation dialogs, panels, and legacy anchors |
| **2. Brand setup** | Consistent identity, strategy, sources, and channels tabs | Preserve existing profile ownership, snapshots, and permissions |
| **3. Story workspace** | Resumable Content, Focus, Script, Visuals, Publication view | Reuse content viewer, Creative Studio, and daily flow; clarify approvals |
| **4. Editorial operation** | Focused Today, Production and Publications queues, access to Results | Reuse jobs, history, and metrics; add Meta and calendar with their PUB work |

Unified search, an aggregated process panel, fully centralized queues, and a final account menu need their own implementation. Only display controls that perform a complete action. Navigation changes preserve Topic, line, Story, revision, and return path; URLs express relevant context. This redesign does not require renaming internal enums or replacing ingestion, evaluation, generation, or publishing engines.

The design is ready when a user can identify the current Topic and view immediately; create a Story and add a source; find identity, strategy, and connections; reach the next pending decision from Today; understand a Story's stage, version, blocker, and next action; distinguish automated checks, editorial approval, and publication confirmation; and return to the correct context after changing Topics or resuming a run. Top controls should remain ordered and legible at 1440, 1024, and 390 px. Every displayed capability must correspond to working behavior.

## 14. References

- [Component-by-component UI/UX audit](ui-ux-component-audit.md) and [implementation stories UX-01–UX-22](features/ui-ux-consistency.md) extend this specification to internal panels, controls, and workflow states.
- [Dashboard and navigation](../src/app/radar-dashboard.tsx); [Topic and source configuration](../src/app/topic-configuration-panel.tsx).
- [Creative profile](../src/app/creative-profile-panel.tsx), [editorial profile](../src/app/editorial-profile-panel.tsx), and [editorial lines](../src/app/editorial-lines-panel.tsx).
- [Overview](../src/app/topic-overview-panel.tsx), [daily preparation UI](../src/app/daily-preparation-panel.tsx), [step contract](../src/app/modules/stories/daily-preparation.types.ts), and [execution](../src/app/modules/stories/daily-preparation.ts).
- [Creative Studio](../src/app/creative-draft-workspace.tsx) and [Instagram publication candidate](../src/app/instagram-publication-candidate-panel.tsx).
- [Sources and Story creation](features/sources-and-story-creation.md), [editorial collection lines](features/editorial-collection-lines.md), and [earlier Overview proposal](features/topic-overview.md).
- [Instagram and pending Meta scope](features/instagram-publishing.md), [PUB-05](stories/PUB-05.md), [PUB-09](stories/PUB-09.md), and [PUB-14](stories/PUB-14.md).
- [Product and approval rules](../AGENTS.md), [UXDSL guide](uxdsl-agent-guide.md), [tokens](../uxdsl.config.js), [build orchestration](../uxdsl.config.cjs), and [theme](../uxdsl.theme.config.cjs).
