<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — Press Craftor

## 1. Product Definition

Press Craftor is an AI-assisted editorial production and automation platform.

Its purpose is to transform information from heterogeneous sources into trustworthy, branded, publication-ready content through a configurable editorial pipeline.

Press Craftor is not limited to traditional news.

A Story can represent:

- breaking or current news
- technology updates
- local information
- research findings
- recipes
- educational content
- tutorials
- step-by-step guides
- explainers
- reports
- manually authored content
- or any other information that can be transformed into structured editorial content

The platform should therefore remain domain-agnostic at its core.

Do not introduce architecture that assumes every Story is a news article.


---

# 2. Core Product Model

The primary conceptual flow is:

Sources
→ Stories
→ Evaluation
→ Selection
→ Intelligent Draft
→ Creative Production
→ Review
→ Publication
→ Performance Feedback

Different Editorial Lines may configure this pipeline differently, but they should reuse the same underlying platform capabilities.


---

# 3. Editorial Lines

Content is organized into **Topics** and **Editorial Lines**.

A Topic represents an independent publication, brand, channel, or product surface.

A Topic owns shared publication-level configuration, including:

- visual identity
- brand rules and assets
- default language and geographic context
- creative profile
- publishing channels and connections
- publication-level factual and accessibility standards

An Editorial Line represents an editorial strategy within a Topic. A Topic may
contain one or more Editorial Lines that share the Topic's brand and publishing
infrastructure while targeting different audiences, themes, source strategies,
or workflows.

Examples include:

- an AI / technology publication
- a Canadian immigration information channel
- a hyperlocal publication
- a parenting publication
- a cooking and recipe publication
- an educational channel

These examples are illustrative only.

The application must not hardcode behavior specifically for any one Editorial Line.

An Editorial Line may define:

- name
- purpose
- target audience
- topics
- content boundaries
- languages
- geographic relevance
- source strategy
- editorial criteria
- growth criteria
- tone of voice
- preferred formats
- workflow configuration
- automation level
- approval requirements

Editorial Line configuration should drive behavior whenever possible instead of channel-specific application logic.

Editorial Lines may influence creative direction, but they must not duplicate
or silently override the Topic's visual identity, brand assets, or publishing
connections. Any future per-line override must be explicit, bounded, and
resolved through the Topic configuration.

Shared editorial vocabularies — acquisition angle taxonomies, growth-criteria
classification sets, and similar closed value sets an editor configures — are
owned by the Topic, so that every Editorial Line under it reports into one
comparable portfolio. An Editorial Line may narrow or extend that vocabulary
only as an explicit, bounded override resolved through the Topic, never as a
silent second source of truth. These vocabularies are configuration, not code:
no shared module may hardcode the values of any one Topic.


---

# 4. Source-Agnostic Ingestion

Stories may originate from multiple source types.

Examples:

- RSS / Atom feeds
- AI-assisted research
- web research
- APIs
- PDFs
- uploaded documents
- linked documents
- structured datasets
- manually created content
- user-provided evidence

All ingestion mechanisms should converge toward a shared Story model.

Preferred architecture:

RSS ──────────────┐
AI Research ──────┤
Web ──────────────┤
PDF / Documents ──┼──→ STORY
API ──────────────┤
Manual ───────────┤
Other Sources ────┘

Avoid creating isolated editorial pipelines for individual source types.

Source-specific code should be responsible primarily for:

1. acquiring content,
2. extracting useful information,
3. preserving provenance,
4. normalizing it into the shared domain model.

Editorial behavior should happen downstream.

Each source adapter should produce a normalized source contribution with a
stable external identity, source type, acquisition timestamps, provenance,
available content, and source-specific metadata. Adapters must not perform
selection, hook generation, or creative production.

The current implementation contains RSS-oriented and URL-oriented contracts.
Treat these as compatibility surfaces, not as the desired boundary for new
source types. New ingestion work should move toward the shared contribution
contract without creating parallel Story models.


