# Draft 2 · Step 2: Focus

Implementation brief. Written for an engineer (or agent) with access to this
repository and no memory of the conversations that produced the Draft 2
pipeline. Read AGENTS.md first, then `docs/features/draft2-opening.md` (the
step this one feeds), then this document.

## 1. Goal

Between the verified facts and the hook, the editor needs to say what the
story is *for*: which editorial line it serves, whom it speaks to, how it is
framed and told, what it should earn and in what voice. v1 has these as
separate controls on its Focus tab (research context, "Structure for this
brief", "Framing for this brief", "Conversion goal for this brief") and an
"AI · Suggest editorial focus" button that only writes a paragraph; the
editor sets every control by hand.

In Draft 2 the Focus is its own step, the second one:

```text
Facts → Focus → Opening → Closing → Deck → Review
```

- One button ("Decide the focus") asks Claude to decide every field at once,
  each with a one-sentence reason, from the verified facts, the Topic's
  creative profile and its editorial lines.
- The editor can change any field by hand; each change is saved at once and
  the field becomes the editor's.
- Pressing the button again re-decides only the fields the editor did not
  set, so they fit what the editor chose (change the goal to "saves" and the
  direction, the reader consequence and the voice are decided again to match).
  Each edited field can go back to Claude's value.
- The Opening follows the focus: both of its models read it, and its judge
  scores a new criterion, `focus`, inside the acceptance gate.

The focus is guidance, never evidence: every sentence of the carousel still
rests on the verified facts.

## 2. Decisions taken with the editor (2026-10-10)

| Question | Decision |
| --- | --- |
| Fields beyond v1's controls | the reader consequence, the voice of the story, the audience of the story (the Topic's acquisition lens stays out) |
| Who decides | Claude (it verified the facts and writes the opening); Sol stays the independent judge of the opening |
| Pressing the button after editing | the editor's fields stay; the AI decides the rest to fit them |
| How the Opening is judged against it | a new criterion, `focus`, 1–100, inside the gate (overall ≥ 95, every criterion ≥ 85) |

## 3. The fields

| Field | Values | Default the AI starts from |
| --- | --- | --- |
| `line` | one of the Topic's editorial lines that are not archived (id, revision, name, objective) | a line whose collection runs found the story (`editorial_story_contexts`) |
| `audience` | one phrase, at most 300 characters | the creative profile's audience, narrowed to this story |
| `framing` | `reader-consequence` · `explainer` · `authority` | the profile's `framingStrategy`; `auto` means the AI chooses |
| `readerConsequence` | one sentence and the fact ids it rests on, or null | — |
| `structure` | `arc` · `steps` · `list`, with the first fact of each step or item in order (`itemFactIds`) | the profile's `storyStructure` (`hook-steps` → steps, `hook-list` → list, `auto` → the AI chooses) |
| `goal` | `followers` · `discussion` · `saves` · `shares` | the profile's `conversionGoal` |
| `voice` | gravity (`light` · `ordinary` · `serious` · `grave`) and the five tone dials, 1–100 | the profile's dials, moved only as far as the gravity requires |
| `direction` | one paragraph, at most 1,500 characters (v1's editorial focus) | — |
| `visualDirection` | one or two sentences, at most 600 characters: how the images tell this story within the brand's visual identity (the world they live in, who leads them, what recurs); the visual script follows it (since 2026-10-10, focus skill v2; a focus decided before has none) | — |

A framing or structure the profile fixes (not `auto`) is kept unless the
facts cannot support it, and the reason says so.

### Program findings (block the Opening until fixed)

- `NO_READER_CONSEQUENCE`: the framing is `reader-consequence` but the focus
  has no reader consequence.
- `TOO_FEW_ITEMS`: a `list` names fewer than 3 items, or `steps` fewer than 2
  (an editor who switches to a list asks the AI again to pick the items).

The AI's cited fact ids are filtered to the verified facts when its answer is
parsed. A reader consequence the editor writes by hand cites no facts; it is
the editor's direction, like v1's editorial focus.

## 4. The focus skill (`skills/focus.ts`, version "2")

A versioned TypeScript string like the other skills, composed with the role
`focus-editor` and the Topic's brand brief (`composeInstructions`). It
describes each field, the defaults, the rules for `editorChoices` and the
reasons. The trace records `{ focus: "2" }` on the call. Since version 2 the
call also reads the Topic's visual identity in full (as the visual step
does), the frame of `visualDirection`.

## 5. Contracts (`draft2-focus.types.ts`)

```ts
type Draft2FocusValues = {
  line: { id: string; revision: number; name: string; objective: string } | null;
  audience: string;
  framing: "reader-consequence" | "explainer" | "authority";
  readerConsequence: { text: string; factIds: string[] } | null;
  structure: { kind: "arc" | "steps" | "list"; itemFactIds: string[] };
  goal: CreativeConversionGoal;
  voice: { gravity: "light" | "ordinary" | "serious" | "grave"; formality: number; humor: number; energy: number; optimism: number; provocation: number };
  direction: string;
};

type Draft2Focus = {
  status: "running" | "ready" | "failed";
  version: number;                 // +1 on every decision, edit and reset; an opening records the version it followed
  values?: Draft2FocusValues;      // the focus as it stands
  ai?: Draft2FocusValues;          // Claude's own values, kept under the editor's changes
  reasons?: Partial<Record<Draft2FocusField, string>>;
  edited: Draft2FocusField[];      // the editor's fields; the AI keeps them
  lineOptions: Draft2FocusLine[];  // the Topic's lines when the focus was decided, for the editor's select
  decidedBy?: { provider; model };
  decidedAt?: string;
  updatedAt?: string;
  error?: string;
};
```

