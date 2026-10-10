# Draft 2 · Step 2: Opening (cover + slide 2)

Implementation brief. Written for an engineer (or agent) with access to this
repository and no memory of the conversations that produced the Draft 2
pipeline. Read AGENTS.md first, then this document end to end, then the files
listed under "What already exists" before writing code.

**Revision 2, after the first real run.** The first loop kept a candidate
unchanged only from 90 up and replaced every other one with a new angle. In
the first run the best opening scored 84, so round 2 rewrote all seven and
lost what worked (voice 85 → 72), and Claude's transcript grew every round
(about 48,000 characters of history by round 2). Now round 1 writes seven
openings, round 2 revises the two best clean versions against their own
issues, round 3 refines the best one, and the program always keeps the
better of a version and its revision. Both models receive a compact snapshot
(the verified facts first, cached) instead of continuing the Facts
conversations. Hooks v2 fixes a headline rule that invited dropping
qualifiers and lets the story's gravity bound the voice.

**Revision 3, after the second run.** The best angle of the second run
plateaued at 90: its strongest version overclaimed ("shift from guardrails to
lethality"), and removing the overclaim made it flatter (86). Revising one
angle cannot get past its ceiling, and the hook matters most, so the step is
now a wider funnel: ten openings; then the three best revised beside two new
angles written from everything Claude found; then the two best lines refined
for Claude's final pick. A tie goes to the better grounded version, and a
revision that keeps the overall but loses grounding counts as a regression
(the second run put the overclaiming c2.2 ahead of c2 on a 90–90 tie). Hooks
v3 adds that a slide 2 headline stating an attributed claim carries its
attribution.

**Revision 4, after the third run.** The funnel's last round never ran: the
first two rounds took 100 s and 91 s, and the request (300 s on Vercel) had
no room left for a third under the time rule. A run now pauses before a round
its request cannot fit, with every round saved, and the canvas continues it
in a new request on its own (a "Continue from round N" button covers a
closed tab). Hooks v4: the strongest angle of all three runs died on change
verbs ("shift from guardrails to lethality", "move from… to", "now
includes") the facts do not state, so a contrast between two facts is told
side by side.

**Revision 5, after the fourth run.** The ceiling stayed near 85: four of
five revisions came out worse, and new angles written in round 2 never beat
round 1's best (73 and 60). Claude, the judge, knows best what scores, so it
now also proposes openings of its own, which Sol develops in the next round:
fifteen openings → Claude scores them and proposes three → Sol revises the
three best, develops the three proposals and writes three new angles (nine)
→ Claude scores them without being told which grew from its proposals, and
proposes one more → Sol revises the two best and develops it (three) →
Claude decides. Which versions grew from a proposal is stored, so the runs
show whether the judge's ideas win and whether it favours them. Voice is
left as it is: a step before the Opening will define the voice and become
part of its request.

**Reliability, after the fifth run.** Fifteen openings made round 1 take
185 s (Sol 73 s, Claude 111.5 s against the adapters' 120 s limit), and the
dev server died while Claude judged round 2, leaving the run "running" with
round 2 written and blocking the story for ten minutes. Now an opening run
sends a heartbeat every 30 s, so a silent run counts as stopped after two
minutes and can be continued from its last checkpoint: a round already
written is judged, not written again. A judgment that would not fit the
request pauses the run too. The writer and the judge get 180 s and 240 s per
call. The canvas follows a run whose request was lost (a dropped connection,
a timeout, a gateway's page) by reading the session, and continues it when
it pauses or stops.

**Revision 6: Claude writes, Sol judges.** In the sixth run the judge's
proposals were the strongest hooks of the run ("The Pentagon wants the
competition it helped end", "A Pentagon fast lane has one senator worried"),
and the writer, asked to develop them, made each one more literal and
weaker (79, 62, 70 and 86, against the device each original had: irony,
worry, a simile, scale). For the Opening the roles are swapped
(`DRAFT2_OPENING_ROLES`): Claude writes, with the verified facts as its
cached context block, and Sol judges, with the facts at the head of its
input (OpenAI caches a repeated prefix) and high reasoning effort. A run
records its roles (`opening.writer`, `opening.judge`); a run stored before
the swap continues with Sol writing and Claude judging, and the canvas
names each run's roles. Facts keeps its roles (Sol extracts, Claude
verifies).

**Revision 7: the judge's proposals compete as written.** To learn whether
the judge's hooks beat the writer's, each proposal now competes twice in
the next round, as the judge wrote it and as the writer edited it, under
fresh ids the judge cannot trace; they take the place of round 2's new
angles, which never won in any run. The writer edits instead of rewriting:
it keeps the proposal's creative device (the irony, surprise, tension or
contrast) and its headline unless a fact or a program rule forces a change,
and an edit that changes nothing is dropped; revisions follow the same
minimal-edit rule. The judge marks an issue "material" when an opening says
what the facts do not; a version with one can still be revised, but never
wins or stands in as the best so far. Each round shows the judge's
originals against the writer's edits, score for score. The sections below
describe revision 7.

## 1. Goal

Draft 2 is the second creative pipeline, built one step at a time beside the
current studio (v1), which it never touches. It is hook-first: Facts → Opening
→ Closing → Deck → Review. Step 1 (Facts) is done: a verified list of facts
with status, qualifier, attribution and verbatim evidence, produced by GPT-6.1
Sol and accepted by Claude.

Step 2 produces the **Opening** of the carousel: the cover (headline +
subheadline) and slide 2 (headline + body), judged as one unit. The cover is
a promise; slide 2 is its first payoff, where the swipe is won or lost. The
step is done when Claude scores the best candidate at least 95/100 with no
blocking issue, within at most three generator rounds: ten candidates, then
the three best revised beside two new angles, then the two best refined for
the final pick. Every version of the run stays stored with its scores so the
editor can choose another; the editor's choice is recorded (it will later
calibrate the judge).

Principles that bind every prompt and check (from AGENTS.md §10–12):

- Select for relevance and growth. Hook for attention. Write for trust.
- Aggressive hook, conservative facts: presentation may be intensified, facts
  never. No allegation becomes a fact; no qualifier disappears; no number,
  cause or consequence is invented.
- A cover that only labels the news ("X announces Y") is not a hook; a cover
  that promises what slide 2 cannot pay is not a hook either.

## 2. What already exists (read these first)

| File | What it gives you |
| --- | --- |
| `src/app/modules/draft2/draft2-facts.ts` | The orchestration pattern to copy: `traced()` around every provider call (session trace + dev console trace), `checkpoint()` after every call, `withCreativeTextBudget` scope, round loop, status transitions, error handling. |
| `src/app/modules/draft2/draft2-facts.types.ts` | Pure contracts: `Draft2Fact`, issue/evaluation shapes, JSON schemas for both providers, parsers that reject malformed answers, `comparableText()`, mechanical checks, `mergeRevisedFacts`. |
| `src/app/modules/draft2/draft2-session.repository.ts` | `createDraft2Session`, `updateDraft2Session`, `latestDraft2Session`, `activeDraft2Session`. |
| `src/app/modules/draft2/draft2-dev-trace.ts` | `draft2DevTrace(event)`: full request/answer on the development console, never in production. |
| `src/db/schema/draft2-sessions.ts` + `drizzle/0100_colossal_cerise.sql` | The session row: `facts`, `evaluation`, `rounds`, `threads`, `trace`, `status`, `step`, `error`. |
| `src/app/api/radar/draft2/facts/route.ts` | Route pattern: `authorizeRadarCollector`, `requireActiveRequestTopic`, error mapping, `maxDuration = 300`. |
| `src/app/draft-2-canvas.tsx` + `src/app/draft-2-canvas.module.uxdsl` | The canvas: step list, Facts panel (rounds, facts, trace), how a run is triggered and rendered. |
| `src/app/modules/stories/openai-structured-response.ts` | Sol adapter. `store: true` + `previousResponseId` continue a stored conversation; the result carries `responseId`. Strict JSON schema: every property required, optional ones nullable. |
| `src/app/modules/stories/anthropic-structured-response.ts` | Claude adapter. JSON outputs through `output_config.format` (Claude Sonnet 5.5 rejects forced `tool_choice`); `history` turns resent with the first user turn prompt-cached; `effort`; the adapter strips `minimum/maximum/maxItems/minLength/maxLength` from schemas, so parsers must enforce those. |
| `src/app/modules/stories/creative-profile.repository.ts` → `getCreativeProfile(topicId)` | The Topic's brand: `name`, `language`, `region`, `platform`, `audience`, `brandPersonality[]`, `formality`, `humor`, `energy`, `optimism`, `provocation` (numbers), `allowEmojis`, `callToActionStyle`, `conversionGoal`, `framingStrategy`. |
| `src/app/modules/draft2/draft2-facts.test.ts`, `draft2-facts.types.test.ts` | Test patterns: the orchestrator loaded in `vm.runInNewContext` with every dependency mocked; pure tests for parsers and checks. |
| `docs/uxdsl-agent-guide.md`, `src/app/ui/primitives.tsx` | UI rules. No raw `<button>` (the lint ratchet fails); use `Button`, `StatusBadge`, `InlineNotice`, `SectionHeader`, `Surface`, `EmptyState`, `LoadingState`. |

Context (revision 2): the Opening does not continue the Facts conversations.
Both models receive the same compact state on every call:

- `openingFactsSnapshot(facts)`: id, claim, status, qualifier, attribution,
  evidence and importance of every verified fact, placed first so the prompt
  cache reads it. Sol gets it at the head of `contents` (OpenAI caches
  matching prefixes on its own); Claude gets it as the adapter's `context`
  option, a separate user block marked for caching.
- Then the round's state: the candidates, the versions they revise with
  their scores, the program's findings and the judge's issues.

Neither model sees the article in this step: the opening is written and
judged from the verified facts only (AGENTS.md §20). `threads` stays on the
session as the Facts step left it.

## 3. Skills: shared, versioned editorial craft

The rubric both models read must be one text, versioned in git, recorded on
the session. Implement skills as TypeScript modules exporting a markdown
string (not `.md` files read at runtime: Vercel's output tracing would need
extra configuration, and nothing is gained today).

```
src/app/modules/draft2/skills/
  draft2-skills.ts      composeInstructions(), the skill registry, versions
  facts.ts              FACTS_SKILL (moved from draft2-facts.ts, same text)
  hooks.ts              HOOKS_SKILL (the opening rubric, §4)
```

```ts
export type Draft2Skill = { name: "facts" | "hooks"; version: string; text: string };

/** Role instructions + the skills the role reads + the Topic's brand brief, in that order. */
export function composeInstructions(role: string, skills: Draft2Skill[], brandBrief?: string): { instructions: string; skillVersions: Record<string, string> };

/** The Topic's voice, from the creative profile, as a short brief both models read. */
export function brandBrief(profile: CreativeProfile): string;
```

`brandBrief` renders: publication name, language ("Write every reader-facing
word in {language}; the article may be in another language"), region,
platform, audience, brand personality words, and the tone numbers as plain
sentences (for example "formality 30/100: conversational; humor 20/100:
rarely; energy 70/100; provocation 60/100: direct, never insulting"). Do not
include visual guidance, call-to-action style or conversion goal: the opening
has no call to action.

Move the Facts prompts into `facts.ts` and have `draft2-facts.ts` use
`composeInstructions("extractor" | "reviewer", [FACTS_SKILL])`. Behaviour must
not change; the existing Facts tests must pass unchanged except for the
import path of the instruction text. Record `skillVersions` on every trace
entry (`Draft2TraceEntry.skillVersions?: Record<string, string>`).

## 4. The hooks skill (`hooks.ts`, version "5")

Version 2 replaced v1's "never a hedge word on the cover", which invited
dropping a qualifier, added that the story's gravity bounds the voice (a
brand with humor 70 must not be marked down for telling a story about
military targeting straight), and added the Revisions section. Version 3
adds that a slide 2 headline stating an attributed claim carries its
attribution (Claude flagged it twice in the second run) and that new angles
are tried beside the revisions. Version 4 adds that a contrast between two
facts is told side by side, never as a change the facts do not state.
Version 5 says the judge's proposals compete as written and as edited, that
an edit or a revision keeps the creative device, and that saying what the
facts do not is a material error. A test keeps the numbers in this text
equal to the constants in §5.

```markdown
# Openings for social carousels

An opening is the cover (headline + subheadline) and slide 2 (headline + body).
The cover makes a promise the reader feels in one second; slide 2 pays the
first instalment of that promise with a fact the cover did not spend. Both are
judged as one unit: a strong cover with a weak slide 2 loses the swipe, and a
cover whose promise slide 2 cannot pay is a lie.

## Cover headline
- At most 8 words, a complete thought with a verb, readable at a glance on a
  phone. The story's tension, consequence or surprise for *this* audience,
  never a label of the event ("X announces Y", "Company launches product").
- No attribution in the headline ("according to", "says", "reports"). Avoid
  hedge words there too, but never by dropping a qualifier: without its
  "could", "proposed" or "reported" a claim says something else. When a claim
  cannot stand without its qualifier or its source, do not headline it; build
  the hook on a directly established fact or on the tension itself ("Apple vs
  OpenAI just got serious", not "OpenAI stole Apple's secrets" when Apple only
  alleges it). The subheadline and slide 2 carry qualifiers and attribution.
- Never a question the deck does not answer, never a number the facts do not
  state, never a famous name as the only draw.

## Cover subheadline
- At most 18 words. The concrete draw that makes the promise credible: a
  figure, a limit, a date, a named mechanism. Carries any qualifier the claim
  needs ("could", "proposed", "reported"). Never restates the headline.

## Slide 2
- Headline at most 8 words; body at most 30 words.
- The first payoff: it delivers the first concrete thing the cover promised,
  using at least one fact the cover did not use. It advances; it never
  restates or explains the cover.
- Attribution lives here when a fact is attributed ("A DOD official says…"),
  in the headline too when the headline states the attributed claim.

## Facts
- Every sentence rests on the verified facts cited by id. Numbers, names,
  dates and qualifiers exactly as the facts state them. An attributed or
  disputed fact never becomes an established one on the cover.
- A contrast between two facts is told as the two facts side by side ("last
  cycle asked for A; this year's asks for B"), never as a change ("shifted
  from A to B", "moved from A to B", "now", "no longer", "turned") unless a
  fact states the change. Side by side, the reader feels the contrast and the
  facts claim no more than they say.
- Saying what the facts do not (an allegation or estimate as established, a
  qualifier or limit dropped, a number, cause, consequence, quote or name
  they do not give) is a material error: it keeps an opening from winning,
  however strong its hook.

## Scoring (1–100 each; overall is the judge's weighted call)
- tension: does the headline make the reader need the next slide?
- payoff: does slide 2 pay the promise with something new and concrete?
- clarity: instant comprehension on a phone, no jargon, no inside knowledge.
- grounding: nothing intensified beyond the facts; qualifiers kept.
- voice: the publication's language, audience and tone, as far as the story's
  gravity allows. A grave story (war, death, injury, illness, legal jeopardy)
  is told straight: never reward a joke on it, and never mark an opening down
  for lacking humor or lightness the subject cannot carry.
An opening is accepted only when overall ≥ 95 and no criterion is below 85.

## Revisions
After the first round, the best openings are revised, and the judge's own
proposals compete beside them, as the judge wrote them and as the writer
edited them. A revision or an edit keeps what made the opening strong: its
creative device (the irony, surprise, tension or contrast), its promise,
slide 2's payoff and its attribution, the facts already approved. It changes
only what the issues name, in as few words as possible. A version that comes
out flatter, more bureaucratic or less clear is worse, even when it is more
precise; the program keeps the better version.

## Examples
Strong: "Give Gemini the goal, not the step-by-step" / slide 2 pays with the
tasks inbox that shows the agent's plan. Strong: "Your AI backup went down too"
/ slide 2 names the three assistants and the shared cloud. Weak: "Enterprise
admins gain direct control over Copilot" (a feature label). Weak: "Anthropic
said it shared findings" (no news, attribution on the cover). Weak: "Your
product demo could speed Pentagon procurement" for a story about AI for
kill-chain targeting: it swaps the story's tension for a sales angle.
```

## 5. Contracts (`draft2-opening.types.ts`)

```ts
export const OPENING_CANDIDATES = 15;          // round 1: the hook matters most, so explore widely
export const OPENING_ROUND_PLAN = [            // per round: best lines to revise, new angles, Claude's own proposals
  { revise: 0, fresh: 15, proposals: 3 },      // Claude scores 15, proposes 3
  { revise: 3, fresh: 0, proposals: 1 },       // + the 3 proposals as written and as edited: the judge scores 9, proposes 1
  { revise: 2, fresh: 0, proposals: 0 },       // + the last proposal as written and as edited: the judge's final pick among 4
];                                             // a round short of clean versions writes new angles in their place
export const OPENING_MAX_ROUNDS = OPENING_ROUND_PLAN.length;
export const OPENING_ACCEPT_SCORE = 95;
export const OPENING_CRITERION_FLOOR = 85;
export const COVER_HEADLINE_MAX_WORDS = 8;
export const COVER_SUBHEADLINE_MAX_WORDS = 18;
export const SLIDE2_HEADLINE_MAX_WORDS = 8;
export const SLIDE2_BODY_MAX_WORDS = 30;

export type Draft2OpeningCandidate = {
  id: string;                       // c1, c2… for new angles; "c3.2" is c3 revised in round 2. Unique within a run.
  cover: { headline: string; subheadline: string; factIds: string[] };
  slide2: { headline: string; body: string; factIds: string[] };
  angle: string;                    // one line: the tension this opening uses
  revisionOf?: string;              // set by the program; the models read it as "revises"
  proposalOf?: string;              // the judge's proposal it comes from; set by the program, never shown to the judge
  asProposed?: boolean;             // the proposal exactly as the judge wrote it, beside the writer's edit
};

export type Draft2OpeningIssueCode =
  | "FACT_UNKNOWN" | "NO_FACTS" | "COVER_TOO_LONG" | "SUBHEADLINE_TOO_LONG"
  | "SLIDE2_HEADLINE_TOO_LONG" | "SLIDE2_BODY_TOO_LONG" | "ATTRIBUTION_ON_COVER"
  | "SLIDE2_RESTATES_COVER" | "SLIDE2_NO_NEW_FACT" | "UNSUPPORTED_NUMBER"
  | "DUPLICATE_CANDIDATE"           // mechanical
  | "WEAK_TENSION" | "PROMISE_NOT_PAID" | "UNCLEAR" | "OVERCLAIMS" | "OFF_VOICE"
  | "LABEL_NOT_HOOK" | "OTHER";     // judge

export type Draft2OpeningIssue = { code: Draft2OpeningIssueCode; candidateId?: string; part?: "cover" | "slide2"; detail: string;
  material?: boolean };             // the judge's call: the opening says what the facts do not; it never wins

export type Draft2OpeningScore = {
  candidateId: string;
  tension: number; payoff: number; clarity: number; grounding: number; voice: number;
  overall: number;
  note: string;                     // one sentence: why this score
};

export type Draft2OpeningEvaluation = {
  verdict: "accept" | "revise";
  winnerId: string;
  scores: Draft2OpeningScore[];      // one per candidate of the round
  issues: Draft2OpeningIssue[];
  suggestions: string[];             // for the writer's next round
  summary: string;
  proposals?: Draft2OpeningCandidate[];  // the judge's own openings (p1, p2… across the run), developed next round
};

export type Draft2OpeningRegression = {
  candidateId: string;               // the revision
  previousId: string;                // the version it revised
  from: number; to: number;          // overall, previous then revision
  worse: string[];                   // "voice 85 → 72", and program findings the previous version did not have
                                     // a regression: lower overall, the same overall with lower grounding, or a new program finding
};

export type Draft2OpeningRound = {
  round: number;
  kind?: "explore" | "refine" | "mixed";  // rounds stored before revision 2 have none (explore)
  candidates: Draft2OpeningCandidate[];
  mechanical: Draft2OpeningIssue[];
  evaluation?: Draft2OpeningEvaluation;
  regressions?: Draft2OpeningRegression[];
  at: string;
};

export type Draft2Opening = {
  status: "running" | "paused" | "ready" | "needs-review" | "failed";  // paused: continues from resumeRound
  rounds: Draft2OpeningRound[];
  candidates: Draft2OpeningCandidate[];   // the last round's; openingVersions(rounds) lists every version
  evaluation?: Draft2OpeningEvaluation;   // the last round's
  winnerId?: string;                       // the accepted opening, or the best version so far (any round)
  editorChoiceId?: string;                 // set by PATCH; wins over winnerId downstream
  editorChoiceAt?: string;
  error?: string;
  resumeRound?: number;                    // the round a paused run continues from
  previousRuns?: Draft2OpeningRun[];       // earlier runs on the session, without their rounds
};
```

JSON schemas (same rules as Facts): one for the writer's answer
`{ candidates: Candidate[] }` and one for the judge's answer (the evaluation).
OpenAI strict mode needs every property in `required` and `additionalProperties:
false`; no optional fields (use `angle: string`, not optional). Claude's adapter
strips numeric and size constraints: parsers clamp scores to 1–100 and cap the
candidate count.

Parsers: `parseOpeningCandidates(text)` and `parseOpeningEvaluation(text)`
throw `Draft2ResponseError` on anything malformed (missing parts, unknown
ids, non-integer scores, a winnerId not in the list). Issue codes outside the
enum become `OTHER`.

## 6. Mechanical checks (program, before the judge)

`mechanicalOpeningIssues(candidates, facts): Draft2OpeningIssue[]` (unchanged in revision 2)

| Code | Rule |
| --- | --- |
| `FACT_UNKNOWN` | A cited factId is not in the verified facts. |
| `NO_FACTS` | cover.factIds or slide2.factIds is empty. |
| `COVER_TOO_LONG` … `SLIDE2_BODY_TOO_LONG` | Word counts above the constants (`wordCount` from `draft-2-canvas.core.ts`, or a copy in the types module). |
| `ATTRIBUTION_ON_COVER` | The cover headline matches `/\b(according to|says?|said|reports?|reported|claims?|selon|dit|affirme|según|afirma|dice)\b/i`. |
| `SLIDE2_RESTATES_COVER` | Jaccard overlap of comparable word sets (words of 4+ letters) between cover headline+subheadline and slide 2 headline+body ≥ 0.5. |
| `SLIDE2_NO_NEW_FACT` | Every slide2.factId is already in cover.factIds. |
| `UNSUPPORTED_NUMBER` | A number in any of the four texts (`/\d[\d.,]*/g`, compared after removing separators) does not appear in the claim or evidence of the candidate's cited facts. |
| `DUPLICATE_CANDIDATE` | Two candidates share a comparable cover headline (except a proposal's original and the writer's edit of it). |

Candidates with mechanical issues still go to the judge (with the findings),
but the program never lets one win: `openingIsAccepted(mechanical,
evaluation)` is true only when `evaluation.verdict === "accept"`, the winner's
`overall ≥ OPENING_ACCEPT_SCORE`, every criterion ≥ `OPENING_CRITERION_FLOOR`,
and the winner has no mechanical issue. If the judge's winner has a mechanical
issue, the program picks the best mechanically clean candidate as `winnerId`
when its scores pass; otherwise the round is a revise.

## 7. The loop (`draft2-opening.ts`)

```ts
export async function runDraft2Opening({ topicId, storyId, sessionId }): Promise<Draft2SessionRow>
```

1. Load the session; require `facts` present and the Facts step ready
   (`step === "facts" && status === "ready"`, or `step === "opening"` to
   rerun). Otherwise `Draft2InputError`. Refuse when `activeDraft2Session`
   reports a run in progress, or when the atomic claim of the session fails
   (`Draft2BusyError`).
2. Load the profile (`getCreativeProfile`) → `brandBrief`.
3. Claim the session: `step = "opening"`, `status = "running"`, a fresh
   `opening`; an earlier opening moves to `opening.previousRuns`.
4. Inside `withCreativeTextBudget`, for `round` 1…3. A round after the
   request's first does not start after 230 s, or when the last round,
   repeated, would end past 280 s: the run pauses instead (`opening.status =
   "paused"`, `resumeRound`, session `status = "needs-review"`), with every
   round saved and the best version so far as `winnerId`.
   - **Targets** (`openingTargets`): the best clean version of each line of
     revisions (scored, no program finding, highest overall, ties to the
     better grounding), as many lines as `OPENING_ROUND_PLAN` asks: none in
     round 1, three in round 2, two in round 3. A version from any round
     counts, so when a revision comes out worse, the next round revises the
     version before it again. `openingFreshWanted` adds a new angle for every
     line it could not revise.
   - **Calls** (`ask`): one path per role. Claude gets the verified facts
     as `context` (a cached block); Sol gets them at the head of its
     `contents`. Both: `maxOutputTokens: 24000`, 240 s per call, no
     conversation. Claude's effort is high; Sol's reasoning is high as the
     judge (medium when a pre-swap run has it writing).
   - **Writer (Claude)**: `composeInstructions("opening-writer",
     [HOOKS_SKILL], brandBrief)`, schema name `draft2_opening`. Contents:
     `openingExploreRequest` ({ task: "openings", candidatesWanted }, plus
     `anglesSoFar` and feedback after a round with nothing clean) or
     `openingRefineRequest` ({ task: "revise", openings: each target with its scores, issues and
     `earlierAttempts` that came out worse; `develop`: the judge's proposals
     from the last round; when the round wants new angles, `newAngles`,
     `anglesSoFar` (every opening tried, with its score) and `feedback` (the
     last judgment's summary and every issue); suggestions; instruction:
     `OPENING_REVISION_INSTRUCTION`, `OPENING_DEVELOP_INSTRUCTION` and "Then
     write N new openings, with ids n1…", as the round needs }).
   - **Ids** (`writtenCandidates`): a revision keeps its target's id and
     becomes `c3.2` (`revisionOf: "c3"`). Each proposal competes twice
     under fresh ids: the writer's edit (answered under the proposal's id,
     `proposalOf: "p2"`; dropped when it changed nothing) and the proposal
     exactly as the judge wrote it (`proposalOf: "p2"`, `asProposed: true`).
     Every other candidate is a new angle, renumbered after every id used
     (`c1…c15`, then `c16…`), up to the number asked. Only a round without
     new angles matches renamed answers in order.
   - **Program**: `mechanicalOpeningIssues`.
   - **Judge (Sol)**: `composeInstructions("opening-judge", [HOOKS_SKILL],
     brandBrief)`, schema name `draft2_opening_review`, contents
     `openingJudgeRequest` after the facts ({ task, round, candidates,
     previousVersions with their scores, mechanicalFindings, and
     `proposalsWanted` when the plan asks }), no history. Candidates never
     carry `proposalOf` or `asProposed`: the judge scores its own ideas
     blind. It marks an issue `material` when the opening says what the
     facts do not; `bestOpeningVersions` and `openingAcceptedWinner` skip a
     version with one, while `openingTargets` may still revise it. Its proposals
     are parsed leniently (a malformed one is dropped) and numbered across
     the run (`renumberedProposals`).
   - **Bookkeeping**: record the round (`kind` explore, refine or mixed);
     `openingRegressions` marks each revision that scored lower than the
     version it revised, kept the overall but lost grounding, or picked up a
     program finding it did not have, with what got worse. The better version
     simply stays ahead in `bestOpeningVersions`.
   - If `openingAcceptedWinner` → `opening.status = "ready"`, `winnerId`,
     session `status = "ready"`. Otherwise `winnerId` = the best version so
     far, kept on the row in case a later call fails. After round 3 →
     `needs-review` with `openingReviewNote` naming the best version's weak
     criteria and its remaining issues.
5. On any thrown error: `opening.status = "failed"`, session `status =
   "failed"`, `error` = message; rethrow (the route maps it).
6. Continue (`resume: true`): a paused opening, or one still marked running
   whose heartbeat stopped (`OPENING_STALL_MS`, two minutes; the busy check
   refuses a live one). It goes on from `openingResumeRound`: the round it
   paused before, else a round written but not judged (judged as it stands,
   with the versions its revisions revise), else the next round; with its
   rounds, trace and choice. It is the same run, so nothing moves to
   `previousRuns`. The first round of a request never pauses, so every
   request advances at least one round or judgment.
7. Reliability: a 30 s heartbeat (`touchDraft2Session`) while the run works;
   an opening session counts as alive for two minutes after its last sign
   (a facts session keeps ten); the writer gets 180 s per call and the
   judge 240 s; after a round's writer, a judgment that the request's time
   cannot fit pauses the run ("Paused before Claude judges round N").

Writer role (`opening-writer`): "You write the opening of a social carousel
for the publication described below, from the verified facts you receive
(cite their ids). For the task "openings", return exactly `candidatesWanted`
candidates, each a different angle on the story's tension, following the
openings skill; ids c1…c15. For the task "revise", return one revised
candidate per opening in `openings`, with the same id; one opening per
proposal in `develop`, with the proposal's id, keeping its idea in your own
writing; and, when `newAngles` asks for them, that many new openings with ids
n1, n2…, each a different angle from every opening in `anglesSoFar`. Follow
the instruction that comes with the task."

`OPENING_REVISION_INSTRUCTION`: "Revise each opening in openings and return
exactly one candidate per opening, with the same id. Preserve its narrative
promise, the payoff slide 2 delivers (with its attribution), every fact claim
already approved and its strongest creative elements. Change only what its
issues name. Never make the writing flatter or more bureaucratic to gain
precision. When earlierAttempts lists a revision that scored lower, do not
repeat what made it worse."

Judge role (`opening-judge`): the v1 text, judging "against the verified
facts you receive only", plus: "On a revision round, each candidate names the
version it revises ("revises"), shown in "previousVersions" with its scores.
Score the revision in full against the skill, not only the issues raised
before, and name in an issue anything it does worse than the version it
revises." Plus: "When `proposalsWanted` asks for them, also write that many
openings of your own in "proposals": a full cover and slide 2 citing fact
ids, each a different angle from every candidate you scored, written to meet
the skill's thresholds; the writer develops them in the next round.
Otherwise "proposals" is an empty list."

Every call goes through a `traced()` helper like the one in
`draft2-facts.ts`, with `step: "opening"`, `skillVersions`, and Claude's
cache reads and writes (`cachedInputTokens`, `cacheWriteTokens`).

## 8. Persistence

Add one column to `draft2_sessions`: `opening jsonb` (`$type<Draft2Opening>()`),
nullable. Generate the migration with `npm run db:generate` (expect
`drizzle/0101_*.sql` with a single `ALTER TABLE … ADD COLUMN "opening" jsonb`),
check with `npm run db:check`, apply with `npm run db:migrate`. The database is
shared between local development and production: additive changes only.

Widen `Draft2TraceEntry.step` to `"facts" | "opening"` and add
`skillVersions?`. Extend `Draft2SessionPatch` with `step` and `opening`.

Editor choice: `recordOpeningChoice({ topicId, sessionId, candidateId })`
sets `opening.editorChoiceId` and `editorChoiceAt`; the id must name a
version of the run (`openingVersions(opening.rounds)`), from any round.
Downstream steps use `editorChoiceId ?? winnerId`. A rerun keeps the earlier
opening, with its choice, in `opening.previousRuns`.

## 9. API

- `POST /api/radar/draft2/opening` body `{ storyId, sessionId, continue? }` → `{ session }`,
  finished or paused; `continue: true` runs a paused or stopped run on.
  Errors: 422 `Draft2InputError`, 409 `Draft2BusyError`, 502
  `Draft2ResponseError`, provider errors through `creativeRouteErrorResponse`.
  `maxDuration = 300`.
- `PATCH /api/radar/draft2/opening` body `{ sessionId, candidateId }` → `{ session }`
  (no provider calls; ids such as `c3` or `c3.2`).
- `GET /api/radar/draft2/session?storyId=` → `{ session }` (the latest row,
  all columns). Keep `GET /api/radar/draft2/facts` working as an alias.

Same auth as Facts: `authorizeRadarCollector`, `requireActiveRequestTopic`
(topicId in the query string), UUID validation.

## 10. Canvas

In `src/app/draft-2-canvas.tsx`:

- Load the session through the new `session` GET.
- Step badges: Facts shows "Verified" when `session.facts` exists and either
  `step !== "facts"` or `status === "ready"`; Opening shows the
  `opening.status` (Running / Ready / Needs review / Failed), else "Not started".
- Below the Facts panel, an "Opening" panel:
  - `Button` "Write the opening" (primary), enabled only when Facts is
    verified; "Write the opening again" when an opening exists. Each request
    has the long timeout; a paused answer is continued at once in a new
    request ("Continuing with round N in a new request…"), and a run left
    paused (a closed tab) shows "Continue from round N" and the Opening
    badge "Paused". A request that ends without an answer (a dropped
    connection, a timeout, a gateway's page) is followed by reading the
    session every 10 s; a run that goes silent shows "Stopped", a notice
    with the time of its last sign, and "Continue from round N".
  - Rounds: for each round, what Sol did ("wrote 15 openings", or "revised
    c3, c5 and c1, developed 3 of Claude's proposals (c16, c17, c18) and
    tried 3 new angles (c19, c20, c21)"), the judge's originals against the
    writer's edits score for score ("p1 84 as written / 79 edited"), what the
    judge proposed for the next round (in a `<details>`), material issues
    labelled "Material", a "Factual error" badge on such versions, any regression ("c3.2 scored 78, below c3's 84 (voice 85 → 72);
    c3 stays the better version"), the judge's summary, the winner's scores
    (five criteria + overall), issues (program findings first, with
    `candidateId`/`part`), suggestions in a `<details>`.
  - The chosen opening (`editorChoiceId ?? winnerId`) rendered as two cards:
    cover (headline, subheadline) and slide 2 (headline, body), with the cited
    fact ids.
  - Every other version of the run as a compact list, best score first:
    id, round and the version it revises or the proposal it develops, headline, subheadline, slide 2
    headline, overall score, program findings, and a `Button` "Choose this
    opening" (quiet) that calls PATCH. The chosen opening shows "Your choice",
    "Accepted" (status ready) or "Best so far".
  - The trace list already renders `trace` entries; show `step` in each row.
- Styles in `draft-2-canvas.module.uxdsl` using density/palette/typography
  roles only (the lint ratchet audits raw values). Reuse `.factItem`,
  `.factHead`, `.factMeta`, `.issueList`; add `.openingCards` (two columns at
  ≥ 960px), `.openingCard` (a 4:5-ish card: `aspect-ratio: 4 / 5` is fine),
  `.scoreRow`.
- No raw `<button>`; `react/no-unescaped-entities` forbids a bare `'` in JSX
  text (use `’`).

## 11. Tests

`src/app/modules/draft2/draft2-opening.types.test.ts` (pure):

- parsers accept a valid answer, reject a missing part, an unknown winnerId,
  a non-object; scores are clamped; unknown issue codes become `OTHER`.
- every mechanical rule with one positive and one negative case; the number
  rule accepts "1.5 trillion" when a fact says "$1.5 trillion" and rejects a
  number no fact states; the overlap rule flags a slide 2 that restates the
  cover.
- `openingIsAccepted`: accepted; refused when a criterion is below the floor;
  refused when the winner has a mechanical issue; the clean-runner-up rule.

`src/app/modules/draft2/draft2-opening.test.ts` (vm harness like Facts, every
dependency mocked):

- accepted on round 1: two calls; Sol's contents start with the facts
  snapshot and carry no stored conversation; Claude gets the snapshot as its
  cached context and no history; `threads` untouched; `opening.status ===
  "ready"`, session `step === "opening"`.
- loop: fifteen openings and Claude's three proposals; then the three best
  revised, the proposals developed and three new angles that know every
  opening tried; then the two best lines and Claude's last proposal for the
  final pick; Claude judges 15, then 9, then 3, each revision beside the
  version it revises, never told which candidates grew from its proposals;
  the run stops at round 3 with the best version in front.
- regression: a revision that scores lower, or keeps the overall but loses
  grounding, never replaces its version; the regression names what got
  worse; round 3 refines the better version and Sol sees the attempt that
  came out worse.
- caching: Claude's context is identical every round, no history
  accumulates, the judge's request shrinks as the rounds narrow, and the
  trace records cache reads and writes per call.
- the judge's winner has a program finding, or a material factual error →
  the clean runner-up wins when it passes; with nothing clean, the next
  round sets the judge's proposals, as written and edited, beside new angles
  in place of the revisions; an edit that changes nothing is dropped; an
  original and its edit may share a headline.
- pause and continue (a fake clock): two rounds fit, the run pauses before
  round 3 with everything saved; a continue request runs round 3 from the
  saved rounds; a writer that uses up the time pauses the run before the
  judgment, and the continue request judges the saved round; a run whose
  server died after a round was written continues by judging that round,
  with nothing written again; continuing a finished run is refused.
- provider failure → `failed`, trace keeps the error, the best version so far
  stays, rethrown; a malformed judgment fails the step.
- `recordOpeningChoice` accepts a version from any round, rejects an unknown
  id, and a rerun keeps the choice in `previousRuns`.

Compare objects built inside the vm by value (`JSON.stringify` or
field-by-field): `assert.deepEqual` fails across realms on prototypes.

Add nothing to `package.json`'s test glob: `src/app/modules/draft2/*.test.ts`
is already included.

## 12. Verification before handing back

```
npm test            # all green (1414+ tests today)
npm run lint        # eslint + UXDSL ratchet; must report no category grew
npm run build       # includes the UXDSL build
npm run db:check    # after db:generate
```

Do not run the real providers: the user tests each step on their development
server and reports the canvas output. If you want a UI check without spending
credits, intercept `GET /api/radar/draft2/session` in a headless browser with
a fixture session (see the pattern the Facts step used) and screenshot the
panel at 1440 px and 390 px.

Commit on `main` with a message that explains the behaviour (what the editor
gets, why the design is as it is), and end it with the attribution line the
repository's instructions require. Exclude the paused observability WIP files
that `git status` shows as modified under `src/app/modules/observability/`,
`src/app/activity-panel.tsx`, `src/app/api/radar/audit/`, and
`src/app/api/radar/radar-api-auth.ts`; they belong to another change.

## 13. Out of scope (do not build now)

Closing, Deck and Review steps; images; publishing; using the editor's choice
to retrain anything; `.md` skill files read at runtime; any change to the v1
studio beyond additive adapter options.