---

# 5. Story Model

A Story represents an editorial opportunity.

It should not be treated as equivalent to a URL or RSS item.

Multiple sources may describe the same Story.

A Story should be capable of accumulating:

- source material
- provenance
- evidence
- extracted facts
- dates
- entities
- media
- enrichment
- evaluation results
- editorial decisions
- workflow state

This distinction is important for deduplication and multi-source enrichment.

For example:

Source A ─┐
Source B ─┼──→ SAME STORY
Source C ─┘

URL equality alone is not sufficient to determine Story identity.

A Story may have no canonical public URL. URLs belong primarily to source
contributions and evidence records, even when one URL is selected as the
preferred public reference.

Story identity should be based on the underlying event, subject, claim set, or
editorial opportunity. Identity resolution may use deterministic identifiers,
semantic similarity, dates, entities, geography, and human review.

When multiple contributions refer to the same Story:

- preserve every contribution and its provenance
- do not overwrite one source's claims with another source's claims
- distinguish corroborating, complementary, and conflicting evidence
- retain source-specific dates, qualifiers, and attribution
- select preferred display content without making it the Story's identity
- make merges reviewable and reversible when confidence is insufficient

Deduplication and source aggregation are related but different operations.
Duplicate detection may propose that records describe the same Story; source
aggregation determines how their evidence is retained under that Story.


---

# 6. Editorial Pipeline

The target conceptual pipeline is:

Discovery
→ Ingestion
→ Normalization
→ Deduplication
→ Enrichment
→ Evaluation
→ Selection
→ Intelligent Draft
→ Creative Direction
→ Asset Generation
→ Publication Draft
→ Review / Approval
→ Publishing
→ Performance Feedback

Not every Editorial Line must execute every stage.

Pipeline stages should remain composable and independently executable whenever practical.


---

# 7. Evaluation

Evaluation concerns must remain explicit.

Do not collapse unrelated editorial decisions into one opaque score unless there is a specific product requirement for doing so.

Scores should generally use a **1–100 scale**.

Use `0` only to represent an unavailable or not-yet-computed signal when a
separate nullable or status field is impractical. A completed scored signal
must be between 1 and 100. Do not interpret `0` as a very weak completed score.

Examples include:

- local / deterministic score
- editorial score
- growth score
- evidence quality
- confidence
- hook score
- factual risk
- format suitability

A Story may be editorially important but have limited growth potential.

Another Story may have exceptional audience-growth potential while being less important editorially.

Both are valid states.


---

# 8. Editorial Score

Editorial Score answers approximately:

> How valuable is this Story for this Editorial Line?

It may consider:

- relevance
- importance
- freshness
- source quality
- evidence
- novelty
- audience fit
- editorial usefulness

Editorial Score must not be interpreted automatically as predicted virality.


---

# 9. Growth Score

Growth Score answers:

> How strong is the underlying Story for acquiring new audience members within this Editorial Line's target audience?

It is NOT general internet virality.

It should evaluate the underlying event or information rather than rewarding an artificially sensational headline.

Useful signals include:

- instant comprehension
- audience breadth
- personal consequence
- curiosity
- surprise / novelty
- shareability
- conversation potential
- headline potential

Famous entities alone must not produce artificially high Growth Scores.

OpenAI, Apple, Google, political figures, celebrities, or other recognizable names may contribute to relevance, but recognition alone is not sufficient evidence of growth potential.


---

# 10. Selection Principle

Press Craftor should distinguish between:

- selecting an important Story,
- selecting a Story with audience-growth potential,
- and presenting that Story effectively.

These are different problems.

Core principle:

> Select for relevance and growth.
> Hook for attention.
> Write for trust.

Selection logic should preserve the underlying evaluation signals so that decisions can later be analyzed and improved.


---

# 11. Hook Generation

Story selection and headline generation are separate stages.

