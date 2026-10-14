# Draft 2: hook levers

Status: phase 1 built 2026-10-14 (levers skill v1, focus skill v13). The
editor approved the design the same day: the five risky levers off by
default, the first round's 5/3/3/4 spread, avoiding the brand's last two
levers, and English names everywhere (each brand publishes in its own
language; the catalog is generic, so English is its base).

## 1. Why

The editor proposed a catalog of emotionally proven hook templates (35, in
seven groups) to choose the cover faster, build the story around it, raise
quality and learn, brand by brand, what works. The editor's conditions: they
are guides, never formulas; the posts must not become predictable; which ones
fit depends on the story; and when none fits, the hook is free.

## 2. Principles

- **A lever is a mechanism and a promise, never a sentence.** The models
  receive what a lever does, the facts it needs and what pays it, never the
  template's wording. The Opening writer is already told "never a generic
  formula or a title that could open any story"; the 2026-10-08 review found
  fixed headline formulas weakening covers; readers recognise stock clickbait
  the second time they see it, and Meta demotes engagement bait.
- **Aggressive hook, conservative facts** (AGENTS.md §11–12). Each lever
  names the facts it needs and is not offered without them. A lever that
  implies concealment, an admission, an opinion, a first-person experience
  or outrage is off by default.
- **Free is always possible.** No lever is ever required: the plan may
  choose none, every first round keeps free openings, and a free winner is a
  normal outcome.
- **The kind of story comes from the facts and the Focus**, not from a new
  taxonomy (Press Craftor is domain-agnostic). A figure in the facts makes
  the number and urgency levers available, a list or steps structure the list
  levers; a grave story keeps only the direct ones; the goal leans toward a
  group (saves toward use, shares toward emotion, discussion toward a
  dilemma or a comparison).
- **Not predictable.** No quotas. The plan sees the brand's last levers and
  prefers another when one fits as well. The program refuses stock phrases
  on the cover.

## 3. The catalog (`draft2-levers.types.ts`, listed by the levers skill)

The ids are stable, since they are what gets measured; the numbers are the
editor's. "Pays it" is what must keep the promise. "Grave" marks the levers
allowed when the focus's gravity is grave. Off-by-default levers stay in the
catalog for a brand to turn on later (phase 2), and even then only with the
facts that carry them; the skill does not list them.

### Curiosity

| # | Lever | Needs from the facts | Pays it | Notes |
| --- | --- | --- | --- | --- |
| 1 | `secret`, Secret | A little-known detail the facts state (a condition, an exception, a cost) | Slide 2 states it | Never implies that someone hides it |
| 2 | `suspense`, Suspense | A surprising outcome | Slide 2 reveals it | Never held back past slide 2 |
| 3 | `hidden-reason`, Hidden reason | A cause the facts state | The beat that gives the reason | Never an inferred cause |
| 4 | `provocative-question`, Provocative question | A fact that contradicts a common assumption | Slide 2 answers it | A narrow question, never "everything you know is wrong" |
| 5 | `forbidden`, Forbidden fact | Documented concealment | Slide 2 | Off by default |

### Clash

| # | Lever | Needs from the facts | Pays it | Notes |
| --- | --- | --- | --- | --- |
| 6 | `stop`, Stop right there | A harm the facts attribute to a common action (a warning, a study) | Slide 2: the evidence and what to do instead | Never an invented consequence |
| 7 | `counterintuitive`, Counterintuitive | A finding that contradicts expectation | Slide 2: the finding and its source | |
| 8 | `confession`, Uncomfortable confession | An admission, attributed to whoever made it | Slide 2 | Off by default |
| 9 | `myth`, Busted myth | A belief named in the sources and the fact that refutes it | Slide 2: the proof | |
| 10 | `unpopular`, Unpopular opinion | A position attributed to its author, never the publication's | Slide 2 | Off by default |

### Numbers

