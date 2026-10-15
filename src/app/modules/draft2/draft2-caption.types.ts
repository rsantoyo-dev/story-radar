import { addressBreaches, addressFinding, type Draft2Reader } from "./draft2-address.types";
import { comparableText, type Draft2Fact } from "./draft2-facts.types";
import type { Draft2FocusSnapshot } from "./draft2-focus.types";
import {
  funnelEvaluationSchema, funnelExploreRequest, funnelFactIds, funnelJudgeRequest, funnelParseCandidates, funnelParseEvaluation, funnelRecord,
  funnelRefineRequest, funnelText, headlineKey, numbersIn, statedNumbers,
  type FunnelCandidate, type FunnelEvaluation, type FunnelGate, type FunnelIssue, type FunnelPlanRound, type FunnelRegression, type FunnelRole,
  type FunnelRound, type FunnelRun, type FunnelScore, type FunnelVersion, type FunnelWords,
} from "./draft2-funnel";
import type { Draft2CarouselSlide } from "./draft2-visual.types";

/**
 * Caption, the Draft 2 step after the images: the post's text, written for
 * the finished carousel on the shared funnel (draft2-funnel.ts). Claude
 * writes, Sol judges:
 *   round 1: 3 captions → Sol scores them and proposes 1
 *   round 2: the best revised + Sol's as written + as edited → Sol's pick
 * A caption is short lines and blank lines (kept: v1 collapses them), the
 * emojis the brand allows, the one call to action of the closing, the
 * accounts the editor confirmed and 5 to 8 hashtags; the program adds the
 * photo credits and the hashtags after the text. Everything here is pure:
 * contracts, schemas, parsing, the mechanical checks, the requests and the
 * text v1 posts.
 */
export const CAPTION_CANDIDATES = 3;
export const CAPTION_PLAN: readonly FunnelPlanRound[] = [
  { revise: 0, fresh: CAPTION_CANDIDATES, proposals: 1, effort: "medium" },
  { revise: 1, fresh: 0, proposals: 0 },
];
export const CAPTION_MAX_ROUNDS = CAPTION_PLAN.length;
export const CAPTION_ACCEPT_SCORE = 95;
export const CAPTION_CRITERION_FLOOR = 85;
/** Instagram's limit for the whole post text: the caption, its credits and its hashtags. */
export const CAPTION_MAX_CHARACTERS = 2_200;
/** v1's hashtag rule (creative-single-shot-generator.ts): at least 5, at most 8. */
export const CAPTION_MIN_HASHTAGS = 5;
export const CAPTION_MAX_HASHTAGS = 8;
/** A caption longer than this reads as one block without a blank line. */
export const CAPTION_SPACING_THRESHOLD = 240;

export const CAPTION_CRITERIA = ["hook", "scan", "grounding", "voice", "action", "hashtags", "fit"] as const;
export const CAPTION_MECHANICAL_CODES = [
  "FACT_UNKNOWN", "NO_FACTS", "TEXT_TOO_LONG", "TOO_MANY_EMOJIS", "HASHTAG_COUNT", "HASHTAG_FORMAT", "HASHTAG_IN_TEXT", "UNVERIFIED_MENTION", "MENTION_MISSING",
  "UNSUPPORTED_NUMBER", "NARRATES_CAROUSEL", "NO_SPACING", "CREDIT_IN_TEXT", "DUPLICATE_CANDIDATE", "WRONG_ADDRESS",
] as const;
export const CAPTION_JUDGE_CODES = ["WEAK_HOOK", "DENSE", "OVERCLAIMS", "OFF_VOICE", "CTA_MISMATCH", "WEAK_HASHTAGS", "REPEATS_SLIDES", "OFF_FOCUS", "OTHER"] as const;
export const CAPTION_ISSUE_CODES = [...CAPTION_MECHANICAL_CODES, ...CAPTION_JUDGE_CODES] as const;
export const CAPTION_GATE: FunnelGate = { criteria: CAPTION_CRITERIA, accept: CAPTION_ACCEPT_SCORE, floor: CAPTION_CRITERION_FLOOR };

export type Draft2CaptionCriterion = (typeof CAPTION_CRITERIA)[number];
export type Draft2CaptionIssueCode = (typeof CAPTION_ISSUE_CODES)[number];