- `DRAFT2_FOCUS_SCHEMA`: every field required, `reasons` one string per
  field. The Anthropic adapter strips numeric bounds, so the parser clamps the
  dials to 1–100.
- `parseFocusDecision(answer, { facts, lines, editorChoices })`: a malformed
  answer, an unknown enum or a line id outside the options is a response
  error (never persisted); unknown fact ids are dropped; the editor's fields
  overwrite whatever the AI returned for them.
- `applyFocusEdit(focus, field, value, facts)` and `resetFocusField(focus,
  field)`: validate the value, set or restore the field, bump the version.
- `focusFindings(values)` and `focusForModels(values)`: the program's
  findings, and the compact focus the Opening's models read (dials with their
  words, as in the brand brief).

## 6. The step (`draft2-focus.ts`)

`decideDraft2Focus({ topicId, storyId, sessionId })`:

1. The session must belong to the story, its facts must be verified, and no
   other Draft 2 run may be in progress (`activeDraft2Session`, then the atomic
   `claimDraft2Session` with `step: "focus"`).
2. Reads the creative profile, the Topic's lines (`activeEditorialLines`, read
   only: it never creates the default line) and the lines that found the story
   (`storyCollectionContexts`).
3. One Claude call (`generateAnthropicStructuredResponse`, effort high,
   240 s): instructions from the skill and the brand brief, the verified
   facts as the cached `context`, and the request: the story's title, today's
   date, the profile's defaults, the lines, `foundBy` and the editor's
   choices. A 30 s heartbeat keeps the run alive in `aliveSince()` (two
   minutes of silence for `focus`, as for `opening`).
4. Saves the focus: `status: "ready"`, `version + 1`, the trace entry
   (`step: "focus"`). A failure keeps the earlier values, marks the focus and
   the session failed and keeps the trace.

`editDraft2Focus({ topicId, sessionId, field, value | reset })` saves one
field without a provider call. It is refused while Claude is deciding.

## 7. The Opening follows the focus

- A new run needs `session.focus.values`, a focus that is not being decided,
  and no program finding. It records `opening.focus = { version, values }`;
  a continued run keeps its own snapshot. A run stored before this step has
  none and cannot be continued (write it again).
- Both models read `{ focus, verifiedFacts }` where their provider caches it
  (Claude's `context`; since 2026-10-10 the tail of Sol's instructions, see
  `draft2-autopilot.md`).
- Hooks skill v6: a Focus section (framing, structure, goal and voice rules;
  the focus is guidance, not facts), the `focus` criterion, the voice judged
  against the focus's voice, and the judge issue code `OFF_FOCUS`.
- For a `list` or `steps` focus, the number of items the focus names counts
  as a stated number, so "5 things to do" is not an `UNSUPPORTED_NUMBER`.
- Scores stored before this step have no `focus`; they still read as passing
  on it.

## 8. Persistence and API

- `draft2_sessions.focus jsonb` (nullable, additive migration).
- `POST /api/radar/draft2/focus` `{ storyId, sessionId }`: decides the focus.
- `PATCH /api/radar/draft2/focus` `{ sessionId, field, value }` or
  `{ sessionId, field, reset: true }`: one edit.
- `GET /api/radar/draft2/session` already returns every column.

## 9. Canvas

- Steps: 1 Facts, 2 Focus, 3 Opening, then the steps still to build.
- The Focus panel: the button, the version, who decided it and when, the
  findings, and a form with one control per field (a select, a text area, or
  the voice's gravity and five dials). Each field shows Claude's reason, or
  "Your choice" with Claude's value and a "Use Claude's" button. Text fields
  save when they lose focus; selects when they change.
- The Opening's button waits for a focus without findings. When the focus
  changed after the opening was written, a notice says which version the
  opening followed.

## 10. Tests

- `draft2-focus.types.test.ts`: parsing (enums, lines, fact ids, the editor's
  fields kept), edits and resets, findings, the focus the models read.
- `draft2-focus.test.ts`: the step with the provider and database replaced:
  the request, the editor's choices, failures, busy sessions.
- `draft2-opening.test.ts` and `draft2-opening.types.test.ts`: the focus
  required and snapshotted, read by both models, the new criterion, the list
  count, legacy scores.
- `draft2-skills.test.ts` and `draft-2-canvas.core.test.ts`: the new skill,
  role and step.

## 11. Out of scope

- The Topic's acquisition lens (a later option; the vocabulary is the Topic's).
- A judge for the focus itself: the editor reviews it.
- Using the goal in a call to action: that is the Closing's.