| # | Lever | Needs from the facts | Pays it | Notes |
| --- | --- | --- | --- | --- |
| 11 | `stat`, Surprising statistic | A number the facts state | Slide 2 explains it | Needs a figure. Grave: yes |
| 12 | `experiment`, Personal experiment | A first-person account in the sources, told in the third person with its author | The result | Off by default |
| 13 | `signs`, Signs | Two or more indicators the facts give (criteria, symptoms, conditions) | The signs, one by one | Needs a list or steps structure. Grave: yes |
| 14 | `quick-list`, Quick list | A list or steps structure; "without" an obstacle only when stated (free, no sign-up) | The items | Needs a list or steps structure |
| 15 | `comparison`, Comparison | Two options measured the same way | Side by side; a winner only when the facts compare them | Grave: yes |

### Emotion

| # | Lever | Needs from the facts | Pays it | Notes |
| --- | --- | --- | --- | --- |
| 16 | `pride`, Local pride | An achievement of the place or the group | Slide 2: the achievement | |
| 17 | `outrage`, Outrage | A documented reaction (complaints, a petition, a protest) | Slide 2: the reaction, attributed | Off by default |
| 18 | `nostalgia`, Nostalgia | A documented past state and the present one | The present | |
| 19 | `inspiration`, Inspiration | A real protagonist's documented difficulty and achievement | The turn | Never dramatized beyond the facts |
| 20 | `empathy`, Empathy | A common situation of the audience that the story speaks to | Slide 2: the concrete fact | |

### Urgency

| # | Lever | Needs from the facts | Pays it | Notes |
| --- | --- | --- | --- | --- |
| 21 | `right-now`, Right now | An event or measure in effect today | Slide 2: what, where, until when | Needs a figure. Grave: yes |
| 22 | `heads-up`, Heads-up | A practical condition with its date (a closure, a detour, a schedule) | Slide 2: the condition, and the alternative when stated | Needs a figure. Grave: yes |
| 23 | `limited-time`, Limited time | A limited window, with its dates | The dates and how to go | Needs a figure |
| 24 | `deadline-agency`, Your call, until a date | A decision open to the reader (a vote, a consultation, an application) and its deadline | Slide 2: what you decide, how, until when | Needs a figure |
| 25 | `last-chance`, Last chance | A final deadline a few days away, with no extension stated | How to act | Needs a figure |

### Story

| # | Lever | Needs from the facts | Pays it | Notes |
| --- | --- | --- | --- | --- |
| 26 | `in-action`, Start in action | An event with its moment (a date, a time) | The twist | |
| 27 | `close-protagonist`, Relatable protagonist | A person in the facts who noticed or did something, confirmed | What they found | An ordinary person; never a celebrity |
| 28 | `twist`, Unexpected twist | Two facts: the appearance and the truth, with its source | The truth | |
| 29 | `before-after`, Before and after | Two documented states | The after; the images show both | |
| 30 | `dilemma`, Dilemma | A real choice that someone faced, or that the reader faces | The options and what was decided | |

### Authority and use

| # | Lever | Needs from the facts | Pays it | Notes |
| --- | --- | --- | --- | --- |
| 31 | `authority`, Authority | A named expert or institution; agreement only when several sources agree | The fact | Grave: yes |
| 32 | `prediction`, Prediction | A plan or projection attributed to its source | The plan, with its qualifiers | Never the publication's own forecast |
| 33 | `common-mistake`, Common mistake | A documented frequent mistake and the right way | The right way | Grave: yes |
| 34 | `direct-benefit`, Direct benefit | A concrete saving the facts state (free entry, a rebate, a shorter route) | How to get it | Grave: yes |
| 35 | `social-proof`, Social proof | A count of participants the facts state | Who, and how to join | Needs a figure; never an estimated count |
| 0 | `free`, Free | Nothing | As today | Always available |

### What the program checks, and what the judge checks

