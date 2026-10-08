import type { CreativeKeyFact, CreativeQualityIssue, GeneratedCreativeBrief, GeneratedCreativeDraft } from "./creative-content.types";

/**
 * The cover decides whether anyone reads the rest. After the script is
 * written, a strong model writes several covers with different mechanisms for
 * the configured audience, an independent judging call scores them blind,
 * deterministic gates reject any cover that breaks the evidence rules, and the
 * winner replaces the writer's cover only when it is clearly better. The
 * interior slides are never touched: the cover is written knowing what they
 * already pay off.
 */
// v6: a list carousel's covers all promise the whole list (count, subject, scope).
export const CREATIVE_HOOK_TOURNAMENT_PROMPT_VERSION = "hook-tournament-v6";
export const HOOK_TOURNAMENT_CANDIDATES = 6;
const HOOK_MAX_CANDIDATES = 10;
const HOOK_HEADLINE_MAX_WORDS = 12;
const HOOK_SUBHEADLINE_MAX_WORDS = 24;
/** Covers taken into the polishing round. */
export const HOOK_FINALISTS = 2;
/** Slide 2 is the first thing after the swipe: a short headline and, rarely, a label. */
const SECOND_HEADLINE_MAX_WORDS = 12;
const SECOND_SUBHEADLINE_MAX_WORDS = 10;

export const HOOK_MECHANISMS = ["recognition", "place", "pride", "human-scale", "consequence", "curiosity", "contrast"] as const;
export type HookMechanism = (typeof HOOK_MECHANISMS)[number];

const HOOK_MECHANISM_GUIDE: Record<HookMechanism, string> = {
  recognition: "The reader sees themselves: their routine, weekend, street, commute or kind of household. A question may invite them in when the facts say the thing happened where they live, but it must not assume anything about them that the facts do not support.",
  place: "A place the audience knows by name or by habit anchors the news.",
  pride: "Local pride or belonging, only when the facts establish that something notable happened here; keep any hedge such as 'selon' or 'il s'agirait'.",
  "human-scale": "A figure from the facts made tangible, without inventing comparisons, totals or arithmetic.",
  consequence: "A concrete change in what the reader pays, uses, does or decides, only when a fact establishes it.",
  curiosity: "A specific open question that the slides answer, never a vague tease.",
  contrast: "A supported contrast or surprise between two facts.",
};

export type HookCandidate = {
  headline: string;
  subheadline: string;
  /** Slide 2's headline, written to pay off this cover; empty keeps slide 2 as it is. Absent in tournaments before v5. */
  secondHeadline?: string;
  secondSubheadline?: string;
  /** "incumbent" is the writer's own cover, which competes like any other. */
  mechanism: HookMechanism | "incumbent";
  segment: string;
  factIds: string[];
  payoffUnitOrder: number;
};

export type HookScore = {
  recognition: number;
  clarity: number;
  pull: number;
  fidelity: number;
  payoff: number;
  naturalness: number;
  /** Slide 2's headline as this cover's payoff, and its fidelity; absent before v5. */
  slide2?: number;
  slide2Fidelity?: number;
  reason: string;
};

export type CreativeHookTournament = {
  promptVersion: string;
  model: string;
  judgeModel: string;
  at: string;
  /** Round 1 is the open field, round 2 the polished finalists; scores are from the last judging each cover took part in. */
  /** secondDropped names the rules a dropped slide 2 suggestion broke; the cover still competed. */
  candidates: (HookCandidate & { score?: HookScore; total?: number; rejected?: string; secondDropped?: string; round?: 1 | 2 })[];
  /** Index into candidates; 0 is the incumbent. */
  selectedIndex: number;
  replaced: boolean;
  /** The cover an editor picked from this tournament; it teaches later judgings the publication's taste. */
  editorChoice?: { index: number; at: string };
};

/** One past decision of this publication's editor: the cover kept over the alternatives. */
export type HookTasteExample = { chosen: string; over: string[] };

const coverText = (candidate: Pick<HookCandidate, "headline" | "subheadline">) =>
  candidate.subheadline ? `${candidate.headline} — ${candidate.subheadline}` : candidate.headline;

/** The editor's pick and the best covers it was chosen over, from a tournament that has one. */
export function hookTasteExample(tournament: CreativeHookTournament): HookTasteExample | undefined {
  const chosen = tournament.editorChoice ? tournament.candidates[tournament.editorChoice.index] : undefined;
  if (!chosen) return undefined;
  const over = tournament.candidates
    .filter((candidate) => candidate !== chosen && !candidate.rejected && candidate.total !== undefined)
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
    .slice(0, 3)
    .map(coverText);
  return over.length ? { chosen: coverText(chosen), over } : undefined;
}

