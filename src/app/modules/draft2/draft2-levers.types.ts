import { Draft2InputError, Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";

/**
 * Hook levers: the mechanism a cover uses to stop the reader, and the promise
 * the rest of the carousel keeps. A guide, never a formula: the models get
 * what each lever does, the facts it needs and what pays it, never a template
 * sentence, and "free" (no lever, the story's own tension) is always
 * possible. The catalog is generic, for any language and any kind of story;
 * the ids are stable because performance is measured by them. Brief:
 * docs/features/draft2-levers.md.
 */

export const DRAFT2_LEVER_GROUPS = [
  { id: "curiosity", label: "Curiosity" },
  { id: "clash", label: "Clash" },
  { id: "numbers", label: "Numbers" },
  { id: "emotion", label: "Emotion" },
  { id: "urgency", label: "Urgency" },
  { id: "story", label: "Story" },
  { id: "use", label: "Authority and use" },
] as const;
export type Draft2LeverGroup = (typeof DRAFT2_LEVER_GROUPS)[number]["id"];

export type Draft2Lever = {
  id: string;
  /** The editor's numbering, 1 to 35. */
  number: number;
  group: Draft2LeverGroup;
  name: string;
  /** What the cover promises, in a line. */
  mechanism: string;
  /** The facts it needs. */
  needs: string;
  /** What keeps the promise. */
  pays: string;
  /** A limit the lever never crosses. */
  never?: string;
  /** What the program checks on the facts a cover cites: a figure (a number, or a date, is written with one). */
  check?: "figure";
  /** Needs a list or steps structure. */
  list?: true;
  /** Allowed when the story's gravity is grave. */
  grave?: true;
  /** Off by default: it implies concealment, an admission, an opinion, a first-person experience or outrage. */
  off?: true;
};

export const DRAFT2_LEVERS: readonly Draft2Lever[] = [
  { id: "secret", number: 1, group: "curiosity", name: "Secret", mechanism: "A little-known detail the reader would want to know", needs: "A detail the facts state that most readers would not know: a condition, an exception, a cost", pays: "Slide 2 states it", never: "Never implies that someone hides it" },
  { id: "suspense", number: 2, group: "curiosity", name: "Suspense", mechanism: "An outcome held back for one swipe", needs: "A surprising outcome the facts state", pays: "Slide 2 reveals it", never: "Never held back past slide 2" },
  { id: "hidden-reason", number: 3, group: "curiosity", name: "Hidden reason", mechanism: "A known fact has a reason behind it, and not the obvious one", needs: "A cause the facts state", pays: "The beat that gives the reason", never: "Never an inferred or invented cause" },
  { id: "provocative-question", number: 4, group: "curiosity", name: "Provocative question", mechanism: "A question that challenges what the reader assumes", needs: "A fact that contradicts a common assumption", pays: "Slide 2 answers it", never: "A narrow question the carousel answers, never \"everything you know is wrong\"" },
  { id: "forbidden", number: 5, group: "curiosity", name: "Forbidden fact", mechanism: "Information someone kept from the public", needs: "Documented concealment: the facts say someone kept it hidden", pays: "Slide 2: what was hidden, and who says so", off: true },
  { id: "stop", number: 6, group: "clash", name: "Stop right there", mechanism: "A common habit causes a harm", needs: "A harm the facts attribute to a common action (a warning, a study)", pays: "Slide 2: the evidence and what to do instead", never: "Never an invented consequence" },
  { id: "counterintuitive", number: 7, group: "clash", name: "Counterintuitive", mechanism: "A finding that runs against what the reader expects", needs: "A finding the facts state that contradicts expectation", pays: "Slide 2: the finding and its source" },
  { id: "confession", number: 8, group: "clash", name: "Uncomfortable confession", mechanism: "Someone admits an uncomfortable truth", needs: "An admission the facts attribute to whoever made it", pays: "Slide 2: the admission, attributed", never: "The publication never confesses", off: true },
  { id: "myth", number: 9, group: "clash", name: "Busted myth", mechanism: "A popular belief, refuted", needs: "A belief named in the sources and the fact that refutes it", pays: "Slide 2: the proof" },
  { id: "unpopular", number: 10, group: "clash", name: "Unpopular opinion", mechanism: "A position against the common view", needs: "A position the facts attribute to its author", pays: "Slide 2: the position and who holds it", never: "Never the publication's own opinion", off: true },
  { id: "stat", number: 11, group: "numbers", name: "Surprising statistic", mechanism: "A number that surprises", needs: "A number the facts state", pays: "Slide 2 explains it", never: "The number exactly as stated, never a share of people the facts do not measure", check: "figure", grave: true },
  { id: "experiment", number: 12, group: "numbers", name: "Personal experiment", mechanism: "Someone tried something for a while, and it came out like this", needs: "A first-person account in the sources, told in the third person with its author", pays: "The result", never: "Never in the first person: the publication did not do it", off: true },
  { id: "signs", number: 13, group: "numbers", name: "Signs", mechanism: "The signs that a situation applies to the reader", needs: "Two or more indicators the facts give (criteria, symptoms, conditions)", pays: "The signs, one by one", list: true, grave: true },
  { id: "quick-list", number: 14, group: "numbers", name: "Quick list", mechanism: "A number of ways to a result", needs: "A list or steps structure; \"without\" an obstacle only when the facts state it (free, no sign-up)", pays: "The items", list: true },
  { id: "comparison", number: 15, group: "numbers", name: "Comparison", mechanism: "Two options side by side", needs: "Two options the facts measure the same way", pays: "The comparison, side by side", never: "A winner only when the facts compare them", grave: true },
  { id: "pride", number: 16, group: "emotion", name: "Local pride", mechanism: "Something the place or the group can be proud of", needs: "An achievement of the place or the group", pays: "Slide 2: the achievement" },
  { id: "outrage", number: 17, group: "emotion", name: "Outrage", mechanism: "A decision or an event that upsets a community", needs: "A documented reaction: complaints, a petition, a protest", pays: "Slide 2: the reaction, attributed", never: "Never a manufactured reaction", off: true },
  { id: "nostalgia", number: 18, group: "emotion", name: "Nostalgia", mechanism: "Then and now", needs: "A documented past state and the present one", pays: "The present" },
  { id: "inspiration", number: 19, group: "emotion", name: "Inspiration", mechanism: "From a hard situation to an achievement", needs: "A real protagonist's documented difficulty and achievement", pays: "The turn", never: "Never dramatized beyond the facts" },
  { id: "empathy", number: 20, group: "emotion", name: "Empathy", mechanism: "For readers who have lived a situation", needs: "A common situation of the audience that the story speaks to", pays: "Slide 2: the concrete fact" },
  { id: "right-now", number: 21, group: "urgency", name: "Right now", mechanism: "It is happening now", needs: "An event or a measure in effect today", pays: "Slide 2: what, where, until when", never: "Only when it is in effect today", check: "figure", grave: true },
  { id: "heads-up", number: 22, group: "urgency", name: "Heads-up", mechanism: "Before you go or act, know this", needs: "A practical condition with its date: a closure, a detour, a schedule", pays: "Slide 2: the condition, and the alternative when the facts give one", check: "figure", grave: true },
  { id: "limited-time", number: 23, group: "urgency", name: "Limited time", mechanism: "Only for a limited window", needs: "A limited window, with its dates", pays: "The dates and how to go", check: "figure" },
  { id: "deadline-agency", number: 24, group: "urgency", name: "Your call, until a date", mechanism: "You decide something, until a date", needs: "A decision open to the reader (a vote, a consultation, an application) and its deadline", pays: "Slide 2: what you decide, how, until when", check: "figure" },
  { id: "last-chance", number: 25, group: "urgency", name: "Last chance", mechanism: "The last chance before a deadline", needs: "A final deadline a few days away, with no extension stated", pays: "How to act", never: "Only a few days before the deadline", check: "figure" },
  { id: "in-action", number: 26, group: "story", name: "Start in action", mechanism: "The story starts in the middle of the event", needs: "An event with its moment: a date, a time", pays: "The twist" },
  { id: "close-protagonist", number: 27, group: "story", name: "Relatable protagonist", mechanism: "An ordinary person noticed something, and was right", needs: "A person in the facts who noticed or did something, confirmed", pays: "What they found", never: "An ordinary person, never a celebrity" },
  { id: "twist", number: 28, group: "story", name: "Unexpected twist", mechanism: "It looked like one thing, and it was another", needs: "Two facts: the appearance, and the truth with its source", pays: "The truth" },
  { id: "before-after", number: 29, group: "story", name: "Before and after", mechanism: "How it was, how it is", needs: "Two documented states", pays: "The after; the images show both" },
  { id: "dilemma", number: 30, group: "story", name: "Dilemma", mechanism: "A real choice, put to the reader", needs: "A choice someone faced, or one the reader faces", pays: "The options, and what was decided" },
  { id: "authority", number: 31, group: "use", name: "Authority", mechanism: "What an expert or an institution says that few know", needs: "A named expert or institution; agreement only when several sources agree", pays: "The fact", grave: true },
  { id: "prediction", number: 32, group: "use", name: "Prediction", mechanism: "How something will change", needs: "A plan or a projection the facts attribute to its source", pays: "The plan, with its qualifiers", never: "Never the publication's own forecast" },
  { id: "common-mistake", number: 33, group: "use", name: "Common mistake", mechanism: "The mistake many make, and how to avoid it", needs: "A documented frequent mistake and the right way", pays: "The right way", grave: true },
  { id: "direct-benefit", number: 34, group: "use", name: "Direct benefit", mechanism: "It saves you time, money or effort", needs: "A concrete saving the facts state: free entry, a rebate, a shorter route", pays: "How to get it", grave: true },
  { id: "social-proof", number: 35, group: "use", name: "Social proof", mechanism: "Many people already do it", needs: "A count of participants the facts state", pays: "Who, and how to join", never: "Never an estimated count", check: "figure" },
];

/** No lever: the story's own tension. Always possible. */
export const FREE_LEVER = "free";
/** Where the primary lever's promise is kept: a spine position after the cover (slide 2 always pays its first instalment). */
export const LEVER_PAID_BY = ["slide2", "middle", "penultimate", "last"] as const;
export const MAX_LEVER_ALTERNATIVES = 2;
const MAX_LEVER_FACTS = 6;

export type Draft2LeverPaidBy = (typeof LEVER_PAID_BY)[number];

/** The plan's levers: the one the hook leads with (or free), up to two others that could carry the story, its facts, and where the promise is kept. */
export type Draft2FocusLevers = { primary: string; alternatives: string[]; factIds: string[]; paidBy: Draft2LeverPaidBy };

/** What eligibility reads from the focus. */
type LeverStory = { voice: { gravity: string }; structure: { kind: string } };
type LeverFact = Pick<Draft2Fact, "kind" | "claim">;

export const leverById = (id: string | undefined): Draft2Lever | undefined => DRAFT2_LEVERS.find((lever) => lever.id === id);
export const leverName = (id: string | undefined): string => id === FREE_LEVER ? "Free" : leverById(id)?.name ?? id ?? "";
export const leverGroupLabel = (id: string | undefined): string => id === FREE_LEVER ? "Free" : DRAFT2_LEVER_GROUPS.find((group) => group.id === leverById(id)?.group)?.label ?? "";

/** A fact the program counts as carrying a figure: a number or a date, or a claim written with a digit. */
const carriesFigure = (fact: LeverFact) => fact.kind === "number" || fact.kind === "date" || /\d/u.test(fact.claim);
const allowsList = (story: LeverStory) => story.structure.kind === "list" || story.structure.kind === "steps";

/**
 * The levers this story can carry, in catalog order: on by default, allowed
 * at the story's gravity, a figure in the facts when the lever needs one, a
 * list or steps structure when it needs one. The judge checks the rest (the
 * date is ahead, the cause is stated, the count is not an estimate).
 */
export function eligibleLevers(facts: readonly LeverFact[], story: LeverStory): string[] {
  const figure = facts.some(carriesFigure);
  return DRAFT2_LEVERS
    .filter((lever) => !lever.off && (story.voice.gravity !== "grave" || lever.grave) && (lever.check !== "figure" || figure) && (!lever.list || allowsList(story)))
    .map((lever) => lever.id);
}

/** Whether the facts a cover cites carry the figure its lever needs. */
export const leverSupported = (id: string, cited: readonly LeverFact[]): boolean => leverById(id)?.check !== "figure" || cited.some(carriesFigure);

/**
 * Stock clickbait formulas a cover never uses, in the languages the brands
 * publish in: readers recognise them, and they read as bait. The levers
 * skill asks for each lever's mechanism in the story's own words.
 */
export const STOCK_PHRASES = [
  "nobody tells you", "no one tells you", "you won't believe", "you will not believe", "you'll never guess", "you will never guess", "nobody wants you to know", "what happened next", "will shock you",
  "personne ne vous dit", "personne ne te dit", "ce que personne ne", "vous n'allez pas croire", "tu ne vas pas croire", "vous ne devinerez jamais", "tu ne devineras jamais", "va vous choquer", "personne ne veut que vous sachiez",
  "nadie te dice", "nadie te cuenta", "no vas a creer", "no lo vas a creer", "nunca vas a adivinar", "no creeras", "nadie quiere que sepas", "lo que paso despues",
] as const;

/** Lower case, without accents, with one kind of apostrophe and single spaces. */
const folded = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[‘’`´]/gu, "'").replace(/\s+/gu, " ").toLowerCase();

/** The stock formula a text uses, if any. */
export function stockPhraseIn(text: string): string | undefined {
  const value = folded(text);
  return STOCK_PHRASES.find((phrase) => value.includes(folded(phrase)));
}

/**
 * How a first round's openings spread over the levers: a third on the
 * primary, a fifth on each alternative, the rest free, at least a quarter
 * (15 openings: 5, 3, 3 and 4 free). Guides, never quotas: a free opening
 * always competes. With no levers, or a free primary, every opening is free.
 */
export function leverSpread(levers: Draft2FocusLevers | undefined, wanted: number): { lever: string; count: number }[] {
  if (!levers || levers.primary === FREE_LEVER || wanted < 3) return [{ lever: FREE_LEVER, count: wanted }];
  const spread = [{ lever: levers.primary, count: Math.max(1, Math.round(wanted / 3)) }];
  let left = wanted - spread[0].count - Math.max(1, Math.ceil(wanted / 4));
  for (const lever of levers.alternatives) {
    const count = Math.min(Math.max(1, Math.round(wanted / 5)), left);
    if (count > 0) { spread.push({ lever, count }); left -= count; }
  }
  return [...spread, { lever: FREE_LEVER, count: wanted - spread.reduce((sum, entry) => sum + entry.count, 0) }];
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const ids = (value: unknown): string[] => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim().toLowerCase()).filter(Boolean) : [];
const id = (value: unknown): string => typeof value === "string" ? value.trim().toLowerCase() : "";

/**
 * The plan's levers, checked against the story. A primary that is neither
 * free nor one of this story's levers is a response error, asked for again
 * with the list; alternatives that are not this story's, repeat the primary
 * or come after the second are dropped, and a free primary has none; fact
 * ids that are not verified facts are dropped; a position that is not one
 * is slide 2, where every opening pays its first instalment.
 */
export function parsePlanLevers(value: unknown, { eligible, known }: { eligible: readonly string[]; known: ReadonlySet<string> }): Draft2FocusLevers {
  const body = record(value);
  const primary = id(body.primary);
  if (primary !== FREE_LEVER && !eligible.includes(primary)) {
    throw new Draft2ResponseError(`The primary lever is free or one of this story's levers (${eligible.join(", ") || "none"}); "${primary}" is not`);
  }
  const alternatives = primary === FREE_LEVER ? [] : [...new Set(ids(body.alternatives))].filter((entry) => entry !== primary && eligible.includes(entry)).slice(0, MAX_LEVER_ALTERNATIVES);
  const factIds = [...new Set(Array.isArray(body.factIds) ? body.factIds.filter((entry): entry is string => typeof entry === "string" && known.has(entry)) : [])].slice(0, MAX_LEVER_FACTS);
  const paidBy = LEVER_PAID_BY.find((position) => position === body.paidBy) ?? "slide2";
  return { primary, alternatives, factIds, paidBy };
}

