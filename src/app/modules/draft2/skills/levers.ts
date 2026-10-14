import { leverCatalogText } from "../draft2-levers.types";
import type { Draft2Skill } from "./draft2-skills";

/**
 * The levers skill: the mechanisms a cover can use to stop the reader, each
 * with the facts it needs and what keeps its promise (the catalog in
 * draft2-levers.types.ts, listed here from it). The Focus planner chooses the
 * levers with the spine; the Opening's writer writes on them and its judge
 * scores them. Version 1, 2026-10-14, from the editor's catalog of 35.
 */
export const LEVERS_SKILL: Draft2Skill = {
  name: "levers",
  version: "1",
  text: `# Hook levers

A lever is the mechanism a cover uses to stop the reader, and the promise the
rest of the carousel keeps. Levers are guides, never formulas:
- Write the lever's mechanism in the story's own words and the publication's
  language. Never a stock formula ("nobody tells you", "you won't believe",
  "you'll never guess", in any language): readers recognise it and it reads
  as bait. The program refuses the commonest ones.
- A lever needs its facts. Use one only when the facts give what it needs;
  its promise is kept with facts, never with an invented consequence, cause,
  reaction, count or forecast. A lever used without its facts is a claim the
  facts do not support.
- free: no lever, the story's own tension. Always possible, and the right
  choice when no lever carries the story.
- Only the levers in eligibleLevers can carry this story: the others are off
  for the publication, not allowed at this story's gravity, or need a figure
  or a list the facts or the structure do not have.

## The levers
${leverCatalogText()}`,
  roleText: {
    "focus-planner": `## Choosing the levers (task "plan")
levers: primary (an id from eligibleLevers, or "free"), alternatives (up to two other ids from eligibleLevers that could also carry the story; none when the primary is free), factIds (the facts that carry the primary) and paidBy (the spine position whose beat keeps the promise: "slide2", "middle", "penultimate" or "last"; slide 2 always pays its first instalment). Choose from the facts and the decision: what the facts carry, the gravity, the structure, and the goal (saves lean toward use, shares toward emotion, discussion toward a dilemma or a comparison). recentLevers lists the publication's last published levers, newest first: prefer a lever that is not among the first two when another fits as well, never force one, and choose free when none carries the story. The hook beat makes the primary's promise and the beat at paidBy keeps it. reasons.levers: one sentence naming the facts that decide it.`,
    "opening-writer": `## Levers in the openings
Each opening names its lever: an id from eligibleLevers, or "free". In the task "openings", levers.spread says how many openings to write on each lever; the free ones use the story's own tension. A revision or an edit keeps its opening's lever, as it keeps its creative device. New angles may use any lever in eligibleLevers, or none.`,
    "opening-judge": `## Levers in the openings
Each opening names its lever. Score it under focus: does the cover make the lever's promise with the facts the lever needs, and does slide 2 pay its first instalment? A lever never earns points for itself: a free opening with more tension wins. A lever used without its facts is a material error, like any claim the facts do not support.`,
  },
};