export class CreativeHookTournamentResponseError extends Error {}

/** Selection weights: being seen and wanting to swipe matter most; fidelity is also a gate. */
const HOOK_WEIGHTS = { recognition: 0.25, pull: 0.2, clarity: 0.2, fidelity: 0.15, payoff: 0.1, naturalness: 0.1 } as const;
const HOOK_GATES = { fidelity: 90, clarity: 80, payoff: 70 } as const;
/** A slide 2 headline replaces the current one only when it is faithful and pays the cover off. */
const SECOND_GATES = { fidelity: 90, payoff: 80 } as const;
/** A new cover must beat an eligible incumbent by this much, so noise never swaps it. */
const HOOK_MIN_GAIN = 2;

const stringField = { type: "string" } as const;
const scoreField = { type: "integer", minimum: 1, maximum: 100 } as const;

export const HOOK_CANDIDATES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "subheadline", "secondHeadline", "secondSubheadline", "mechanism", "segment", "factIds", "payoffUnitOrder"],
        properties: {
          headline: stringField,
          subheadline: stringField,
          secondHeadline: stringField,
          secondSubheadline: stringField,
          mechanism: { type: "string", enum: [...HOOK_MECHANISMS] },
          segment: stringField,
          factIds: { type: "array", items: stringField },
          payoffUnitOrder: { type: "integer" },
        },
      },
    },
  },
} as const;

export const HOOK_SCORES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ranking", "scores"],
  properties: {
    ranking: { type: "array", items: { type: "integer" } },
    scores: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["option", "recognition", "clarity", "pull", "fidelity", "payoff", "naturalness", "slide2", "slide2Fidelity", "reason"],
        properties: {
          option: { type: "integer" },
          recognition: scoreField,
          clarity: scoreField,
          pull: scoreField,
          fidelity: scoreField,
          payoff: scoreField,
          naturalness: scoreField,
          slide2: scoreField,
          slide2Fidelity: scoreField,
          reason: stringField,
        },
      },
    },
  },
} as const;

type HookFact = { id: string; statement: string; attribution?: string; mustKeep: string[]; certainty?: string };

function hookFacts(facts: readonly CreativeKeyFact[]): HookFact[] {
  return facts.map((fact) => ({
    id: fact.id,
    statement: fact.statement,
    ...(fact.attribution ? { attribution: fact.attribution } : {}),
    mustKeep: [...new Set([...(fact.requiredQualifiers ?? []), ...(fact.claimGuard?.requiredPhrases ?? [])])],
    ...(fact.claimGuard?.certainty ? { certainty: fact.claimGuard.certainty } : {}),
  }));
}

function slidesForPrompt(draft: GeneratedCreativeDraft) {
  return draft.units.map((unit) => ({
    order: unit.order,
    role: unit.role,
    headline: unit.headline,
    ...(unit.subheadline ? { subheadline: unit.subheadline } : {}),
    ...(unit.body ? { body: unit.body } : {}),
    factIds: unit.factIds,
  }));
}

/**
 * The facts a cover may cite: any fact the slides already carry, since the
 * strongest hook is often a record or figure the plan placed inside the
 * deck. The deterministic gates still reject a cover that overuses a fact or
 * breaks the arc.
 */
export function coverAllowedFactIds(brief: Pick<GeneratedCreativeBrief, "carouselPlan" | "keyFacts">, draft: GeneratedCreativeDraft): string[] {
  const known = new Set(brief.keyFacts.map((fact) => fact.id));
  const used = new Set([...(brief.carouselPlan?.slides.flatMap((slide) => slide.allowedFactIds) ?? []), ...draft.units.flatMap((unit) => unit.factIds)]);
  const ids = [...used].filter((id) => known.has(id));
  return ids.length ? ids : [...known];
}

/**
 * A list carousel ("8 things to do this weekend") sells the whole list: every
 * cover must promise the count, what the items are and their scope, and only
 * the voice may vary. A cover about one item would hide the other seven and
 * repeat that item's own slide.
 */
export function listCoverRules(itemCount: number): string {
  return `This carousel is an enumerated list of ${itemCount} items, one per slide after the cover. Every cover must promise the whole list: its count (${itemCount}), what the items are and their scope — the place and the dates when a fact states them — so the reader knows the carousel offers ${itemCount} choices. Vary the voice between covers (playful, practical, local, surprising), and you may borrow the source's own framing when a fact supports it, but never make one item the cover's subject, never promise more or fewer items than the slides deliver, and keep the date range or scope in the context line when the headline has no room for it. payoffUnitOrder is 2, the first item. Leave the slide 2 headline empty unless it names slide 2's item more vividly.`;
}