`eligibleLevers(facts, focus)` keeps the levers that are on by default,
allowed at the story's gravity, with a figure in the facts when the lever
needs one, and with a list or steps structure when it needs one. A figure is
a fact of kind number or date, or a claim written with a digit (so it works
in any language; a number written only in words does not count). The judge
checks the rest: the date is ahead or in effect today, the cause is stated,
the count is not an estimate, the deadline is the last one.

## 4. In the pipeline

### 4.1 The Focus plan chooses

The second Focus call (task "plan") answers, before the spine:

```ts
levers: {
  primary: string;        // a lever id from eligibleLevers, or "free"
  alternatives: string[]; // up to two other ids from eligibleLevers
  factIds: string[];      // the facts that carry the primary
  paidBy: string;         // "slide2" | "middle" | "penultimate" | "last"
}
// and reasons.levers, one sentence
```

- **Why the plan, and not the first call.** The lever is the cover's promise,
  and the spine must keep it: the hook beat makes the promise and the beat at
  `paidBy` keeps it. The decision schema is already 3,492 characters, near
  Anthropic's compiled-grammar limit (about 3,600, the failure of
  2026-10-12); the plan's grew from 875 to 1,214.
- **What it reads:** the levers skill (with the planner's own part), the
  focus skill v13, `eligibleLevers` and `recentLevers`: the levers of the
  Topic's last five approved Draft 2 carousels, newest first
  (`recentDraft2Levers`, from `publication.lever`). The skill: prefer a
  lever that is not among the first two when another fits as well; never
  force one; choose free when none carries the story.
- **Parsing** (`parsePlanLevers`): a primary that is neither free nor
  eligible is a response error, asked for again once with the list;
  alternatives that are not eligible, repeat the primary or come after the
  second are dropped, and a free primary has none; unknown fact ids are
  dropped; a position that is not one is slide 2. The levers are checked
  after the spine and the directions, whose errors come first.
- **The editor decides last.** `levers` is a plan field (`FOCUS_PLAN_FIELDS`)
  and a telling field (`FOCUS_TELLING_FIELDS`). The canvas shows "Hook
  lever" before the spine: the primary (this story's levers by group, plus
  free), two alternatives and "Its promise is kept on". An edit
  (`editedLevers`: any lever on by default, up to two alternatives, a known
  position) sticks, marks the directions stale ("Rewrite the plan" keeps the
  editor's levers and rewrites the spine to them), and asks for new words:
  `wordsFollowFocus` compares every field except the visual direction.

### 4.2 The Opening explores

- **Context:** `focusForModels` carries the plan's levers, each with its
  promise and what pays it (`leversForModels`); the Opening's cached context
  adds `eligibleLevers`; the writer and the judge read the levers skill with
  their own part.
- **The first round keeps its 15 openings** (`leverSpread`): 5 on the
  primary, 3 on each alternative and the rest free, at least a quarter (4);
  all 15 free with no levers or a free primary. The request carries
  `levers.spread`. Sol's proposals choose their lever freely.
- **Each opening carries `lever`,** an id or "free" (a string the parser
  lower-cases; required in the schema; absent on openings written before
  levers). A revision or an edit keeps its opening's lever, as it keeps its
  creative device: the skill asks for it; the program does not force it.
- **The judge scores the lever under "focus":** the cover makes the lever's
  promise with the facts it needs, and slide 2 pays its first instalment. A
  lever never earns points for itself, and one used without its facts is a
  material error. No new criterion; the gate stays at 95 with no criterion
  under 85.
- **Three program findings** (`mechanicalOpeningIssues`), which keep an
  opening from winning like the others:
  - `LEVER_UNKNOWN`: the lever is neither free nor one of this story's.
  - `LEVER_UNSUPPORTED`: the facts the cover cites carry no figure for a
    lever that needs one.
  - `STOCK_PHRASE`: the cover (headline and subheadline) holds a stock
    formula from `STOCK_PHRASES` (English, French and Spanish; matched
    without case or accents).

### 4.3 The words after it

The Closing and the Deck receive the chosen opening's lever with its promise
(`openingForClosing`), and every step reads the plan's levers in the focus,
so the promise is kept through the carousel; the Review's reader reads the
same focus.

### 4.4 Recording

At approval, the chosen opening's lever (the editor's choice, else the
winner's: `chosenOpeningLever`) goes into the publication snapshot
(`publication.lever`), immutable like the rest of the package. The focus
keeps the plan's choice. Neither needed a migration: both live in JSON
columns.

## 5. Learning what works (phase 2, not built)

- **A report per brand and lever group:** posts, reach, saves and shares per
  reach, and follows when Instagram gives them. It reads the media metrics
  already imported (`topic_instagram_media.metrics`), linked to the package
  by `published_package_id` and from there to the Draft 2 session. Free is a
  group of its own.
- **Groups first.** At about one post a day per brand, 35 levers would take
  months to show anything; a lever is shown on its own once it has about ten
  posts in a brand.
- **Observed metrics only,** with their post counts. The report never says
  why a post worked (AGENTS.md §22: keep metrics apart from explanations).
- **Never automatic.** The editor reads the report. Later, the plan may read
  "what performed for this brand" as information, never as a rule. Past
  scores and choices are never rewritten.
- **Per-brand configuration in the same phase:** a lever turned off for a
  brand, or an off-by-default lever turned on (still only with the facts
  that carry it). Until then every brand uses the default catalog, as the
  narrative forms do.

## 6. Cost and speed

- The skill adds about 6,500 cached characters (plus its role's part, 360 to
  950) to the plan, the Opening writer and the judge, and the plan answers
  about 150 characters more: well under a cent per story.
- The speed is expected from more varied first rounds: fewer near-identical
  candidates, and so fewer rounds to the gate. It is measured, not assumed:
  rounds to acceptance, and the Opening's time and cost (already in the
  trace), on the next ten stories against the last ten.

