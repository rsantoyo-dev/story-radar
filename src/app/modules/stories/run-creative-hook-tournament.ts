import "server-only";

import type { CreativeAiUsage, CreativeFormat, CreativeKeyFact, CreativeProfile, GeneratedCreativeBrief, GeneratedCreativeDraft } from "./creative-content.types";
import {
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
  selectHook,
  type CreativeHookTournament,
  type HookCandidate,
  type HookScore,
  type HookTasteExample,
} from "./creative-hook-tournament";
import { deterministicCreativeQualityIssues } from "./creative-quality";
import { generateOpenAiStructuredResponse, type OpenAiUsageContext } from "./openai-structured-response";

/** The cover is the most important decision in a post: the strongest writer makes it. */
const DEFAULT_HOOK_MODEL = "gpt-6.1-sol";
const TIMEOUT_MS = 180_000;
/** Write, judge, polish the finalists, judge again. */
export const HOOK_TOURNAMENT_CALLS = 4;

type Entry = HookCandidate & { score?: HookScore; total?: number; rejected?: string; round?: 1 | 2 };

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

/**
 * Write about ten covers, judge them blind, polish the best eligible ones and
 * judge the finalists again. A cover that adds a validation blocker the
 * writer's cover did not have never reaches a judge, and the writer's cover
 * competes in every judging: it is replaced only when the judge ranks an
 * eligible cover above it.
 */
function writingEffort(): "medium" | "high" {
  return process.env.CREATIVE_HOOK_REASONING?.trim().toLowerCase() === "high" ? "high" : "medium";
}

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
  const cover = draft.units[0];
  if (!cover) throw new Error("The draft has no cover to improve");
  const allowedFactIds = coverAllowedFactIds(brief, draft);
  const facts: CreativeKeyFact[] = brief.keyFacts.filter((fact) => allowedFactIds.includes(fact.id));
  const context = { publication: profile.name, language: profile.language, region: profile.region, audience: profile.audience };
  const call = (instructions: string, contents: string, schemaName: string, schema: object, effort: "medium" | "high", modelName: string, maxOutputTokens: number) =>
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

  // The same deterministic gates the writer's script passed. A new cover keeps
  // citing the writer's cover facts too, so names and figures it inherits from
  // them stay supported.
  const blockers = (value: GeneratedCreativeDraft) => new Set(deterministicCreativeQualityIssues(
    value, input.format, brief.keyFacts, profile.language, profile.conversionGoal, profile.framingStrategy, profile.storyStructure,
  ).filter((issue) => issue.severity === "blocker").map((issue) => `${issue.code}:${issue.unitOrder ?? 0}`));
  const before = blockers(draft);
  const admit = (parsed: HookCandidate[], round: 1 | 2): Entry[] => parsed.map((candidate) => {
    const entry: Entry = { ...candidate, factIds: [...new Set([...cover.factIds, ...candidate.factIds])], round };
    const introduced = [...blockers(applyHookToDraft(draft, entry))].filter((key) => !before.has(key));
    return introduced.length ? { ...entry, rejected: `Introduces validation blockers: ${introduced.join(", ")}` } : entry;
  });
  const judge = async (options: Entry[]) => {
    const response = await call(buildHookJudgeInstructions(), buildHookJudgeContents({ ...context, facts, draft, options, ...(input.houseTaste?.length ? { houseTaste: input.houseTaste } : {}) }), "hook_scores", HOOK_SCORES_SCHEMA, "medium", judgeModel, 12_000);
    parseHookScores(response.text, options.length).forEach((score, index) => {
      options[index].score = score;
      options[index].total = hookTotal(score);
    });
    // The ranking is over the judged options, as indexes into the same list.
    return { response, ranking: parseHookRanking(response.text, options.length)?.map((option) => option - 1) };
  };

  const incumbent: Entry = {
    headline: cover.headline,
    subheadline: cover.subheadline ?? "",
    mechanism: "incumbent",
    segment: "",
    factIds: cover.factIds,
    payoffUnitOrder: Math.min(2, draft.units.length),
  };

  // Round 1: the open field.
  const written = await call(buildHookGeneratorInstructions(), buildHookGeneratorContents({ ...context, brief, draft, allowedFactIds }), "hook_candidates", HOOK_CANDIDATES_SCHEMA, writingEffort(), model, 20_000);
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
    const refined = await call(buildHookRefineInstructions(), buildHookRefineContents({ ...context, facts, draft, covers: finalists }), "hook_candidates", HOOK_CANDIDATES_SCHEMA, writingEffort(), model, 16_000);
    usage = addUsage(usage, refined.usage);
    calls += 1;
    const known = new Set([incumbent, ...field].map((entry) => entry.headline.trim().toLocaleLowerCase()));
    try {
      polished.push(...admit(parseHookCandidates(refined.text, { allowedFactIds, slideCount: draft.units.length, incumbentHeadline: cover.headline, language: profile.language }), 2)
        .filter((entry) => !known.has(entry.headline.trim().toLocaleLowerCase())));
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