export type Draft2CaptionCandidate = FunnelCandidate & {
  /** The post's text, with its line breaks; never the credits or the hashtags. */
  text: string;
  /** Without the #, as written in the post. */
  hashtags: string[];
  factIds: string[];
};
export type Draft2CaptionIssue = FunnelIssue & { code: Draft2CaptionIssueCode };
export type Draft2CaptionScore = FunnelScore & { hook: number; scan: number; grounding: number; voice: number; action: number; hashtags: number; fit: number };
export type Draft2CaptionEvaluation = FunnelEvaluation<Draft2CaptionCandidate, Draft2CaptionScore, Draft2CaptionIssue>;
export type Draft2CaptionRound = FunnelRound<Draft2CaptionCandidate, Draft2CaptionScore, Draft2CaptionIssue>;
export type Draft2CaptionVersion = FunnelVersion<Draft2CaptionCandidate, Draft2CaptionScore, Draft2CaptionIssue>;
export type Draft2CaptionRegression = FunnelRegression;

/** What the post's text follows besides the facts: the publication's emoji allowance and call-to-action style, and the closing's action. */
export type Draft2CaptionRules = { emojis: number; ctaStyle: string; cta: string; grave: boolean };

export type Draft2Caption = FunnelRun<Draft2CaptionCandidate, Draft2CaptionScore, Draft2CaptionIssue> & {
  writer?: FunnelRole;
  judge?: FunnelRole;
  /** What the run wrote for: the images run, the carousel's words, the focus, the accounts confirmed (and their version), the credits and the rules. */
  imagesRunId?: string;
  carousel?: Draft2CarouselSlide[];
  focus?: Draft2FocusSnapshot;
  mentions?: { name: string; handle: string }[];
  mentionsVersion?: number;
  credits?: string[];
  /** The editor left the photo credits out of the post, at their own responsibility (the photos' licenses may ask for them). It stays with the next run. */
  creditsHidden?: true;
  /** Where the story was reported (its sources' addresses), and the line the post shows for them; absent on a run written before the source line. */
  sources?: string[];
  source?: string;
  /** The editor left the source out of the post. It stays with the next run. */
  sourceHidden?: true;
  rules?: Draft2CaptionRules;
  previousRuns?: Draft2CaptionRun[];
};
export type Draft2CaptionRun = Omit<Draft2Caption, "rounds" | "previousRuns">;

const captionItem = {
  type: "object",
  properties: {
    id: { type: "string" },
    text: { type: "string" },
    hashtags: { type: "array", minItems: 1, maxItems: 12, items: { type: "string" } },
    factIds: { type: "array", maxItems: 20, items: { type: "string" } },
    angle: { type: "string" },
  },
  required: ["id", "text", "hashtags", "factIds", "angle"],
  additionalProperties: false,
};

/** The writer's answer: the complete list of captions. */
export const CAPTION_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: { candidates: { type: "array", minItems: 1, maxItems: CAPTION_CANDIDATES, items: captionItem } },
  required: ["candidates"],
  additionalProperties: false,
};

/** The judge's answer: scores, issues, the verdict and its own caption. */
export const CAPTION_EVALUATION_SCHEMA: Record<string, unknown> = funnelEvaluationSchema({ criteria: CAPTION_CRITERIA, codes: CAPTION_ISSUE_CODES, maxScored: CAPTION_CANDIDATES + 2, item: captionItem, maxProposals: 1 });

/** A text as posted: spaces tidied inside each line, at most one blank line between paragraphs, the line breaks kept. */
export function captionText(value: string): string {
  return value.replace(/\r\n?/gu, "\n").split("\n").map((line) => line.replace(/[ \t]+/gu, " ").trim()).join("\n").replace(/\n{3,}/gu, "\n\n").trim();
}