/** The count a list cover must carry, as digits or as a number word in a supported language. */
export function coverPromisesList(cover: { headline: string; subheadline?: string }, itemCount: number): boolean {
  const text = ` ${`${cover.headline} ${cover.subheadline ?? ""}`.toLocaleLowerCase().normalize("NFKD").replace(/\p{M}+/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  const words = NUMBER_WORDS[itemCount] ?? [];
  return text.includes(` ${itemCount} `) || words.some((word) => text.includes(` ${word} `));
}

const NUMBER_WORDS: Record<number, string[]> = {
  2: ["two", "deux", "dos", "dois"], 3: ["three", "trois", "tres", "tres"], 4: ["four", "quatre", "cuatro", "quatro"],
  5: ["five", "cinq", "cinco"], 6: ["six", "seis"], 7: ["seven", "sept", "siete", "sete"], 8: ["eight", "huit", "ocho", "oito"],
  9: ["nine", "neuf", "nueve", "nove"], 10: ["ten", "dix", "diez", "dez"], 11: ["eleven", "onze", "once"], 12: ["twelve", "douze", "doce"],
  13: ["thirteen", "treize", "trece", "treze"], 14: ["fourteen", "quatorze", "catorce", "catorze"], 15: ["fifteen", "quinze", "quince"],
  16: ["sixteen", "seize", "dieciseis", "dezesseis"], 17: ["seventeen", "dix sept", "diecisiete", "dezessete"],
  18: ["eighteen", "dix huit", "dieciocho", "dezoito"],
};

export function buildHookGeneratorInstructions(list?: { itemCount: number }): string {
  return [
    "You are the cover editor of a local media brand. The interior slides of this carousel are final and good; your job is the opening: the cover — the headline and one short context line — that makes this audience stop scrolling, see themselves in the story and swipe, and the headline of slide 2, the first thing they see after the swipe.",
    `Write ${HOOK_TOURNAMENT_CANDIDATES} genuinely different covers in the publication language. Spread them across the mechanisms in mechanismGuide and across the reader segments named in the audience; use a mechanism only where the facts support it.`,
    "Every cover must be true to the facts listed for the cover: keep each fact's mustKeep wording or its exact meaning and its attribution, never raise its certainty (reported, estimated, projected or attributed claims stay so), and never invent consequences, causes, numbers, comparisons, places, people, quotes, feelings or reader behaviour. A question may invite the reader in, but must not rest on a premise the facts do not establish.",
    "Aggressive hook, conservative facts: intensify the presentation, never the facts. Be bold in form: lead with the most striking supported element in the whole deck — a record, a big figure, a surprising contrast, a familiar place, a moment the reader lived — rather than a neutral summary.",
    "A cover may open a loop about what a later slide reveals, as a question or a tease, without stating it (for example: a crowd figure followed by 'and the economic impact?'). Patterns to adapt to the language, never to copy: 'X? It happened here.', 'You were there? So were N others.', 'N people. Now the bill.'",
    "Keep attribution and hedges, in their shortest faithful form ('selon Tourisme Montérégie', 'il s'agirait'): the context line names the source once, never a chain of sources, and does not repeat figures the headline already gives.",
    "Each cover promises something the slides already deliver; set payoffUnitOrder to the slide that pays it off.",
    "Write as a native speaker of the publication language from its region: read each headline aloud, and rewrite any that sounds translated, administrative or like a press release. Each headline must work on its own, without the context line.",
    "Headline: 6 to 10 words, never more than 12, natural spoken language of a local journalist. Context line: optional, at most 24 words, the place for attribution or scope. No clickbait formulas, no emojis, no all-caps words, no exclamation marks.",
    "Prefer concrete local anchors the facts name — places, moments, numbers — over generic wording. Do not repeat the current cover; you may improve on it.",
    "At least three covers should be ones a bold, ambitious editor would fight for, while staying exactly true to the facts.",
    `For every cover, write the headline of slide 2, the first thing the reader sees after the swipe (secondHeadline, at most ${SECOND_HEADLINE_MAX_WORDS} words), and only if it adds something a slide 2 subheadline (secondSubheadline, at most ${SECOND_SUBHEADLINE_MAX_WORDS} words, otherwise empty); together they fit slide2WordBudget words, and shorter is better. Slide 2 must pay off the cover's promise at once and make the reader want the next slide; it moves the story forward, never restating the cover's claim, figure or place. It keeps its supporting text and its factIds, so its headline must be supported by those facts and agree with that text, and must state nothing more certainly than they do: a projected, estimated, reported or attributed figure keeps its hedge in the headline itself. Leave both empty to keep slide 2 as it is.`,
    "Return the covers as candidates, each with its slide 2 headline, the mechanism used, the reader segment it speaks to, the factIds the cover relies on (only from coverFacts) and payoffUnitOrder.",
    ...(list ? [listCoverRules(list.itemCount)] : []),
  ].join("\n");
}

export function buildHookGeneratorContents(input: {
  publication: string;
  language: string;
  region: string;
  audience: string;
  brief: Pick<GeneratedCreativeBrief, "keyFacts" | "angle" | "keyMessage" | "editorialAngle" | "appliedFramingStrategy">;
  draft: GeneratedCreativeDraft;
  allowedFactIds: readonly string[];
  /** Words slide 2's headline and subheadline may use so the slide stays light. */
  secondSlideWordBudget?: number;
}): string {
  const allowed = new Set(input.allowedFactIds);
  return JSON.stringify({
    publication: input.publication,
    language: input.language,
    region: input.region,
    audience: input.audience,
    angle: input.brief.angle,
    keyMessage: input.brief.keyMessage,
    ...(input.brief.editorialAngle ? { audienceStake: input.brief.editorialAngle.audienceStake, hookPromise: input.brief.editorialAngle.hookPromise } : {}),
    mechanismGuide: HOOK_MECHANISM_GUIDE,
    coverFacts: hookFacts(input.brief.keyFacts.filter((fact) => allowed.has(fact.id))),
    otherFacts: hookFacts(input.brief.keyFacts.filter((fact) => !allowed.has(fact.id))).map(({ id, statement }) => ({ id, statement })),
    currentCover: { headline: input.draft.units[0]?.headline ?? "", subheadline: input.draft.units[0]?.subheadline ?? "" },
    ...(input.secondSlideWordBudget ? { slide2WordBudget: input.secondSlideWordBudget } : {}),
    slides: slidesForPrompt(input.draft),
  });
}

export function buildHookRefineInstructions(list?: { itemCount: number }): string {
  return [
    "You are the final cover editor. These are the best openings so far for this carousel: a cover and the slide 2 headline that follows it. Make each one as strong as it can be: write one sharpened version of every opening — tighter rhythm, the most concrete words, a stronger verb, the hook in the first three words, nothing a reader has to decode — with a slide 2 headline that pays the cover off at once.",
    "Keep each cover's idea, mechanism and factIds; you may also cite the writer's cover facts. Stay exactly true to the facts: keep hedges and attribution in their shortest faithful form, never raise certainty, never add a number, place, person, cause or consequence the facts do not state.",
    `Headline: at most 12 words and ideally 6 to 9; it must work on its own. Context line: optional, at most 24 words, naming the source once. Slide 2 headline: at most ${SECOND_HEADLINE_MAX_WORDS} words, supported by slide 2's own facts and supporting text; its subheadline at most ${SECOND_SUBHEADLINE_MAX_WORDS} words or empty; together within slide2WordBudget words.`,
    "Write as a native speaker of the publication language from its region; no clickbait formulas, emojis, all-caps words or exclamation marks.",
    "Return the sharpened versions as candidates.",
    ...(list ? [listCoverRules(list.itemCount)] : []),
  ].join("\n");
}

