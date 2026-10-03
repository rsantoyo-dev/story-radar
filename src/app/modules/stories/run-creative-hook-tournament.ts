import "server-only";

import type { CreativeAiUsage, CreativeFormat, CreativeKeyFact, CreativeProfile, GeneratedCreativeBrief, GeneratedCreativeDraft } from "./creative-content.types";
import {
  admitHookCandidate,
  applyHookToDraft,
  buildHookGeneratorContents,
  buildHookGeneratorInstructions,
  buildHookJudgeContents,
  buildHookJudgeInstructions,
  buildHookRefineContents,
  buildHookRefineInstructions,
  coverAllowedFactIds,
  CREATIVE_HOOK_TOURNAMENT_PROMPT_VERSION,
  HOOK_CANDIDATES_SCHEMA,
  HOOK_FINALISTS,
  HOOK_SCORES_SCHEMA,
  hookPassesGates,
  hookTotal,
  parseHookCandidates,
  parseHookRanking,
  parseHookScores,
  secondPassesGates,
  selectHook,
  type CreativeHookTournament,
  type HookCandidate,
  type HookScore,
  type HookTasteExample,
} from "./creative-hook-tournament";
import { CAROUSEL_SLIDE_MAX_WORDS } from "./carousel-narrative";
import { deterministicCreativeQualityIssues } from "./creative-quality";
import { generateOpenAiStructuredResponse, type OpenAiUsageContext } from "./openai-structured-response";

/** The cover is the most important decision in a post: the strongest writer makes it. */
const DEFAULT_HOOK_MODEL = "gpt-6.1-sol";
const TIMEOUT_MS = 180_000;
/** Write, judge, polish the finalists, judge again. */
export const HOOK_TOURNAMENT_CALLS = 4;

type Entry = HookCandidate & { score?: HookScore; total?: number; rejected?: string; secondDropped?: string; round?: 1 | 2 };

export function creativeHookTournamentEnabled(): boolean {
  return process.env.CREATIVE_HOOK_TOURNAMENT?.trim().toLowerCase() !== "off";
}