/** A hashtag as posted: without the #, letters, digits and underscores. */
export const normalHashtag = (value: string) => value.trim().replace(/^#+/u, "");
const HASHTAG = /^[\p{L}\p{N}_]{2,60}$/u;

/** One caption from a model's answer, or undefined when a part is missing. */
function captionFrom(raw: unknown, fallbackId: string): Draft2CaptionCandidate | undefined {
  const item = funnelRecord(raw);
  const text = typeof item.text === "string" ? captionText(item.text) : "";
  const hashtags = Array.isArray(item.hashtags) ? item.hashtags.filter((tag): tag is string => typeof tag === "string").map(normalHashtag).filter(Boolean).slice(0, 12) : undefined;
  const factIds = funnelFactIds(item.factIds);
  if (!text || text.length > CAPTION_MAX_CHARACTERS * 2 || !hashtags || !factIds) return undefined;
  return { id: funnelText(item.id, 24) ?? fallbackId, text, hashtags, factIds, angle: funnelText(item.angle, 400) ?? "" };
}

/** The writer's answer as captions; anything malformed is a response error, never persisted. */
export function parseCaptionCandidates(answer: string): Draft2CaptionCandidate[] {
  return funnelParseCandidates(answer, captionFrom, CAPTION_CANDIDATES);
}

/** The judge's answer as an evaluation of these captions (see funnelParseEvaluation). */
export function parseCaptionEvaluation(answer: string, candidateIds: readonly string[]): Draft2CaptionEvaluation {
  return funnelParseEvaluation(answer, candidateIds, { criteria: CAPTION_CRITERIA, codes: CAPTION_ISSUE_CODES, parts: [], parseProposal: captionFrom, maxProposals: 1 });
}

/** The credits the post shows: those the shown images owe, or none when the editor left them out. */
export const shownCredits = (caption: Pick<Draft2Caption, "credits" | "creditsHidden"> | null | undefined): string[] => caption?.creditsHidden ? [] : caption?.credits ?? [];
/** The source line the post shows, unless the editor left it out. */
export const shownSource = (caption: Pick<Draft2Caption, "source" | "sourceHidden"> | null | undefined): string | undefined => caption?.sourceHidden ? undefined : caption?.source;

/** The most sources a post credits; a story merged from more names its first ones. */
export const CAPTION_MAX_SOURCES = 3;
/** Addresses that are the publication's own (its owned content), never a source to credit. */
const OWN_HOSTS = /(^|\.)presscraftor\.local$/u;

/** The addresses of the story's sources, as a post credits them: the host without "www.", once each, the publication's own content left out. */
export function captionSourceHosts(urls: readonly string[]): string[] {
  const hosts: string[] = [];
  for (const url of urls) {
    let host: string;
    try { host = new URL(url).hostname.toLowerCase().replace(/^www\./u, ""); } catch { continue; }
    if (host && !OWN_HOSTS.test(host) && !hosts.includes(host)) hosts.push(host);
  }
  return hosts.slice(0, CAPTION_MAX_SOURCES);
}

/** The line that credits where the story was reported, in the publication's language ("Source : journaldemontreal.com"); none without a source. */
export function captionSourceLine(hosts: readonly string[], language: string): string | undefined {
  if (!hosts.length) return undefined;
  const several = hosts.length > 1;
  const label = /^(fr|french|fran[cç]ais)/iu.test(language.trim()) ? `${several ? "Sources" : "Source"}\u00a0:`
    : /^(es|spanish|espa[nñ]ol)/iu.test(language.trim()) ? `${several ? "Fuentes" : "Fuente"}:`
      : `${several ? "Sources" : "Source"}:`;
  return `${label} ${hosts.join(", ")}`;
}

/** The text v1 posts (publicationPostText): the caption, a blank line and the source line and the credits, a blank line and the hashtags. */
export function captionPostText({ text, source, credits, hashtags }: { text: string; source?: string; credits: readonly string[]; hashtags: readonly string[] }): string {
  return [captionText(text), [source ?? "", ...credits].filter(Boolean).join("\n"), hashtags.map((tag) => `#${normalHashtag(tag)}`).join(" ")].filter(Boolean).join("\n\n");
}

const EMOJI = /\p{Extended_Pictographic}/gu;
const MENTION = /(?:^|[^\p{L}\p{N}_.])@([A-Za-z0-9._]{1,30})/gu;
const HASHTAG_IN_TEXT = /(?:^|\s)#[\p{L}\p{N}_]+/u;
/** The caption talks about the carousel instead of the story, in the publications' languages. */
const NARRATION = /\b(swipe|glisse[sz]?|faites défiler|desliza|en este carrusel|dans ce carrousel|in this carousel|on the next slides?|slide \d+|diapositive \d+)\b/iu;
/** A credit or source line the program adds itself. */
const CREDIT = /(©|\b(?:photo|photos|crédit|crédits|credit|credits|foto|fotos|source|sources|fuente|fuentes)\s*:)/iu;

/**
 * The program's findings on each caption, before the judge; any one keeps a
 * caption from winning. Facts and numbers as everywhere; the whole post
 * within Instagram's limit; the brand's emoji allowance; 5 to 8 well-formed
 * hashtags, none inside the text; every account the editor confirmed tagged,
 * and no other @handle; no talk of the carousel's slides; blank lines in a
 * long caption; no credit or source line (the program adds them).
 */
export function mechanicalCaptionIssues(candidates: readonly Draft2CaptionCandidate[], facts: readonly Draft2Fact[], { source, credits, mentions, rules, reader }: {
  source?: string; credits: readonly string[]; mentions: readonly { handle: string }[]; rules: Draft2CaptionRules; reader?: Draft2Reader;
}): Draft2CaptionIssue[] {
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const allowed = new Set(mentions.map((mention) => mention.handle.replace(/^@/u, "").toLowerCase()));
  const keys = new Map<string, Draft2CaptionCandidate>();
  const issues: Draft2CaptionIssue[] = [];
  for (const candidate of candidates) {
    const add = (code: Draft2CaptionIssueCode, detail: string) => issues.push({ code, candidateId: candidate.id, detail });
    if (!candidate.factIds.length) add("NO_FACTS", "The caption cites no fact; every claim rests on verified facts.");
    const unknown = candidate.factIds.filter((id) => !byId.has(id));
    if (unknown.length) add("FACT_UNKNOWN", `Cites ${unknown.join(", ")}, which ${unknown.length === 1 ? "is not a verified fact" : "are not verified facts"}.`);
    const post = captionPostText({ text: candidate.text, source, credits, hashtags: candidate.hashtags });
    if (post.length > CAPTION_MAX_CHARACTERS) add("TEXT_TOO_LONG", `The post has ${post.length} characters with its source, credits and hashtags; Instagram takes ${CAPTION_MAX_CHARACTERS}.`);
    const emojis = candidate.text.match(EMOJI)?.length ?? 0;
    if (emojis > rules.emojis) add("TOO_MANY_EMOJIS", rules.emojis ? `The caption uses ${emojis} emojis; the publication allows ${rules.emojis}.` : "The publication allows no emoji.");
    if (candidate.hashtags.length < CAPTION_MIN_HASHTAGS || candidate.hashtags.length > CAPTION_MAX_HASHTAGS) add("HASHTAG_COUNT", `The caption has ${candidate.hashtags.length} hashtags; it takes ${CAPTION_MIN_HASHTAGS} to ${CAPTION_MAX_HASHTAGS}.`);
    const malformed = candidate.hashtags.filter((tag) => !HASHTAG.test(tag));
    const repeated = candidate.hashtags.filter((tag, index) => candidate.hashtags.findIndex((other) => other.toLowerCase() === tag.toLowerCase()) !== index);
    if (malformed.length || repeated.length) add("HASHTAG_FORMAT", `${[...malformed, ...repeated].map((tag) => `#${tag}`).join(", ")}: a hashtag is one word of letters, digits or underscores, used once.`);
    if (HASHTAG_IN_TEXT.test(candidate.text)) add("HASHTAG_IN_TEXT", "The hashtags go after the text, never inside it.");
    // A username never ends with a period: one after it ends the sentence.
    const handles = [...candidate.text.matchAll(MENTION)].map((match) => match[1]!.replace(/\.+$/u, "").toLowerCase()).filter(Boolean);
    const unverified = [...new Set(handles.filter((handle) => !allowed.has(handle)))];
    if (unverified.length) add("UNVERIFIED_MENTION", `${unverified.map((handle) => `@${handle}`).join(", ")} ${unverified.length === 1 ? "is" : "are"} not an account the editor confirmed; write the name instead.`);
    // The editor confirmed an account to have it tagged: a caption that leaves one out is not done.
    const missing = [...new Set(mentions.map((mention) => mention.handle.replace(/^@/u, "")))].filter((handle) => !handles.includes(handle.toLowerCase()));
    if (missing.length) add("MENTION_MISSING", `${missing.map((handle) => `@${handle}`).join(", ")} ${missing.length === 1 ? "is an account the editor confirmed; tag it" : "are accounts the editor confirmed; tag each"} once, where its name would go or right after it.`);
    const cited = candidate.factIds.flatMap((id) => { const fact = byId.get(id); return fact ? [fact] : []; });
    const stated = statedNumbers(cited);
    const unsupported = [...new Set(numbersIn(candidate.text).filter((number) => !stated.has(number.digits)).map((number) => number.written))];
    if (unsupported.length) add("UNSUPPORTED_NUMBER", `${unsupported.join(", ")} ${unsupported.length === 1 ? "is" : "are"} not stated by the facts this caption cites.`);
    const narration = NARRATION.exec(candidate.text);
    if (narration) add("NARRATES_CAROUSEL", `"${narration[0]}" talks about the carousel; the caption talks about the story.`);
    if (candidate.text.length > CAPTION_SPACING_THRESHOLD && !candidate.text.includes("\n\n")) add("NO_SPACING", "A caption this long needs blank lines between its parts.");
    if (CREDIT.test(candidate.text)) add("CREDIT_IN_TEXT", "The source and the photo credits are added after the text by the program; leave them out.");
    const address = addressBreaches(candidate.text, reader);
    if (address.length && reader) add("WRONG_ADDRESS", addressFinding(address, reader));
    const key = headlineKey(candidate.text.split("\n")[0] ?? "");
    const earlier = keys.get(key);
    if (earlier && !(candidate.proposalOf && earlier.proposalOf === candidate.proposalOf)) add("DUPLICATE_CANDIDATE", `The caption opens like ${earlier.id}.`);
    else if (!earlier) keys.set(key, candidate);
  }
  return issues;
}

/** Whether two captions say the same thing: the same text, hashtags and facts. */
export const sameCaption = (a: Draft2CaptionCandidate, b: Draft2CaptionCandidate) =>
  comparableText(a.text) === comparableText(b.text) && a.hashtags.map((tag) => tag.toLowerCase()).join() === b.hashtags.map((tag) => tag.toLowerCase()).join() && a.factIds.join() === b.factIds.join();

export const CAPTION_REVISION_INSTRUCTION = "Revise each caption in captions and return exactly one candidate per caption, with the same id. Keep its opening line, its voice and every claim already approved; fix what its issues name in as few words as possible, keeping its line breaks. Never make it longer, denser or more generic to gain precision. When earlierAttempts lists a revision that scored lower, do not repeat what made it worse.";
export const CAPTION_DEVELOP_INSTRUCTION = "Edit the caption in develop and return it with its id. Keep its opening line and voice unless a fact or a program rule requires a change; change only what must change, in as few words as possible. A caption that is already right comes back unchanged. It also competes as written, so an edit only helps when it is better.";
const newCaptionsInstruction = (count: number) => `Then write ${count} new ${count === 1 ? "caption" : "captions"}, with ids ${Array.from({ length: count }, (_, index) => `n${index + 1}`).join(", ")}: each a different way in from every caption in anglesSoFar, built to answer the issues and suggestions.`;

/** How the caption's requests name things. */
export const CAPTION_WORDS: FunnelWords<Draft2CaptionCandidate, "captions"> = {
  task: "captions",
  listKey: "captions",
  label: (candidate) => ({ opening: candidate.text.split("\n")[0] ?? "" }),
  noCleanNote: "No caption so far is clean enough to revise. Write new captions, each different from every caption in anglesSoFar, that avoid these issues.",
  revise: CAPTION_REVISION_INSTRUCTION,
  develop: CAPTION_DEVELOP_INSTRUCTION,
  newCandidates: newCaptionsInstruction,
};

export function captionExploreRequest(candidatesWanted: number, last?: Draft2CaptionRound, versions: readonly Draft2CaptionVersion[] = []) {
  return funnelExploreRequest(CAPTION_WORDS, candidatesWanted, last, versions);
}

export function captionRefineRequest(targets: readonly Draft2CaptionVersion[], versions: readonly Draft2CaptionVersion[], regressions: readonly Draft2CaptionRegression[], last: Draft2CaptionRound | undefined, newCaptions = 0, proposals: readonly Draft2CaptionCandidate[] = []) {
  return funnelRefineRequest(CAPTION_WORDS, targets, versions, regressions, last, newCaptions, proposals);
}

export function captionJudgeRequest(round: number, candidates: readonly Draft2CaptionCandidate[], mechanical: readonly Draft2CaptionIssue[], revised: readonly Draft2CaptionVersion[]) {
  return funnelJudgeRequest(CAPTION_WORDS.task, CAPTION_PLAN, round, candidates, mechanical, revised);
}

/** The publication's rules for the post, added to the brand brief for both models. */
export function captionRulesBrief(rules: Draft2CaptionRules): string {
  const style = rules.ctaStyle.replace(/\s+/g, " ").trim();
  return [
    "# The post",
    rules.emojis > 0 ? `- Emojis: at most ${rules.emojis} in the whole caption.` : "- Emojis: none.",
    rules.grave ? "- The story is grave: no call to action." : `- The call to action: the closing's, the same single action, stated once (${rules.cta || "the closing has none"}).`,
    style ? `- The publication's call-to-action style (its voice; the action is the closing's): ${style}` : "",
  ].filter(Boolean).join("\n");
}