A high-growth Story can still fail because of a weak cover or headline.

When appropriate, the system should generate multiple hook candidates before generating the complete creative.

Hooks may be:

- provocative
- curiosity-driven
- consequence-driven
- surprising
- conflict-oriented
- direct

But they must remain supported by evidence.

Preferred principle:

> AGGRESSIVE HOOK.
> CONSERVATIVE FACTS.

The system may intensify presentation.

It must not intensify facts.


---

# 12. Factual Safety

Creative presentation must never:

- transform an allegation into an established fact
- remove a materially important qualifier
- invent consequences
- invent causality
- fabricate quotations
- fabricate evidence
- claim certainty unsupported by sources
- manufacture controversy
- invent product capabilities
- invent locations, people, statistics, or events

For example:

Supported:

> Apple vs OpenAI Just Got Serious

Potentially unsupported:

> OpenAI Stole Apple's Secrets

when the available evidence only establishes that Apple made such an allegation.

Fact validation must have authority to reject generated hooks or creative content.


---

# 13. Intelligent Draft

Once a Story is selected, the system creates an **Intelligent Draft**.

The Intelligent Draft is the structured editorial bridge between research and creative production.

It should become the primary source of truth for downstream generation.

Depending on the content type, it may contain:

- verified facts
- claims
- evidence
- sources
- qualifiers
- editorial angle
- growth angle
- audience relevance
- selected hook
- alternative hooks
- narrative structure
- captions
- hashtags
- accessibility content
- visual direction
- creative constraints
- publishing metadata

Downstream creative generators should consume the Intelligent Draft instead of independently reinterpreting raw source material whenever possible.

This reduces factual drift between research and publication.


---

# 14. Creative Production

The Intelligent Draft may produce multiple content formats.

Conceptually:

                     ┌→ Carousel
                     ├→ Social Story
                     ├→ Image
INTELLIGENT DRAFT ───┼→ Video
                     ├→ Article
                     ├→ Caption
                     └→ Future Formats

Do not tightly couple the Intelligent Draft to one output format.

Carousel is currently an important format, but it must not define the core domain architecture.


---

# 15. Visual Identity

Each Topic has its own visual identity.

This may include:

- colors
- typography
- layout principles
- illustration direction
- photography rules
- characters
- logos
- spacing
- composition
- tone
- visual motifs
- accessibility constraints

Editorial Lines within a Topic share this identity. A line may provide
editorial tone, audience, format preference, and creative direction, but the
Topic remains the authority for visual brand configuration.

Creative generation must preserve brand identity without producing repetitive template-like output.

Consistency and variation are both requirements.

The system should eventually support controlled variation across:

- layout
- visual archetype
- photography
- illustration
- diagrams
- typography
- data-led covers
- quotes
- characters
- editorial imagery

Avoid solving visual consistency by making every publication visually identical.


---

# 16. Human + AI Collaboration

Press Craftor is designed for configurable human and AI collaboration.

A significant workflow step may be performed by:

- deterministic software
- an AI model
- an AI agent
- a human
- or a combination of them

Do not assume human interaction exists at every stage.

Do not assume AI autonomy exists at every stage either.

The workflow configuration determines responsibility.


---

# 17. Configurable Autonomy

Automation is a workflow configuration, not a separate product architecture.

A supervised workflow might be:

Sources
→ AI evaluates
→ Human selects
→ AI drafts
→ Human edits
→ AI generates
→ Human approves
→ Publish

A highly automated workflow might be:

Sources
→ AI evaluates
→ AI selects
→ AI drafts
→ AI verifies
→ AI generates
→ Human final approval
→ Publish

An explicitly authorized workflow may eventually be:

Sources
→ Evaluate
→ Select
→ Draft
→ Verify
→ Generate
→ Publish
→ Measure

with no required human intervention.

These modes should reuse the same underlying pipeline.


---