export function buildHookRefineContents(input: {
  publication: string;
  language: string;
  region: string;
  audience: string;
  facts: readonly CreativeKeyFact[];
  draft: GeneratedCreativeDraft;
  covers: readonly HookCandidate[];
  secondSlideWordBudget?: number;
}): string {
  return JSON.stringify({
    publication: input.publication,
    language: input.language,
    region: input.region,
    audience: input.audience,
    facts: hookFacts(input.facts),
    ...(input.secondSlideWordBudget ? { slide2WordBudget: input.secondSlideWordBudget } : {}),
    slides: slidesForPrompt(input.draft),
    covers: input.covers.map(({ headline, subheadline, secondHeadline, secondSubheadline, mechanism, segment, factIds, payoffUnitOrder }) => ({
      headline, subheadline, secondHeadline: secondHeadline ?? "", secondSubheadline: secondSubheadline ?? "", mechanism, segment, factIds, payoffUnitOrder,
    })),
  });
}

export function buildHookJudgeInstructions(list?: { itemCount: number }): string {
  return [
    "You judge cover options for a local media brand twice over: as an exacting editor and as a member of its audience scrolling a feed. Each option is a cover — a headline and a context line — and the slide 2 headline written to follow it; slide 2's supporting text is in slides. Score every option from 1 to 100 on each dimension, independently, in the order given. The first six dimensions judge the cover alone.",
    "recognition: would a reader in the audience see themselves — their place, routine or community — in this cover within one second?",
    "clarity: understood at a glance; the subject is obvious without the slides.",
    "pull: would you stop scrolling? A specific, grounded reason to swipe now; curiosity the slides satisfy, not bait. A cover that only restates numbers without a reason to care scores below 75.",
    "fidelity: every claim on the cover is supported by the facts with their qualifiers and attribution. 100 only when nothing is strengthened or implied beyond them; below 70 when it states as fact what the facts only report, estimate, project or attribute, or rests on a premise the facts do not support.",
    "payoff: the named slide actually delivers what the cover promises.",
    "naturalness: idiomatic, sounds like a person from here, no clickbait, no ad copy.",
    "slide2: read with slide 2's supporting text, does this option's slide 2 headline pay the cover off at once and make the reader want slide 3? It must tell the reader something the cover did not: a slide 2 that restates the cover's claim, figure or place scores below 70. Short and concrete beats complete.",
    "slide2Fidelity: the slide 2 headline, read with its supporting text, is true to the facts; below 90 when the headline states as certain what the facts only project, estimate, report or attribute.",
    "Be strict and comparative: 95 or more means a top editor would publish it unchanged; the options compete, so do not give them all the same score. Give a reason of at most 12 words.",
    "houseTaste, when present, lists past decisions of this publication's editor: the cover they kept over strong alternatives. Learn what they value and let it guide your scores and ranking; never let it override fidelity.",
    "Then rank every option by its cover alone, from the one you would publish to the one you would cut: ranking lists each option number exactly once, best first. Rank by what would make this audience stop and swipe while staying true to the facts; slide 2 does not change the ranking. An option whose cover fails fidelity ranks last.",
    ...(list ? [`This carousel is a list of ${list.itemCount} items. A cover that does not promise the whole list — its count and what the items are — scores below 60 on clarity and payoff and ranks below every cover that does, however appealing its single item.`] : []),
  ].join("\n");
}

