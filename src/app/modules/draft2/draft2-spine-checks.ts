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
 * images to lines like these. Since 2026-10-16, a series too: one subject on
 * more than two thirds of the beats (the spaghetti story drew the noodle on
 * all seven slides, each in another state; the editor: "the images are a
 * series, not a sequence").
 */
export type Draft2SpineProblemCode = "SPINE_AVOID_TERM" | "SPINE_IMAGE_WORDS" | "SPINE_SAME_SUBJECT" | "SPINE_SERIES" | "SPINE_PANORAMA_VIEW" | "SPINE_PANORAMA_FIELD" | "SPINE_PANORAMA_SCENE";

/**
 * What turns a panorama back into slides glued together (the coffee ring's
 * and the altitude's first scenes, 2026-10-18: stripes of colour exactly at
 * the cuts): a background, a field or a band given to one section, or a
 * section told to differ from the one before, in the publications'
 * languages. The scene has one field across its whole width.
 */
export const PANORAMA_FIELD_BREAK = /(?<![\p{L}\p{N}_])(secci[oó]n (?:final |inicial |izquierda |derecha )?sobre (?:fondo )?(?:crema|terracota|teal|verde azulado|azul|menta|ocre|blanco|negro|gris|papel|un|una|el|la)|fondo (?:\p{L}+ ){0,3}(?:plano |liso )?(?:en|de|para) (?:la |esta |cada )?(?:banda|franja|secci[oó]n|slide|diapositiva)|otro fondo (?:que|distinto|diferente)|cierre sobre (?:otro|un) fondo|fondo distinto (?:en|por) (?:cada|esta) (?:secci[oó]n|slide)|section (?:on|over) (?:a |the )?(?:cream|terracotta|teal|navy|mint|ochre|white|black|grey|gray|paper|flat)|(?:a |another |different )?background (?:for|of|in|on) (?:this|each|every|the) (?:section|slide|band|strip)|another background than|section sur (?:un |le |la )?fond|fond (?:\p{L}+ ){0,3}(?:pour|de|dans) (?:cette |chaque )?(?:section|bande|diapositive))(?![\p{L}\p{N}_])/iu;

/**
 * What breaks a panorama's one scene: a section drawn as a cut-away, a
 * close-up, a magnified view or panels cannot share the scene's light,
 * horizon and scale (the coffee ring's first panorama spine: a cut of the
 * drop, a magnified edge, a view from above, two panels), in the
 * publications' languages.
 */
const PANORAMA_BREAK = /(?<![\p{L}\p{N}_])(en corte|corte de (?:la|el|una|un|los|las)|corte transversal|secci[oó]n transversal|cross-?sections?|cut-?away|vue en coupe|en coupe|ampliaci[oó]n|ampliad[oa]s?|zoom|close-?ups?|primer plano|macro|microsc[oó]pic[oa]s?|al microscopio|gros plan|agrandie?s?|paneles|panels?|panneaux|split[- ]screen|d[ií]ptico|diptych|recuadros?|insets?|m[ée]daillons?)(?![\p{L}\p{N}_])/iu;
export type Draft2SpineProblem = { code: Draft2SpineProblemCode; beat: number; detail: string };

/** Two subjects this alike (the share of their longer words) are the same subject, as the visual script counts them. */
const SAME_SUBJECT_OVERLAP = 0.6;
/** A subject's longer words with a plural's final "s" dropped: "two corn kernels" and "a corn kernel", "dos granos" and "un grano" are one subject. */
const stems = (value: string) => new Set([...longWords(value)].map((word) => word.endsWith("s") ? word.slice(0, -1) : word));
export const sameSpineSubject = (a: string, b: string) => comparableText(a) === comparableText(b) || wordOverlap(stems(a), stems(b)) >= SAME_SUBJECT_OVERLAP;

/** The most beats one subject may hold before the images are a series: two thirds of those that name a subject, counted in whole beats. */
export const spineSeriesLimit = (total: number) => Math.floor((total * 2) / 3);
/** The fewest beats with a subject the count needs. */
const SPINE_SERIES_MIN_BEATS = 4;
/** Words of four letters or more that name no subject ("junto a una linguini", "a kernel with dots"), in the publications' languages. */
const FUNCTION_WORDS = new Set(["como", "para", "junto", "entre", "sobre", "desde", "hacia", "cada", "todo", "toda", "todos", "todas", "otro", "otra", "otros", "otras", "mismo", "misma", "with", "from", "that", "this", "their", "over", "under", "beside", "next", "into", "each", "other", "avec", "dans", "pour", "sous", "contre", "sans", "près", "leur", "leurs", "autre", "autres"]);

/**
 * The word a series turns on: the one subject word (its plural's "s"
 * dropped) on more than two thirds of the beats that name a subject, with
 * the beats it is on. A narrative form's anchor recurs by design and is not
 * counted (recurring: its words). Spines written before subjects, or with
 * fewer than four, are not counted.
 */
export function spineSeries(beats: readonly Pick<Draft2SpineBeat, "subject">[], { recurring = "" }: { recurring?: string } = {}): { word: string; beats: number[]; total: number } | undefined {
  const named = beats.map((beat, index) => ({ number: index + 1, words: beat.subject ? stems(beat.subject) : undefined })).filter((entry): entry is { number: number; words: Set<string> } => Boolean(entry.words?.size));
  if (named.length < SPINE_SERIES_MIN_BEATS) return undefined;
  const exempt = stems(recurring);
  const on = new Map<string, number[]>();
  for (const { number, words } of named) {
    for (const word of words) if (!exempt.has(word) && !FUNCTION_WORDS.has(word)) on.set(word, [...(on.get(word) ?? []), number]);
  }
  const [word, numbers] = [...on].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
  return word && numbers.length > spineSeriesLimit(named.length) ? { word, beats: numbers, total: named.length } : undefined;
}

export function spineImageProblems(beats: readonly Pick<Draft2SpineBeat, "slide" | "image" | "subject">[], { avoid = [], recurring = "", panorama = false }: { avoid?: readonly string[]; recurring?: string; /** One scene cut into the slides: its sections share their subject by design, so subjects are not compared. */ panorama?: boolean } = {}): Draft2SpineProblem[] {
  const problems: Draft2SpineProblem[] = [];
  beats.forEach((beat, index) => {
    const number = index + 1;
    const line = comparableText(beat.image);
    const avoided = avoid.find((term) => mentionsTerm(line, term));
    if (avoided) problems.push({ code: "SPINE_AVOID_TERM", beat: number, detail: `Beat ${number} (${beat.slide}) asks the image for "${avoided}", which the brand's identity avoids; show it another way` });
    const broken = panorama ? PANORAMA_BREAK.exec(beat.image)?.[0] : undefined;
    if (broken) problems.push({ code: "SPINE_PANORAMA_VIEW", beat: number, detail: `Beat ${number} (${beat.slide}) asks for "${broken}": a panorama is one scene in one view and one scale, so no section is a cut-away, a close-up or a panel; show the step in the scene itself, at the scene's scale` });
    const striped = panorama ? PANORAMA_FIELD_BREAK.exec(beat.image)?.[0] : undefined;
    if (striped) problems.push({ code: "SPINE_PANORAMA_FIELD", beat: number, detail: `Beat ${number} (${beat.slide}) asks for "${striped}": a panorama has one field and one surface across its whole width, so no section has a background of its own; the scene's field is named once, in the spine's panorama` });
    const asked = forbiddenElement(beat.image) ?? wordsAskedOfImage(beat.image);
    if (asked) problems.push({ code: "SPINE_IMAGE_WORDS", beat: number, detail: `Beat ${number} (${beat.slide}) asks the image for "${asked}": the image model letters only the slide's words, so an image line never asks for numbers, labels, captions, logos or other words` });
    const previous = beats[index - 1];
    if (!panorama && previous?.subject && beat.subject && sameSpineSubject(previous.subject, beat.subject)) {
      problems.push({ code: "SPINE_SAME_SUBJECT", beat: number, detail: `Beats ${index} and ${number} (${previous.slide}, ${beat.slide}) show the same dominant subject ("${beat.subject}"); each image shows something the carousel has not shown yet` });
    }
  });
  // A series: the same subject on most slides, each in another state, reads as one picture seven times.
  const series = panorama ? undefined : spineSeries(beats, { recurring });
  if (series) {
    const keep = spineSeriesLimit(series.total);
    problems.push({ code: "SPINE_SERIES", beat: series.beats[series.beats.length - 1], detail: `The images are a series, not a sequence: "${series.word}" is the dominant subject of ${series.beats.length} of ${series.total} beats (${series.beats.join(", ")}); keep it on at most ${keep} and give the others what the facts hold beside it: the place, the tool, the people's trace, a comparison, the consequence` });
  }
  return problems;
}
