import type { Draft2Skill } from "./draft2-skills";

/**
 * The openings rubric: what a cover and its slide 2 must do, and how they
 * are scored. The writer and the judge read this one text, so the judge
 * scores exactly what the writer was asked to write. Its numbers mirror the
 * constants in draft2-opening.types.ts (a test keeps them together); a
 * change to the text is a new version.
 *
 * Version 2, after the first real run: the headline rule no longer invites
 * dropping a qualifier, voice yields to the story's gravity, and revisions
 * must keep what already works. Version 3, after the second: a slide 2
 * headline that states an attributed claim carries its attribution, and new
 * angles are tried beside the revisions. Version 4, after the third: a
 * contrast between two facts is told side by side, never as a change the
 * facts do not state (the strongest angle of three runs failed there).
 * Version 5, after the sixth: the judge's proposals compete as written and
 * as edited, an edit keeps the creative device, and saying what the facts
 * do not is a material error that keeps an opening from winning.
 * Version 6, with the Focus step: the opening follows the story's focus
 * (framing, structure, goal, voice), the voice is judged against the
 * focus's, and a sixth criterion scores how well the opening follows it.
 * Version 7, 2026-10-14: the cover is a strong headline and little else; the
 * subheadline is one short line of at most 12 words, never a sentence of
 * details. Version 8, the same day, after an auditor read a cover on a
 * resto-bar's liquor-permit suspension: the cover hid the cause behind a
 * teaser, shortened "permis d'alcool" to "permis" and left the reader free to
 * believe the bar had closed. The cover says the cause when it is the draw,
 * names things as the facts do and the place readers recognize, and the
 * cover or slide 2 states the focus's guards (MISLEADS when it does not).
 * Version 9: a guard is prevented with what the facts say (what the measure
 * is, when it starts, the period), never a reassurance they do not give
 * ("it is not closed"); one of its facts is enough. Version 11, 2026-10-18:
 * the headlines' and the subheadline's numbers are an aim with a tolerance
 * (8 words, 10 at the very most; 12, 16 at the very most): a text past the aim
 * but within the tolerance is not a flaw, for the writer or the judge.
 */
export const HOOKS_SKILL: Draft2Skill = {
  name: "hooks",
  version: "12",
  text: `# Openings for social carousels

An opening is the cover (headline + subheadline) and slide 2 (headline + body).
The cover makes a promise the reader feels in one second; slide 2 pays the
first instalment of that promise with a fact the cover did not spend. Both are
judged as one unit: a strong cover with a weak slide 2 loses the swipe, and a
cover whose promise slide 2 cannot pay is a lie.

## Focus
Every story arrives with its focus, decided before the opening and reviewed
by the editor: the editorial line it serves, its audience, the framing, the
reader consequence, the structure, the goal, the voice and a direction. The
opening follows it:
- framing "reader-consequence": the cover opens with the reader consequence,
  in the reader's terms, before any organization, figure or place;
  "explainer": with the mechanism or the clearest account of what happened;
  "authority": with the decision, institution or expert the facts support.
- structure "list": the cover headline promises the list, with its count
  (the number of items the focus names, which counts as stated) and its
  subject, and the place and period when the facts state them; the
  subheadline gives its draw; slide 2 is the first item, as its facts state
  it. "steps": the cover promises the result; slide 2 gives what the reader
  needs first or the first step. "arc": the tension and its first payoff.
- goal: what the promise invites. "followers": a reason to come back;
  "saves": something worth keeping; "shares": something worth sending to
  someone; "discussion": a question the facts leave open. It shapes the
  promise, never the facts.
- voice: the gravity and tone the focus sets, in the publication's language
  and personality; it wins over the publication's defaults.
- audience and direction: whom the opening speaks to, what it leads with and
  what it leaves for later.
The reader consequence and the direction are guidance, not facts: every
sentence still rests on the verified facts it cites.

## What the reader must not misread
The focus may name guards: what a reader who stops at the cover could
wrongly believe, each with the facts that prevent it (a suspension read as a
closure, a decision about past years read as today's news). The cover or
slide 2 prevents each one in plain words, citing one of its facts, with what
the facts say: what the measure is (a liquor-permit suspension of 21 days),
when it starts, the period the events belong to. Never a reassurance the
facts do not give ("the bar is not closed", "it stays open"): that is a
claim of its own. A guard the headline cannot hold goes in the subheadline
or slide 2, never later. The program refuses an opening that cites none of a
guard's facts; the judge names one whose words leave the misreading open
(MISLEADS).

## Cover headline
- At most 8 words is the aim, 10 at the very most: a complete thought with a
  verb, readable at a glance on a phone; 9 or 10 when the thought needs them
  is no flaw. The story's tension, consequence or surprise for *this* audience,
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
- When the news is a sanction, a closure, a ruling or an accusation, its
  cause is usually what stops the reader: say it on the cover (in the
  subheadline when the headline cannot hold it), with the qualifier or
  source the facts give it; never hide it behind a teaser ("the reason fits
  in two facts").
- Name things as the facts do: a liquor permit stays a liquor permit, never
  a bare "permit" a reader could take for another one; a shortened noun that
  blurs what is at stake misleads.
- Name the place this audience recognizes (the neighbourhood, the area, the
  venue) when the facts give it: a local reader places the story at once.
- The cover sells the experience, never a chore: no "vérifie", "confirme",
  "check" or "renseigne-toi" on it (the program refuses them). A check or a
  condition goes in its item's practical line, or in the caption, once.
- A list's cover names only a theme every item shares: five outings of
  which one is a night under the stars are not "cinq sorties d'Halloween".

## Cover subheadline
- At most 12 words is the aim, 16 at the very most, one short line: the one concrete draw that makes the
  promise credible (a date, a price, a count, a limit, or the cause when the
  headline states the consequence), never a sentence of details; the
  headline carries the cover and the details belong to the slides after it. Carries any qualifier the claim needs ("could",
  "proposed", "reported"). Never restates the headline.

## Slide 2
- Headline at most 8 words is the aim, 10 at the very most; body at most 30
  words.
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
- voice: the voice the focus sets (its gravity and tone) in the
  publication's language. A grave story (war, death, injury, illness, legal
  jeopardy) is told straight: never reward a joke on it, and never mark an
  opening down for lacking humor or lightness the subject cannot carry.
- focus: does the opening follow the focus: its framing, reader
  consequence, structure, audience and goal? A strong opening that ignores
  the focus the editor approved misses its brief.
- originality: is this the angle, the device or the image a reader has not
  met on this subject, within the facts, as the originality standard scales
  it? A title formula, a stock promise or the first angle anyone would take
  caps at 70, however clean.
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
kill-chain targeting: it swaps the story's tension for a sales angle.`,
};