export function buildHookJudgeContents(input: {
  publication: string;
  language: string;
  audience: string;
  facts: readonly CreativeKeyFact[];
  draft: GeneratedCreativeDraft;
  options: readonly HookCandidate[];
  houseTaste?: readonly HookTasteExample[];
}): string {
  return JSON.stringify({
    publication: input.publication,
    language: input.language,
    audience: input.audience,
    ...(input.houseTaste?.length ? { houseTaste: input.houseTaste } : {}),
    facts: hookFacts(input.facts),
    // Each option brings its own slide 2 headline; slide 2 keeps its text and facts.
    slides: slidesForPrompt(input.draft).slice(1).map(({ headline, subheadline, ...slide }, index) => (index === 0 ? slide : { ...slide, headline, ...(subheadline ? { subheadline } : {}) })),
    // Blind: no mechanism, no hint which option the writer produced.
    options: input.options.map((option, index) => ({
      option: index + 1,
      headline: option.headline,
      subheadline: option.subheadline,
      slide2Headline: option.secondHeadline || input.draft.units[1]?.headline || "",
      slide2Subheadline: (option.secondHeadline ? option.secondSubheadline : input.draft.units[1]?.subheadline) ?? "",
      factIds: option.factIds,
      payoffUnitOrder: option.payoffUnitOrder,
    })),
  });
}

const words = (value: string) => (value.trim() ? value.trim().split(/\s+/u).length : 0);

/**
 * French puts a space before ? ! ; and a colon; models often drop it. Times
 * and ratios (16:30) and runs such as "?!" are left alone.
 */