# 18. Workflow Step Contract

Where practical, significant workflow stages should expose:

- inputs
- outputs
- executor
- status
- validation
- confidence
- errors
- retry behavior
- approval requirement
- continuation rules

Conceptually:

```ts
type WorkflowStep = {
  id: string;
  executor: "system" | "ai" | "agent" | "human";
  requiresApproval: boolean;
  canAutoContinue: boolean;
};
```

A production workflow step should also define or persist, as appropriate:

- typed or validated input and output contracts
- lifecycle status and timestamps
- executor identity and configuration version
- validation results and confidence
- attempt count and bounded retry policy
- idempotency key
- recoverable and terminal errors
- approval status, approver, and approval scope
- continuation and cancellation rules
- links to immutable evidence and generated artifacts

Workflow execution must be resumable. Retrying a step must not repeat external
side effects such as publishing, charging a provider, or replacing approved
assets. Persist enough state to distinguish an operation that failed before a
side effect from one whose result is uncertain.


---

# 19. Current Implementation and Target Architecture

This document defines both product invariants and the target architecture.
Parts of the current implementation predate that target and remain narrower.

Known transition areas include:

- Story persistence still requires article-oriented URL, language, and region
  fields.
- Some ingestion and Editorial Line source selection is RSS-oriented.
- Multi-source records may currently be represented as duplicate Stories
  rather than contributions to one Story.
- Daily preparation uses a fixed sequence rather than a general workflow-step
  engine.
- Creative briefs and drafts together provide much of the Intelligent Draft,
  but there is not yet one authoritative aggregate.
- Creative generation currently centers on meme, carousel, and ordered
  sequence output.
- Performance metrics are collected but do not yet drive evaluation or
  workflow configuration.
- Local relevance scores do not yet satisfy the `0` rule above:
  `stories.relevance_score` and `topic_stories.relevance_score` are
  `NOT NULL DEFAULT 0` with a `BETWEEN 0 AND 100` check, so `0` means both
  "not yet computed" and a legitimate completed score, and threshold filters
  cannot tell them apart.
- Editorial evaluation infers legacy behavior from the absence of a
  `topic_editorial_profiles` row (`isDefault` drives `useLegacySourceFallback`),
  which changes candidate statuses, freshness windows, source resolution, and
  hard-reject filtering. Creating a profile row as a side effect of unrelated
  work silently changes evaluation for that Topic.

Do not deepen these constraints in new architecture. Preserve compatibility
while moving behavior toward the shared contracts in this guide. Prefer small,
reversible migrations and adapters over parallel replacement systems.

When product intent and legacy implementation differ:

1. preserve user data and historical artifacts,
2. identify the legacy compatibility boundary explicitly,
3. implement new behavior against the target domain model when practical,
4. keep old readers and writers working until their migration is complete,
5. add focused tests for both the target behavior and compatibility path.


---

# 20. Intelligent Draft Authority

The Intelligent Draft is a domain contract, not necessarily one database row.
It may be persisted across versioned records while the migration is underway,
but downstream generation must receive one resolved, validated snapshot.

That snapshot must identify:

- the Story and Editorial Line revision that produced it
- all evidence and source revisions used
- verified facts, qualifiers, conflicts, and unresolved risks
- selected and alternative hooks
- editorial and growth angles
- narrative and format-independent content structure
- Topic creative-profile and brand-policy versions
- validation and approval state

Creative generators must not silently recover missing facts by returning to raw
sources. Missing required information should produce an explicit validation
failure or enrichment request.


---

# 21. Publication and Approval Safety

Human approval is currently required before a draft or generated asset is
treated as ready for publication. The future autonomous mode described above
is a product capability target, not permission to bypass current approval
checks.

Any workflow allowed to publish without human intervention must be explicitly
authorized at the Topic and workflow levels and must define factual validation,
brand validation, destination scope, audit history, rollback or correction
behavior, and bounded publishing limits.

