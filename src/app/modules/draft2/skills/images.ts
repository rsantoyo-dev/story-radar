import type { Draft2Skill } from "./draft2-skills";

/**
 * The image review rubric: what Sol checks on each finished slide beyond
 * v1's review (creative-image-review.ts, appended to its instructions): the
 * slide's words as they appear, the overlays added after generation, the
 * lettering, and how the image tells its beat. The program compares the
 * transcription with the slide's words; Sol only reads. Version 2 adds
 * anchorShown: whether a narrative form's anchor is in the image. Version 3,
 * 2026-10-14, adds inventedDetails: what the image shows that the slide's
 * facts and words do not give (a market stall for "various vendors", Parisian
 * façades for the Vieux-Saint-Jean), and asks for a scene that passes for a
 * photograph of a named event or place to be named as invented.
 */
export const IMAGES_SKILL: Draft2Skill = {
  name: "images",
  version: "3",
  text: `# Reviewing a carousel slide image

You see one finished slide: the image the model made, with the publication's
logo and the small page number added afterwards where the brand puts them,
and, on some slides, a verified photo or map pasted unchanged.

- transcription: every word of the slide's own text as it appears in the
  image, line by line, in reading order, exactly as drawn (a misspelling, a
  missing accent or a doubled word stays as it is). Leave out the page
  number and the publication's own logo.
- textCovered: true when the logo, the page number, a pasted photo or a map
  covers or touches any of the slide's words.
- textNote: lettering that is broken, cut at an edge, illegible on a phone,
  or partly invented, in a few words; otherwise an empty string.
- storyNote: one sentence on how the image tells what happens on this slide
  (slide.beat) and plays with its headline (slide.headlineLink), and what it
  would need to tell it better; an empty string when it already does. It
  informs the editor and never blocks the image.
- anchorShown: when you receive an anchor (the guide or the object that is on
  every slide of this carousel), true only if the image shows it as
  described, recognisably the same one; false when it is missing or looks
  like another. True when you receive no anchor.
- inventedDetails: what the image shows that the slide's facts and words do
  not give, each in a few words: products, food, signage, a style of
  architecture, performers or acts, a crowd at the event; and what
  contradicts what the words name (a fluorescent 1980s cabaret drawn as a
  contemporary dance on a dark stage). An empty list when there is none.
- A scene that could pass for a photograph of a named event, show, venue or
  place without its verified material (its stage, its public, its stalls,
  its street) is an invented view of it: say so in inventedNamedSubject,
  even when no one in it is identifiable.
Judge only what you can see.`,
};

export const IMAGE_ROLES = {
  "image-judge": `You review one finished slide image of a social carousel for the publication described below, before the editor sees it, from what is visible in the image only. You receive the slide's words, what happens on the slide and how it plays with its headline, the verified material pasted on it, the brand's characters on it, the facts it cites and the brand's identity rules. Answer every field of the schema.`,
} as const;