export function normalizeCoverPunctuation(text: string, language: string): string {
  if (!/^(fr|french|fran[cç]ais)/iu.test(language.trim())) return text;
  return text
    .replace(/([^\s?!;:(«])([?!;])/gu, "$1 $2")
    // A label colon is followed by a space or the end; a time (16:30) is not.
    .replace(/([^\s:(«])\s*:(?=\s|$)/gu, "$1 :");
}

/** Two cover texts are the same when they differ only in spacing around punctuation. */
export function sameCoverText(left: string, right: string): boolean {
  const key = (value: string) => value.replace(/\s+(?=[?!;:])/gu, "").replace(/\s+/gu, " ").trim();
  return key(left) === key(right);
}
const normalized = (value: string) => value.normalize("NFKD").replace(/[̀-ͯ]/gu, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Only well-formed, distinct covers that cite the cover's facts survive. */
export function parseHookCandidates(text: string, input: { allowedFactIds: readonly string[]; slideCount: number; incumbentHeadline: string; language?: string }): HookCandidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CreativeHookTournamentResponseError("The hook candidates were not valid JSON");
  }
  const entries = (parsed as { candidates?: unknown })?.candidates;
  if (!Array.isArray(entries)) throw new CreativeHookTournamentResponseError("The hook response has no candidates");
  const allowed = new Set(input.allowedFactIds);
  const seen = new Set([normalized(input.incumbentHeadline)]);
  const candidates: HookCandidate[] = [];
  for (const entry of entries) {
    const value = entry as Partial<Record<keyof HookCandidate, unknown>>;
    const tidy = (field: unknown) => (typeof field === "string" ? normalizeCoverPunctuation(field.trim(), input.language ?? "") : "");
    const headline = tidy(value.headline);
    const subheadline = tidy(value.subheadline);
    // An overlong slide 2 suggestion is dropped; the cover itself still competes.
    let secondHeadline = tidy(value.secondHeadline);
    let secondSubheadline = tidy(value.secondSubheadline);
    if (!secondHeadline || words(secondHeadline) > SECOND_HEADLINE_MAX_WORDS || words(secondSubheadline) > SECOND_SUBHEADLINE_MAX_WORDS) {
      secondHeadline = "";
      secondSubheadline = "";
    }
    const mechanism = HOOK_MECHANISMS.find((item) => item === value.mechanism);
    const factIds = Array.isArray(value.factIds) ? [...new Set(value.factIds.filter((id): id is string => typeof id === "string" && allowed.has(id)))] : [];
    const payoff = typeof value.payoffUnitOrder === "number" && Number.isInteger(value.payoffUnitOrder) ? value.payoffUnitOrder : 0;
    if (!headline || !mechanism || !factIds.length) continue;
    if (words(headline) > HOOK_HEADLINE_MAX_WORDS || words(subheadline) > HOOK_SUBHEADLINE_MAX_WORDS) continue;
    if (payoff < 2 || payoff > input.slideCount) continue;
    const key = normalized(headline);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ headline, subheadline, secondHeadline, secondSubheadline, mechanism, segment: typeof value.segment === "string" ? value.segment.trim().slice(0, 120) : "", factIds, payoffUnitOrder: payoff });
    if (candidates.length === HOOK_MAX_CANDIDATES) break;
  }
  if (!candidates.length) throw new CreativeHookTournamentResponseError("No usable hook candidate was returned");
  return candidates;
}

/** One score per option, in option order; a missing or malformed score fails the judging call. */
export function parseHookScores(text: string, optionCount: number): HookScore[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CreativeHookTournamentResponseError("The hook scores were not valid JSON");
  }
  const entries = (parsed as { scores?: unknown })?.scores;
  if (!Array.isArray(entries)) throw new CreativeHookTournamentResponseError("The hook judge returned no scores");
  const byOption = new Map<number, HookScore>();
  const clamp = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(1, Math.round(value))) : undefined);
  for (const entry of entries) {
    const value = entry as Record<string, unknown>;
    const option = typeof value.option === "number" ? value.option : 0;
    const dimensions = (["recognition", "clarity", "pull", "fidelity", "payoff", "naturalness"] as const).map((key) => clamp(value[key]));
    if (option < 1 || option > optionCount || dimensions.some((score) => score === undefined)) continue;
    const [recognition, clarity, pull, fidelity, payoff, naturalness] = dimensions as number[];
    const slide2 = clamp(value.slide2);
    const slide2Fidelity = clamp(value.slide2Fidelity);
    byOption.set(option, {
      recognition, clarity, pull, fidelity, payoff, naturalness,
      ...(slide2 !== undefined && slide2Fidelity !== undefined ? { slide2, slide2Fidelity } : {}),
      reason: typeof value.reason === "string" ? value.reason.trim().slice(0, 240) : "",
    });
  }
  if (byOption.size !== optionCount) throw new CreativeHookTournamentResponseError("The hook judge did not score every option");
  return Array.from({ length: optionCount }, (_, index) => byOption.get(index + 1)!);
}

/** The judge's order of preference as option numbers; undefined when it is not a full permutation. */
export function parseHookRanking(text: string, optionCount: number): number[] | undefined {
  try {
    const ranking = (JSON.parse(text) as { ranking?: unknown }).ranking;
    if (!Array.isArray(ranking) || ranking.length !== optionCount) return undefined;
    const options = ranking.filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= optionCount);
    return new Set(options).size === optionCount ? options : undefined;
  } catch {
    return undefined;
  }
}

export function hookTotal(score: HookScore): number {
  return Math.round((Object.keys(HOOK_WEIGHTS) as (keyof typeof HOOK_WEIGHTS)[])
    .reduce((sum, key) => sum + score[key] * HOOK_WEIGHTS[key], 0) * 10) / 10;
}