Publishing operations must be idempotent and based on an immutable publication
package. Never reconstruct previously published content from mutable current
drafts.


---

# 22. Performance Feedback

Performance data should remain attributable to the exact publication package,
creative version, Story, Editorial Line, Topic, destination, and publication
time.

Feedback may inform source strategy, evaluation calibration, hook quality,
format choice, and creative variation. It must not automatically rewrite
historical scores or erase the signals that supported a past decision.

Separate observed metrics from inferred explanations. Reach or engagement does
not by itself prove factual quality, editorial value, or causality. Any
automated optimization must preserve factual and brand constraints.


---

# 23. Technology Stack

- Next.js 16 App Router with React 19 and TypeScript.
- Route handlers live under `src/app/api` and server-only business logic lives
  under `src/app/modules`.
- Drizzle ORM with Neon PostgreSQL. Runtime uses `DATABASE_URL`; migrations use
  `DATABASE_URL_DIRECT`.
- Gemini is the primary creative text provider, with Groq as the configured
  fallback where supported.
- OpenAI models act as the independent editorial quality gate over already
  generated drafts, and generate companion stories. They do not produce
  Editorial or Growth Scores; story evaluation runs on Gemini with Groq and
  Cloudflare fallbacks.
- fal.ai GPT Image generates creative assets. Text-to-image and
  reference-guided image-to-image requests use their explicit provider
  endpoints.
- Cloudflare R2 stores private character-reference files.
- UXDSL is the design system for UI styling, compiled by `postcss-uxdsl`
  through `postcss.config.mjs`.


---

# 24. Engineering Rules

Before changing Next.js APIs, conventions, or file structure, read the relevant
guide in `node_modules/next/dist/docs/`. This repository uses a version with
breaking changes that may differ from prior Next.js knowledge. Heed local
deprecation notices.

- Keep provider calls, database access, credentials, and R2 reads on the
  server. Client components may call authenticated route handlers only.
- Never expose R2 object keys, privileged database URLs, provider credentials,
  or long-lived tokens to the browser.
- Treat source content and model-generated content as untrusted data. Validate
  structured AI responses before persistence.
- Preserve historical drafts, image batches, asset versions, publication
  packages, and character or brand snapshots.
- Prefer explicit stale or read-only states over destructive replacement.
- Reuse existing repository and service abstractions.
- Do not add a migration for behavior the existing versioned asset model can
  represent safely.
- Keep creative output at the configured aspect ratio. The current standard is
  4:5 at 1080x1350 for feed images and carousel slides.
- Validate focused changes with `npm run lint` and `npm run build`.
- Use `npm test` for affected domain behavior and `npm run db:check` for schema
  or migration changes.


---

# 25. UI Implementation with UXDSL

Before creating or modifying UI styles:

- read `docs/uxdsl-agent-guide.md`
- inspect the tokens in `uxdsl.config.js` and the build orchestration in `uxdsl.config.cjs`/`uxdsl.theme.config.cjs`
- use the installed UXDSL version as the implementation reference, verifying
  against `node_modules/postcss-uxdsl/src/` when the guide is unclear

Preserve design intent, not just the current computed value:

- Prefer Density for component spacing.
- Prefer Palette for semantic colors.
- Use configured Typography, Surface, Button, and Input roles.
- Reuse existing tokens before creating new ones.
- Change shared theme definitions only for intentional system-wide changes.
- Use direct foundation tokens or native CSS for intentional exceptions.
- Verify responsive behavior and affected shared consumers.


---

# 26. Change Discipline

Architecture changes should preserve provenance, approvals, history, and
external side-effect safety. Avoid broad rewrites that combine domain-model,
workflow-engine, and UI migrations in one change.

When adding a source, format, executor, or publishing destination, extend the
shared contract first. Source-specific and provider-specific modules should
remain adapters around the core domain rather than new isolated pipelines.