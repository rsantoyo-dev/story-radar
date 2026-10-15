import type { Draft2Skill } from "./draft2-skills";

/**
 * The fairness skill: how a carousel treats the people, businesses and
 * organizations it names when they are accused, investigated, sanctioned or
 * criticized. Every role that writes or judges reader-facing words reads it
 * beside its own rubric. Version 1, 2026-10-14, after an auditor read the
 * Salut Brossard carousel on a resto-bar's liquor-permit suspension: its last
 * slide answered the bar's commitment with "Un engagement, pas un résultat",
 * the publication's own doubt, in a story about organized crime. Version 2,
 * 2026-10-15: a slide told that a man sold cocaine at the bar without saying
 * he was arrested and pleaded guilty in 2023, so the sale read as ongoing; a
 * past action keeps its outcome when the facts give one.
 */
export const FAIRNESS_SKILL: Draft2Skill = {
  name: "fairness",
  version: "2",
  text: `# Fairness to the people a story names

When the story names a person, a business or an organization that is
accused, investigated, sanctioned, sued, charged, convicted or criticized,
the carousel reports; it never judges. Fairness is what protects the
publication and keeps the reader's trust.
- No verdict of the publication's own: no irony, scare quotes, insinuation or
  doubt about the party's sincerity, guilt or promises ("a promise, not a
  result", "so-called", "supposedly"), and no adjective that judges them.
  The verdict is the institution's, attributed to it.
- An accusation, a finding or a charge keeps its source as the facts give it
  ("according to the tribunal", "police say"): a charge is not a conviction,
  a tribunal's finding is the tribunal's.
- The party's response, commitment or defence, when the facts give it, is
  stated plainly and attributed, in its own terms ("The bar commits to
  expelling…"), with the weight the facts give it: never framed to be
  disbelieved.
- What a measure is and is not, as the facts state it: a suspension is not a
  closure, a charge is not a conviction, a decision not yet applied is not
  in force.
- A new decision about events of past months or years keeps their dates:
  the reader must not take them for today's news.
- A past action keeps its outcome when the facts give one: a man the facts
  say sold drugs at the bar and was arrested and pleaded guilty in 2023 is
  told with it ("il a plaidé coupable en 2023"). Without it, the action reads
  as still going on, against him and against the place.
- A sentence that judges, insinuates or reads as an attack beyond the facts
  is a material error: it keeps a candidate from winning.`,
};