/** Fidelity, clarity and payoff are gates: a cover below them never wins. */
export function hookPassesGates(score: HookScore): boolean {
  return score.fidelity >= HOOK_GATES.fidelity && score.clarity >= HOOK_GATES.clarity && score.payoff >= HOOK_GATES.payoff;
}

/** A judged slide 2 headline is used only when it is faithful and pays the cover off; otherwise slide 2 stays as it is. */
export function secondPassesGates(score: HookScore): boolean {
  return (score.slide2Fidelity ?? 0) >= SECOND_GATES.fidelity && (score.slide2 ?? 0) >= SECOND_GATES.payoff;
}

/**
 * The winner among scored, unrejected covers that pass the gates. Index 0 is
 * the incumbent. With the judge's ranking (candidate indexes, best first) the
 * best-ranked eligible cover wins; without one, the weighted total decides and
 * an eligible incumbent is replaced only by a clearly better cover.
 */
export function selectHook(
  candidates: readonly (HookCandidate & { score?: HookScore; rejected?: string })[],
  ranking?: readonly number[],
): { selectedIndex: number; replaced: boolean } {
  const isEligible = (index: number) => {
    const candidate = candidates[index];
    return Boolean(candidate && !candidate.rejected && candidate.score && hookPassesGates(candidate.score));
  };
  if (ranking?.length) {
    const best = ranking.find(isEligible);
    return best === undefined || best === 0 ? { selectedIndex: 0, replaced: false } : { selectedIndex: best, replaced: true };
  }
  const eligible = candidates.map((candidate, index) => ({ candidate, index })).filter(({ index }) => isEligible(index));
  if (!eligible.length) return { selectedIndex: 0, replaced: false };
  const best = eligible.reduce((top, entry) => {
    const difference = hookTotal(entry.candidate.score!) - hookTotal(top.candidate.score!);
    if (difference > 0) return entry;
    if (difference === 0 && words(entry.candidate.headline) < words(top.candidate.headline)) return entry;
    return top;
  });
  if (best.index === 0) return { selectedIndex: 0, replaced: false };
  const incumbent = eligible.find((entry) => entry.index === 0);
  if (incumbent && hookTotal(best.candidate.score!) < hookTotal(incumbent.candidate.score!) + HOOK_MIN_GAIN) {
    return { selectedIndex: 0, replaced: false };
  }
  return { selectedIndex: best.index, replaced: true };
}

/** The cover and, when the candidate has one, slide 2's headline rewritten; every other field and slide is unchanged. */
export function applyHookToDraft(draft: GeneratedCreativeDraft, candidate: HookCandidate): GeneratedCreativeDraft {
  return {
    ...draft,
    units: draft.units.map((unit, index) => index === 0
      ? { ...unit, headline: candidate.headline, subheadline: candidate.subheadline || undefined, factIds: candidate.factIds }
      : index === 1 && candidate.secondHeadline
      ? { ...unit, headline: candidate.secondHeadline, subheadline: candidate.secondSubheadline || undefined }
      : unit),
  };
}

const issueKey = (issue: CreativeQualityIssue) => `${issue.code}:${issue.unitOrder ?? 0}`;

/**
 * The deterministic rules applied to an opening. A cover that adds a blocker
 * the draft does not have is refused. Slide 2's headline is a suggestion: when
 * it adds any issue, blocker or warning, beyond the cover's own, it is dropped
 * and slide 2 stays as it is.
 */
export function checkHookOpening<T extends HookCandidate>(
  draft: GeneratedCreativeDraft,
  candidate: T,
  issues: (value: GeneratedCreativeDraft) => readonly CreativeQualityIssue[],
): { candidate: T; blockers: string[]; secondDropped?: string[] } {
  const before = new Set(issues(draft).filter((issue) => issue.severity === "blocker").map(issueKey));
  const coverOnly: T = { ...candidate, secondHeadline: "", secondSubheadline: "" };
  const coverIssues = issues(applyHookToDraft(draft, coverOnly));
  const blockers = [...new Set(coverIssues.filter((issue) => issue.severity === "blocker").map(issueKey))].filter((key) => !before.has(key));
  if (blockers.length || !candidate.secondHeadline) return { candidate, blockers };
  const known = new Set(coverIssues.map(issueKey));
  const added = [...new Set(issues(applyHookToDraft(draft, candidate)).map(issueKey))].filter((key) => !known.has(key));
  return added.length ? { candidate: coverOnly, blockers, secondDropped: added } : { candidate, blockers };
}

/**
 * The facts a new cover cites, then the rules. A cover cites its own facts;
 * the writer's cover facts are added only when it needs them — a place name
 * or figure it inherits — and only as far as the cover's fact budget allows.
 * Returns the first fact set that adds no blocker, or the one with fewest.
 */