function addUsage(left: CreativeAiUsage, right: CreativeAiUsage): CreativeAiUsage {
  return {
    promptTokens: left.promptTokens + right.promptTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    thoughtsTokens: left.thoughtsTokens + right.thoughtsTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

// Low reasoning wrote covers as strong as medium in trials, for about a third
// less cost and time; the judge, at medium, and the gates keep the facts.
function writingEffort(): "low" | "medium" | "high" {
  const effort = process.env.CREATIVE_HOOK_REASONING?.trim().toLowerCase();
  return effort === "high" || effort === "medium" ? effort : "low";
}

/**
 * Write six covers, each with the slide 2 headline that pays it off, judge
 * them blind, polish the two best eligible ones and judge the finalists again.
 * A cover that adds a validation blocker the writer's cover did not have never
 * reaches a judge; a slide 2 headline that adds a rule issue or fails the
 * judge's slide 2 gates is dropped, keeping slide 2 as it is. The writer's
 * cover competes in every judging: it is replaced only when the judge ranks
 * an eligible cover above it.
 */
export async function runCreativeHookTournament(input: {
  apiKey: string;
  auditContext?: OpenAiUsageContext;
  profile: CreativeProfile;
  brief: GeneratedCreativeBrief;
  draft: GeneratedCreativeDraft;
  format: CreativeFormat;
  /** 1 skips the polishing round when time is short. */
  rounds?: 1 | 2;
  /** The editor's recent picks for this Topic: the judge learns the house taste from them. */
  houseTaste?: readonly HookTasteExample[];
}): Promise<{ draft: GeneratedCreativeDraft; tournament: CreativeHookTournament; usage: CreativeAiUsage; calls: number }> {
  const model = process.env.CREATIVE_HOOK_MODEL?.trim() || DEFAULT_HOOK_MODEL;
  const judgeModel = process.env.CREATIVE_HOOK_JUDGE_MODEL?.trim() || model;
  const { profile, brief, draft } = input;
  const [cover, second] = draft.units;
  if (!cover) throw new Error("The draft has no cover to improve");
  const wordCount = (value?: string) => (value?.trim() ? value.trim().split(/\s+/u).length : 0);
  // Slide 2's headline and subheadline share the slide's word budget with its supporting text.
  const secondSlideWordBudget = second ? Math.max(4, CAROUSEL_SLIDE_MAX_WORDS - wordCount(second.body)) : undefined;
  const allowedFactIds = coverAllowedFactIds(brief, draft);
  const facts: CreativeKeyFact[] = brief.keyFacts.filter((fact) => allowedFactIds.includes(fact.id));
  const context = { publication: profile.name, language: profile.language, region: profile.region, audience: profile.audience };
  const call = (instructions: string, contents: string, schemaName: string, schema: object, effort: "low" | "medium" | "high", modelName: string, maxOutputTokens: number) =>
    generateOpenAiStructuredResponse({
      apiKey: input.apiKey,
      model: modelName,
      instructions,
      contents,
      schema: schema as Record<string, unknown>,
      schemaName,
      // High reasoning spends most of the budget thinking before it writes.
      maxOutputTokens,
      reasoningEffort: effort,
      timeoutMs: TIMEOUT_MS,
      ...(input.auditContext ? { auditContext: input.auditContext } : {}),
    });

  // The same deterministic gates the writer's script passed.
  const issues = (value: GeneratedCreativeDraft) => deterministicCreativeQualityIssues(
    value, input.format, brief.keyFacts, profile.language, profile.conversionGoal, profile.framingStrategy, profile.storyStructure,
  );
  const admit = (parsed: HookCandidate[], round: 1 | 2): Entry[] => parsed.map((candidate) => {
    const checked = admitHookCandidate<Entry>(draft, { ...candidate, round }, issues);
    if (checked.blockers.length) return { ...checked.candidate, rejected: `Introduces validation blockers: ${checked.blockers.join(", ")}` };
    return checked.secondDropped ? { ...checked.candidate, secondDropped: checked.secondDropped.join(", ") } : checked.candidate;
  });
  const judge = async (options: Entry[]) => {
    const response = await call(buildHookJudgeInstructions(), buildHookJudgeContents({ ...context, facts, draft, options, ...(input.houseTaste?.length ? { houseTaste: input.houseTaste } : {}) }), "hook_scores", HOOK_SCORES_SCHEMA, "medium", judgeModel, 12_000);
    parseHookScores(response.text, options.length).forEach((score, index) => {
      const option = options[index];
      option.score = score;
      option.total = hookTotal(score);
      // A slide 2 headline the judge finds unfaithful or weak is dropped; the cover keeps competing.
      if (option !== incumbent && option.secondHeadline && !secondPassesGates(score)) {
        option.secondDropped = `Judge: slide 2 ${score.slide2 ?? "–"}, fidelity ${score.slide2Fidelity ?? "–"} (${option.secondHeadline})`;
        option.secondHeadline = "";
        option.secondSubheadline = "";
      }
    });
    // The ranking is over the judged options, as indexes into the same list.
    return { response, ranking: parseHookRanking(response.text, options.length)?.map((option) => option - 1) };
  };

  const incumbent: Entry = {
    headline: cover.headline,
    subheadline: cover.subheadline ?? "",
    secondHeadline: second?.headline ?? "",
    secondSubheadline: second?.subheadline ?? "",
    mechanism: "incumbent",
    segment: "",
    factIds: cover.factIds,
    payoffUnitOrder: Math.min(2, draft.units.length),
  };

  // Round 1: the open field.
  const written = await call(buildHookGeneratorInstructions(), buildHookGeneratorContents({ ...context, brief, draft, allowedFactIds, ...(secondSlideWordBudget ? { secondSlideWordBudget } : {}) }), "hook_candidates", HOOK_CANDIDATES_SCHEMA, writingEffort(), model, 20_000);
  let usage = written.usage;
  const field = admit(parseHookCandidates(written.text, { allowedFactIds, slideCount: draft.units.length, incumbentHeadline: cover.headline, language: profile.language }), 1);
  const firstOptions = [incumbent, ...field.filter((entry) => !entry.rejected)];
  const first = await judge(firstOptions);
  usage = addUsage(usage, first.response.usage);
  let calls = 2;

  // Round 2: polish the best eligible covers, then judge them again with the
  // writer's cover still competing.
  const order = first.ranking ?? firstOptions.map((_, index) => index).sort((a, b) => (firstOptions[b].total ?? 0) - (firstOptions[a].total ?? 0));
  const finalists = order
    .map((index) => firstOptions[index])
    .filter((entry) => entry !== incumbent && entry.score && hookPassesGates(entry.score))
    .slice(0, HOOK_FINALISTS);
  let finalOptions = firstOptions;
  let finalRanking = first.ranking;
  let judgeModelUsed = first.response.model;
  const polished: Entry[] = [];
  if (finalists.length && (input.rounds ?? 2) === 2) {
    const refined = await call(buildHookRefineInstructions(), buildHookRefineContents({ ...context, facts, draft, covers: finalists, ...(secondSlideWordBudget ? { secondSlideWordBudget } : {}) }), "hook_candidates", HOOK_CANDIDATES_SCHEMA, writingEffort(), model, 16_000);
    usage = addUsage(usage, refined.usage);
    calls += 1;
    const openingKey = (entry: HookCandidate) => `${entry.headline}|${entry.secondHeadline ?? ""}`.trim().toLocaleLowerCase();
    const known = new Set([incumbent, ...field].map(openingKey));
    try {
      polished.push(...admit(parseHookCandidates(refined.text, { allowedFactIds, slideCount: draft.units.length, incumbentHeadline: cover.headline, language: profile.language }), 2)
        .filter((entry) => !known.has(openingKey(entry))));
    } catch {
      // A polishing round with nothing usable leaves the first judging in place.
    }
    const finalField = [incumbent, ...finalists, ...polished.filter((entry) => !entry.rejected)];
    if (finalField.length > 1 + finalists.length) {
      const second = await judge(finalField);
      usage = addUsage(usage, second.response.usage);
      calls += 1;
      finalOptions = finalField;
      finalRanking = second.ranking;
      judgeModelUsed = second.response.model;
    }
  }

  const picked = selectHook(finalOptions, finalRanking);
  const selected = finalOptions[picked.selectedIndex];
  const candidates: Entry[] = [incumbent, ...field, ...polished];
  const tournament: CreativeHookTournament = {
    promptVersion: CREATIVE_HOOK_TOURNAMENT_PROMPT_VERSION,
    model: written.model,
    judgeModel: judgeModelUsed,
    at: new Date().toISOString(),
    candidates,
    selectedIndex: candidates.indexOf(selected),
    replaced: picked.replaced,
  };
  return {
    draft: { ...(picked.replaced ? applyHookToDraft(draft, selected) : draft), hookTournament: tournament },
    tournament,
    usage,
    calls,
  };
}
