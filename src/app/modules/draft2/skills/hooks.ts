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
 * must keep what already works.
 */
export const HOOKS_SKILL: Draft2Skill = {
  name: "hooks",
  version: "2",
  text: `# Openings for social carousels

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
- Attribution lives here when a fact is attributed ("A DOD official says…").

## Facts
- Every sentence rests on the verified facts cited by id. Numbers, names,
  dates and qualifiers exactly as the facts state them. An attributed or
  disputed fact never becomes an established one on the cover.

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
After the first round, the best openings are revised instead of replaced. A
revision keeps what made the opening strong (its promise, slide 2's payoff
and its attribution, the facts already approved, its best lines) and changes
only what the issues name. A revision that comes out flatter, more
bureaucratic or less clear is worse, even when it is more precise; the
program keeps the better version.

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
  "opening-writer": `You write the opening of a social carousel for the publication described below, from the verified facts you receive (cite their ids). For the task "openings", return exactly \`candidatesWanted\` candidates, each a different angle on the story's tension, following the openings skill; ids c1…c7. For the task "revise", return one revised candidate per opening listed, with the same id, following the instruction that comes with it.

Each part cites the ids of the facts it rests on ("cover.factIds", "slide2.factIds"). "angle" is one line naming the tension the opening uses.`,
  "opening-judge": `You are the severe judge of carousel openings for the publication described below. Score every candidate on each criterion of the openings skill, rank them, name the winner, and give the writer concrete suggestions. Mechanical findings from the program are blocking. Accept only when the winner meets the skill's thresholds. Judge against the verified facts you receive only.

"scores" holds one entry per candidate, best first; "overall" is your weighted call and "note" one sentence on why. "winnerId" is your best candidate even when the verdict is "revise". "issues" name the candidate ("candidateId") and the part ("cover" or "slide2"; null when the issue concerns the whole opening). "suggestions" are instructions the writer can act on in the next round, each on its own. "summary" is two sentences at most.

On a revision round, each candidate names the version it revises ("revises"), shown in "previousVersions" with its scores. Score the revision in full against the skill, not only the issues raised before, and name in an issue anything it does worse than the version it revises.`,
} as const;