export function admitHookCandidate<T extends HookCandidate>(
  draft: GeneratedCreativeDraft,
  candidate: T,
  issues: (value: GeneratedCreativeDraft) => readonly CreativeQualityIssue[],
): ReturnType<typeof checkHookOpening<T>> {
  const own = candidate.factIds;
  const inherited = (draft.units[0]?.factIds ?? []).filter((id) => !own.includes(id));
  const factSets = [own, ...inherited.map((id) => [...own, id]), ...(inherited.length > 1 ? [[...own, ...inherited]] : [])];
  let best: ReturnType<typeof checkHookOpening<T>> | undefined;
  for (const factIds of factSets) {
    const attempt = checkHookOpening(draft, { ...candidate, factIds }, issues);
    if (!attempt.blockers.length) return attempt;
    if (!best || attempt.blockers.length < best.blockers.length) best = attempt;
  }
  return best!;
}

type OpeningUnit = { headline: string; subheadline?: string };

/**
 * Slide 2 belongs to the tournament only while it still shows a slide 2 the
 * tournament wrote or saw. A slide 2 an editor changed, or a later pass fixed
 * for facts, is never overwritten by a cover choice.
 */
export function tournamentOwnsSecondSlide(tournament: CreativeHookTournament, units: readonly OpeningUnit[]): boolean {
  const second = units[1];
  return Boolean(second) && tournament.candidates.some((candidate) => candidate.secondHeadline &&
    sameCoverText(candidate.secondHeadline, second.headline) && sameCoverText(candidate.secondSubheadline ?? "", second.subheadline ?? ""));
}

/** The candidate as choosing it would apply now: without its slide 2 headline once slide 2 is no longer the tournament's. */
export function hookOpeningForDraft<T extends HookCandidate>(tournament: CreativeHookTournament, units: readonly OpeningUnit[], candidate: T): T {
  return candidate.secondHeadline && !tournamentOwnsSecondSlide(tournament, units) ? { ...candidate, secondHeadline: "", secondSubheadline: "" } : candidate;
}

/** Whether the draft already shows this opening: its cover and, when it has one, its slide 2. */
export function openingOnDraft(units: readonly OpeningUnit[], candidate: HookCandidate): boolean {
  const [cover, second] = units;
  if (!cover || !sameCoverText(cover.headline, candidate.headline) || !sameCoverText(cover.subheadline ?? "", candidate.subheadline)) return false;
  return !candidate.secondHeadline || Boolean(second && sameCoverText(second.headline, candidate.secondHeadline) &&
    sameCoverText(second.subheadline ?? "", candidate.secondSubheadline ?? ""));
}

/**
 * Later editorial passes keep the tournament's opening — its cover and slide 2
 * headline — when they only changed it for style: an audit or repair
 * rewriting them would otherwise silently undo the selection. A change that
 * answers a factual finding on that slide, or that clears deterministic
 * blockers the tournament's opening has, is kept: rules and facts outrank
 * taste.
 */
export function keepTournamentCover(
  next: GeneratedCreativeDraft,
  tournament: CreativeHookTournament | undefined,
  findings: readonly CreativeQualityIssue[],
  isFactual: (issue: CreativeQualityIssue) => boolean,
  openingBlockers: (draft: GeneratedCreativeDraft) => number = () => 0,
): GeneratedCreativeDraft {
  const chosen = tournament?.candidates[tournament.selectedIndex];
  const [cover, second] = next.units;
  if (!tournament?.replaced || !chosen || !cover) return next;
  // Only a factual finding on the slide itself may change what the tournament
  // chose for it; deck-level findings (fact reuse, arc, caption) are about
  // other copy.
  const factualOn = (order: number) => findings.some((issue) => issue.unitOrder === order && isFactual(issue));
  const keepCover = factualOn(cover.order) ||
    (sameCoverText(cover.headline, chosen.headline) && sameCoverText(cover.subheadline ?? "", chosen.subheadline));
  const keepSecond = !chosen.secondHeadline || !second || factualOn(second.order) ||
    (sameCoverText(second.headline, chosen.secondHeadline) && sameCoverText(second.subheadline ?? "", chosen.secondSubheadline ?? ""));
  if (keepCover && keepSecond) return next;
  const restored = applyHookToDraft(next, {
    ...chosen,
    ...(keepCover ? { headline: cover.headline, subheadline: cover.subheadline ?? "", factIds: cover.factIds } : {}),
    ...(keepSecond ? { secondHeadline: "", secondSubheadline: "" } : {}),
  });
  return openingBlockers(restored) > openingBlockers(next) ? next : restored;
}