/**
 * The editor's levers: a primary on by default or free, up to two other
 * alternatives, and a position. A lever that is not this story's is the
 * editor's call; the Opening's program findings show what its facts lack.
 * The facts stay Claude's while the primary does.
 */
export function editedLevers(value: unknown, current: Draft2FocusLevers | undefined): Draft2FocusLevers {
  const body = record(value);
  const known = (entry: string) => DRAFT2_LEVERS.some((lever) => lever.id === entry && !lever.off);
  const primary = id(body.primary);
  if (primary !== FREE_LEVER && !known(primary)) throw new Draft2InputError("Choose one of the levers, or free.");
  const alternatives = primary === FREE_LEVER ? [] : [...new Set(ids(body.alternatives))].filter((entry) => entry !== primary);
  if (alternatives.length > MAX_LEVER_ALTERNATIVES || !alternatives.every(known)) throw new Draft2InputError(`Choose up to ${MAX_LEVER_ALTERNATIVES} other levers.`);
  const paidBy = LEVER_PAID_BY.find((position) => position === body.paidBy);
  if (!paidBy) throw new Draft2InputError(`The promise is kept on one of ${LEVER_PAID_BY.join(", ")}.`);
  return { primary, alternatives, factIds: current?.primary === primary ? current.factIds : [], paidBy };
}

