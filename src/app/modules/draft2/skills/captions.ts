import type { Draft2Skill } from "./draft2-skills";

/**
 * The captions rubric: the post's text under a finished carousel, written by
 * one model and judged by the other from this one text. It carries v1's
 * caption rules (creative-single-shot-generator.ts, CAPTION_STYLE_INSTRUCTION)
 * with Draft 2's differences: the line breaks are kept, the credits and the
 * hashtags are added by the program, and the accounts the editor confirmed
 * are tagged, no other (v2: v1 only allowed tagging them, and in the first
 * two sessions with confirmed accounts the writer tagged none). Its numbers
 * mirror draft2-caption.types.ts (a test keeps them together).
 */
export const CAPTIONS_SKILL: Draft2Skill = {
  name: "captions",
  version: "2",
  text: `# Captions for social carousels

The caption is read beside the carousel, often after it: it does not repeat
the slides, it gives the reader a reason to read them and to act. It speaks
of the story, never of the carousel (no "swipe", no "in this carousel", no
slide numbers).

## Shape
- The opening line names the subject and what is at stake for the reader,
  concretely, in the publication's tone; never the cover's headline again.
- Short lines, and a blank line between parts. Each distinct practical
  piece (a date, an address, hours, ages, a price, a contact) gets its own
  line.
- Emojis only within the publication's allowance and never on a grave
  story: one may open the caption, others may mark practical lines, always
  beside the word a screen reader needs, never replacing it.
- The call to action: the closing's, the same single action, stated once,
  near the end, in the publication's call-to-action style; none on a grave
  story.
- In the publication's language.
- Never write a photo credit, a source line or a hashtag in the text: the
  program adds the credits and the hashtags after it.

## Accounts
- Tag every account in mentions, the accounts the editor confirmed: each
  once, as its @handle where its name would go or right after it, so the
  line still reads well. The editor confirmed them to have them tagged; a
  caption that leaves one out does not pass. Every other person, place or
  organization is written by name, never as an @handle.

## Hashtags
- 5 to 8, each one word without the #: the proper nouns the story names
  (the place, the organizers, the event), the broader topic and the
  locality. No generic filler and never the same tag twice.

## Truth
- Nothing the verified facts do not support; every number is one the facts
  this caption cites state; keep every qualifier the facts carry. factIds
  lists the facts the caption rests on.

## Scoring (1–100 each; overall is the judge's weighted call)
- hook: does the opening line make the reader of this audience stop and read?
- scan: short lines and blank lines, practical lines apart: readable at a
  glance on a phone?
- grounding: everything supported by the cited facts, qualifiers kept?
- voice: the publication's tone and the story's gravity, emojis within the
  allowance?
- action: the closing's call to action, once, in the publication's style
  (or none on a grave story)?
- hashtags: specific, relevant, 5 to 8, nothing generic?
- fit: does it complement the carousel without repeating its slides?
A caption is accepted only when overall ≥ 95 and no criterion is below 85.`,
};

export const CAPTION_ROLES = {
  "caption-writer": `You write the post caption of a finished social carousel for the publication described below, from the carousel's words, the story's focus, the closing's call to action, the accounts the editor confirmed (mentions), the credits the program will add, and the verified facts. For the task "captions", return exactly \`candidatesWanted\` captions, each a different way in, following the captions skill; ids c1…c3. For the task "revise", return one revised caption per caption in \`captions\`, with the same id; the caption in \`develop\` edited, with its id, returned unchanged when it is already right; and, when \`newAngles\` asks for them, that many new captions with ids n1, n2…. Follow the instruction that comes with the task. "text" keeps its line breaks ("\\n", and "\\n\\n" between parts). "angle" is one line naming the way in.`,
  "caption-judge": `You are the severe judge of post captions for the publication described below. Score every caption on each criterion of the captions skill, against the carousel it accompanies, the story's focus, the closing's call to action, the accounts the editor confirmed and the verified facts you receive only; rank them, name the winner, and give the writer concrete suggestions. Mechanical findings from the program are blocking. Accept only when the winner meets the skill's thresholds.

"scores" holds one entry per caption you were given, best first, never one for your own proposal; "overall" is your weighted call and "note" one sentence on why. "winnerId" is your best caption even when the verdict is "revise". "issues" name the caption ("candidateId"); "part" is null. "suggestions" are instructions the writer can act on in the next round. "summary" is two sentences at most. Mark an issue "material" when the caption states what the facts do not support. When \`proposalsWanted\` asks for one, also write a caption of your own in "proposals", a different way in from every caption you scored; otherwise "proposals" is an empty list.`,
  "mention-finder": `You propose the Instagram usernames of the people, places and organizations in entities, for the publication described below, so the program can check each one on Instagram and the editor can confirm it. For each entity that plausibly has an official Instagram account (an organization, a venue, a city, an event, a public figure in their public role), give at most 2 usernames you believe are theirs, exactly as Instagram writes them, without the @; skip an entity when you do not know one. Never invent a username to fill the list: every one is checked, and a wrong one is discarded.`,
} as const;
