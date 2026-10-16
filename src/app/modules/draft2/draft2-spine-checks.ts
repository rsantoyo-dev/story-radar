import { comparableText } from "./draft2-facts.types";
import { longWords, wordOverlap } from "./draft2-funnel";
import { forbiddenElement, mentionsTerm, wordsAskedOfImage } from "./draft2-image-rules";
import type { Draft2SpineBeat } from "./draft2-focus.types";

/**
 * The program's checks on a spine's image lines, run where the plan is parsed
 * (asked again with the rule) and on the editor's hand edits (shown as
 * findings). The spine decides what each image adds, so what the images would
 * pay for later is caught here: a term the brand's identity avoids, words or
 * numbers asked of the image (the image model letters only the slide's words),
 * and the same dominant subject on two consecutive beats. The first real run
 * under the bound spine lost three of five visual issues and both failed
 * images to lines like these.
 */
export type Draft2SpineProblemCode = "SPINE_AVOID_TERM" | "SPINE_IMAGE_WORDS" | "SPINE_SAME_SUBJECT";
export type Draft2SpineProblem = { code: Draft2SpineProblemCode; beat: number; detail: string };

/** Two subjects this alike (the share of their longer words) are the same subject, as the visual script counts them. */
const SAME_SUBJECT_OVERLAP = 0.6;
/** A subject's longer words with a plural's final "s" dropped: "two corn kernels" and "a corn kernel", "dos granos" and "un grano" are one subject. */
const stems = (value: string) => new Set([...longWords(value)].map((word) => word.endsWith("s") ? word.slice(0, -1) : word));
export const sameSpineSubject = (a: string, b: string) => comparableText(a) === comparableText(b) || wordOverlap(stems(a), stems(b)) >= SAME_SUBJECT_OVERLAP;

export function spineImageProblems(beats: readonly Pick<Draft2SpineBeat, "slide" | "image" | "subject">[], { avoid = [] }: { avoid?: readonly string[] } = {}): Draft2SpineProblem[] {
  const problems: Draft2SpineProblem[] = [];
  beats.forEach((beat, index) => {
    const number = index + 1;
    const line = comparableText(beat.image);
    const avoided = avoid.find((term) => mentionsTerm(line, term));
    if (avoided) problems.push({ code: "SPINE_AVOID_TERM", beat: number, detail: `Beat ${number} (${beat.slide}) asks the image for "${avoided}", which the brand's identity avoids; show it another way` });
    const asked = forbiddenElement(beat.image) ?? wordsAskedOfImage(beat.image);
    if (asked) problems.push({ code: "SPINE_IMAGE_WORDS", beat: number, detail: `Beat ${number} (${beat.slide}) asks the image for "${asked}": the image model letters only the slide's words, so an image line never asks for numbers, labels, captions, logos or other words` });
    const previous = beats[index - 1];
    if (previous?.subject && beat.subject && sameSpineSubject(previous.subject, beat.subject)) {
      problems.push({ code: "SPINE_SAME_SUBJECT", beat: number, detail: `Beats ${index} and ${number} (${previous.slide}, ${beat.slide}) show the same dominant subject ("${beat.subject}"); each image shows something the carousel has not shown yet` });
    }
  });
  return problems;
}