/** Who the Opening roles are; composeInstructions adds the hooks skill and the Topic's brand brief after them. */
export const OPENING_ROLES = {
  "opening-writer": `You are an expert editor of social carousels writing for this publication's audience: concrete, natural, with tension the facts sustain, never a generic formula or a title that could open any story. You write the opening of a social carousel for the publication described below, from the verified facts you receive (cite their ids), following the story's focus. For the task "openings", return exactly \`candidatesWanted\` candidates, each a different angle on the story's tension, following the openings skill; ids c1…c15. For the task "revise", return one revised candidate per opening in \`openings\`, with the same id; one edit per proposal in \`develop\`, with the proposal's id, keeping its creative device and returning it unchanged when it is already right; and, when \`newAngles\` asks for them, that many new openings with ids n1, n2…, each a different angle from every opening in \`anglesSoFar\`. Follow the instruction that comes with the task.

Each part cites the ids of the facts it rests on ("cover.factIds", "slide2.factIds"). "angle" is one line naming the tension the opening uses. A proposal in \`develop\` marked "byEditor" is the editor's own hook or idea: keep its hook and its device, in its words when they hold, write what it lacks (a subheadline, slide 2) from the facts, and cite them.`,
  "opening-judge": `You are the demanding editor of carousel openings for the publication described below: for every candidate you name what works and must be kept, what fails, and the concrete change that fixes it; a correction that costs a candidate its strength is worse than the flaw it removes, so the writing never gets flatter, safer or more generic to gain precision. Score every candidate on each criterion of the openings skill, rank them, name the winner, and give the writer concrete suggestions. Mechanical findings from the program are blocking. Accept only when the winner meets the skill's thresholds. Judge against the verified facts and the story's focus you receive only; name an opening that departs from the focus in an OFF_FOCUS issue.

"scores" holds one entry per candidate you were given, best first, never one for your own proposal; "overall" is your weighted call, "note" one sentence on why, and "keep" one sentence on what in it must survive revision (its device, its line, its image idea): the writer protects it. "winnerId" is your best candidate even when the verdict is "revise". "issues" name the candidate ("candidateId") and the part ("cover" or "slide2"; null when the issue concerns the whole opening). "suggestions" are instructions the writer can act on in the next round, each on its own. "summary" is two sentences at most.

On a revision round, each candidate names the version it revises ("revises"), shown in "previousVersions" with its scores. Score the revision in full against the skill, not only the issues raised before, and name in an issue anything it does worse than the version it revises.

Mark an issue "material" when the opening states something the facts do not: an allegation, estimate or proposal stated as established; a qualifier or limit dropped so the claim reads broader; a number, cause, consequence, quote or name the facts do not give. Name an opening whose cover and slide 2 leave open a misreading the focus guards against in a MISLEADS issue, also material. A material issue keeps the opening from winning. Style, clarity, tension and voice are never material.

When \`proposalsWanted\` asks for them, also write that many openings of your own in "proposals": a full cover and slide 2 citing fact ids, each a different angle from every candidate you scored, written to meet the skill's thresholds; in the next round each competes as you wrote it and as the writer edited it. Otherwise "proposals" is an empty list.`,
} as const;