## 7. Worked examples

- **Budget participatif (St-Jean).** Six projects, vote until 16 October.
  Primary `deadline-agency` (24), resting on the six projects and the
  deadline, paid on slide 2 (what you decide, how, until when). Alternative
  `last-chance` (25), only on the 15th and 16th.
- **Mon Vieux-Saint-Jean la nuit.** Closures on 16, 17 and 18 October.
  `heads-up` (22) before the 16th; `right-now` (21) only once the closures
  are in effect (the evaluation already warned: never present them as in
  effect).
- **Brossard's five personalities.** `pride` (16), or free. Never
  `close-protagonist` (27): calling celebrities ordinary people would be
  false.

## 8. Phases

1. **Phase 1, built 2026-10-14:** the catalog and the levers skill (a test
   keeps the skill listing every lever on by default and none off), the
   plan's `levers`, the Opening's spread, tags and findings, the lever for
   the Closing and the Deck, the lever in the publication snapshot, the
   Focus field, and the lever on each Opening version in the canvas. Still
   to do: one real run per brand before believing it, since a new
   structured field needs one real call.
2. **Phase 2:** per-brand configuration and the report.
3. **Phase 3, maybe:** the report as information for the plan.

## 9. Tests

- `draft2-levers.types.test.ts`: the catalog (35, numbered once, seven
  groups, five off), the skill's list, eligibility (figures, structure,
  gravity, off), stock phrases (case, accents, three languages), the spread
  (15, one alternative, free, none; a free opening always competes), the
  plan's parsing, the editor's edits, and the lever for the models, the
  Closing and the publication.
- `draft2-focus.test.ts`: the plan reads the eligible and recent levers, its
  levers join the decision with their reason, and a primary the facts
  cannot carry is asked for again.
- `draft2-opening.test.ts`: the context carries the eligible levers, the
  first request spreads 5/3/3/4 with the plan's levers (all free without
  them), and the findings name an ineligible lever and a stock formula.