/** One lever as the models read it: its name, its promise and what keeps it. */
export function leverForModels(lever: string) {
  const entry = leverById(lever);
  return entry ? { id: entry.id, name: entry.name, promise: entry.mechanism, pays: entry.pays } : { id: FREE_LEVER, name: "Free", promise: "No lever: the story's own tension" };
}

/** The plan's levers as the steps after it read them. */
export function leversForModels(levers: Draft2FocusLevers) {
  return {
    primary: leverForModels(levers.primary),
    ...(levers.alternatives.length ? { alternatives: levers.alternatives.map(leverForModels) } : {}),
    paidBy: levers.paidBy,
    ...(levers.factIds.length ? { factIds: levers.factIds } : {}),
  };
}

/** The catalog as the levers skill lists it: the levers on by default, by group. */
export function leverCatalogText(): string {
  return DRAFT2_LEVER_GROUPS.map((group) => [
    `### ${group.label}`,
    ...DRAFT2_LEVERS.filter((lever) => lever.group === group.id && !lever.off).map((lever) =>
      `- ${lever.id} (${lever.name}): ${lever.mechanism}. Needs: ${lever.needs}. Pays it: ${lever.pays}.${lever.never ? ` ${lever.never}.` : ""}`),
  ].join("\n")).join("\n\n");
}
