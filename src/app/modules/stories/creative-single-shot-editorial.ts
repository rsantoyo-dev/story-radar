import "server-only";

import { actionableEditorialIssues, improved } from "./creative-editorial-loop";
import { applyFinalCreativePatches, finalRepairSchema, FINAL_REPAIR_INSTRUCTION } from "./creative-final-repair";
import { generateOpenAiStructuredResponse } from "./openai-structured-response";
import {
  assertVisibleDraftLanguage,
  isConcreteFactualQualityIssue,
  runOpenAiEditorialQualityGate,
  sumCreativeAiUsage,
} from "./gemini-creative-content-generator";
import { generateSingleShotCreativeScript } from "./creative-single-shot-generator";
import { deterministicCreativeQualityIssues } from "./creative-quality";
import type { CreativeEditorialModelConfig } from "./creative-editorial-router";
import { effectiveFramingStrategy } from "./creative-content.types";
import type {
  CreativeAiUsage,
  GeneratedCreativeBrief,
  GeneratedCreativeDraft,
} from "./creative-content.types";

/**
 * Generation gets its own cap so it can never eat the editorial steps' budget.
 * Two logical calls (brief, script — Gemini refuses the merged schema, see
 * creative-single-shot-generator.ts), plus room for a validation retry or an
 * overloaded-account fallback on each.
 */
const GENERATION_CALL_CAP = 4;

/**
 * Audit, repair and verify. Reserved rather than "whatever generation left
 * over": a run that spent everything writing and then skipped its own quality
 * gate is the failure mode this split exists to prevent.
 */
const EDITORIAL_CALL_RESERVE = 3;

/**
 * Physical text-provider calls allowed per logical run, including retries.
 * Typical run is 3 (brief, script, audit); worst case 7. For comparison, the
 * pipeline this replaces averaged about 15.
 */
const SINGLE_SHOT_CALL_BUDGET = GENERATION_CALL_CAP + EDITORIAL_CALL_RESERVE;

export type SingleShotCheckpoint = {
  brief: GeneratedCreativeBrief;
  draft: GeneratedCreativeDraft;
  usage: CreativeAiUsage;
  callsUsed: number;
};

export type SingleShotPipelineResult = SingleShotCheckpoint;

/**
 * generate (1 Gemini call, possibly +1 bounded validation retry) -> audit
 * (1 Terra call, read-only, full schema) -> [repair (1 Sol call) -> verify (1
 * Terra call, read-only, slim)] only when the audit found something
 * correctable and the budget allows a full repair+verify round. Never spends
 * a repair call it cannot also verify, and never promotes a repaired draft
 * that verification could not confirm — the pre-repair, already-audited copy
 * is kept instead. `checkpoint` is called before/after every state change so
 * a crash or outage resumes from durable state rather than restarting.
 */
export async function runSingleShotCreativePipeline(
  options: Parameters<typeof generateSingleShotCreativeScript>[0] & {
    deadline: number;
    checkpoint: (value: SingleShotCheckpoint) => Promise<void>;
  },
): Promise<SingleShotPipelineResult> {
  const { openAiApiKey, openAiEditorialModels, openAiAuditContext, deadline, checkpoint, ...generatorOptions } = options;

  const generated = await generateSingleShotCreativeScript({ ...generatorOptions, maxAttempts: GENERATION_CALL_CAP });
  let usage = generated.usage;
  let callsUsed = generated.attempts;
  const brief = generated.brief;
  let draft: GeneratedCreativeDraft = {
    ...generated.draft,
    singleShotRun: { stage: "generated", callsUsed },
  };
  await checkpoint({ brief, draft, usage, callsUsed });

  // Judge the draft by the lens the brief actually applied. A brief that
  // correctly fell back to explainer — because no fact established a reader
  // consequence — was still being failed for not being reader-framed.
  const judgedProfile = {
    ...generatorOptions.profile,
    framingStrategy: effectiveFramingStrategy(generatorOptions.profile.framingStrategy, brief),
  };

  if (!openAiApiKey || !openAiEditorialModels) {
    draft = {
      ...draft,
      singleShotRun: { stage: "generated", callsUsed, stopReason: "No independent auditor is configured." },
    };
    await checkpoint({ brief, draft, usage, callsUsed });
    return { brief, draft, usage, callsUsed };
  }

  // One audit attempt, no same-step model fallback: deduping criticModel and
  // severeRepairModel makes criticCandidates() return a single entry.
  const auditorOnly: CreativeEditorialModelConfig = {
    ...openAiEditorialModels,
    severeRepairModel: openAiEditorialModels.criticModel,
  };

  callsUsed += 1;
  const audit = await runOpenAiEditorialQualityGate({
    apiKey: openAiApiKey,
    models: auditorOnly,
    currentDraft: draft,
    format: generatorOptions.format,
    brief,
    topic: generatorOptions.topic,
    profile: judgedProfile,
    outputAspectRatio: generatorOptions.outputAspectRatio,
    characterRoster: generatorOptions.characterRoster,
    readOnly: true,
    slim: false,
    deadline,
    auditContext: openAiAuditContext,
  });
  usage = sumCreativeAiUsage(usage, audit.usage);

  if (audit.criticUnavailable) {
    // Recoverable: the generated script is checkpointed and unchanged; a
    // later recovery pass resumes by re-attempting only the audit call.
    draft = {
      ...draft,
      singleShotRun: {
        stage: "generated",
        callsUsed,
        stopReason: `Independent audit unavailable: ${audit.criticUnavailable.reason}`,
      },
    };
    await checkpoint({ brief, draft, usage, callsUsed });
    return { brief, draft, usage, callsUsed };
  }

  draft = audit.draft;
  const actionable = actionableEditorialIssues(draft);
  const auditedDraft = draft;

  // Only the auditor's own verdict means accepted. buildCreativeQualityReview
  // sets "accepted" exactly when every dimension clears
  // CREATIVE_PUBLISHABLE_THRESHOLDS, so a draft that is merely free of
  // blocker-severity issues is NOT accepted: a hook at 76/85 or a resolution
  // at 55/80 is a real shortfall, and closing it is what the repair pass is
  // for. Treating "no blockers" as acceptance silently discarded the audit.
  if (draft.qualityReview?.status === "accepted") {
    draft = { ...draft, singleShotRun: { stage: "done", callsUsed, verdict: "accepted" } };
    await checkpoint({ brief, draft, usage, callsUsed });
    return { brief, draft, usage, callsUsed };
  }

  // Below the bar, but with nothing a targeted patch could act on.
  if (!actionable.length) {
    draft = {
      ...draft,
      singleShotRun: {
        stage: "done",
        callsUsed,
        verdict: "correctable",
        stopReason: "The draft is below the publishable bar but the review left no actionable finding to correct.",
      },
    };
    await checkpoint({ brief, draft, usage, callsUsed });
    return { brief, draft, usage, callsUsed };
  }

  if (callsUsed + 2 > SINGLE_SHOT_CALL_BUDGET) {
    draft = {
      ...draft,
      singleShotRun: {
        stage: "audited",
        callsUsed,
        verdict: "correctable",
        findings: actionable,
        stopReason: "No call budget remains for a repair-and-verify round; kept as the best available version for human review.",
      },
    };
    await checkpoint({ brief, draft, usage, callsUsed });
    return { brief, draft, usage, callsUsed };
  }

  callsUsed += 1;
  const scopes = actionable.some((issue) => !issue.unitOrder)
    ? [0, ...auditedDraft.units.map((unit) => unit.order)]
    : [...new Set(actionable.map((issue) => issue.unitOrder!))];
  let repaired: GeneratedCreativeDraft | undefined;
  let repairRejectionReason: string | undefined;
  try {
    const response = await generateOpenAiStructuredResponse({
      apiKey: openAiApiKey,
      model: openAiEditorialModels.severeRepairModel,
      schema: finalRepairSchema,
      schemaName: "creative_single_shot_repair",
      reasoningEffort: "medium",
      maxOutputTokens: 4_096,
      timeoutMs: Math.min(60_000, deadline - Date.now()),
      auditContext: openAiAuditContext,
      instructions: `${FINAL_REPAIR_INSTRUCTION}\nCorrect the supplied editorial findings. Preserve sound slides. Do not award scores or change evidence.`,
      contents: {
        draft: auditedDraft,
        blockers: actionable,
        editableScopes: scopes,
        facts: brief.keyFacts,
        carouselPlan: brief.carouselPlan,
        topic: generatorOptions.topic,
        language: generatorOptions.profile.language,
        conversionGoal: generatorOptions.profile.conversionGoal,
      },
    });
    usage = sumCreativeAiUsage(usage, response.usage);
    const candidate = applyFinalCreativePatches(auditedDraft, response.text, scopes);
    assertVisibleDraftLanguage(candidate, generatorOptions.profile.language);
    const inspect = (value: GeneratedCreativeDraft) =>
      deterministicCreativeQualityIssues(
        value,
        generatorOptions.format,
        brief.keyFacts,
        judgedProfile.language,
        judgedProfile.conversionGoal,
        judgedProfile.framingStrategy,
      )
        .filter((issue) => issue.severity === "blocker")
        .map((issue) => `${issue.code}:${issue.unitOrder ?? 0}`);
    const before = new Set(inspect(auditedDraft));
    const introduced = inspect(candidate).filter((key) => !before.has(key));
    if (introduced.length) {
      repairRejectionReason = `Correction introduces validation blockers: ${introduced.join(", ")}`;
    } else {
      repaired = candidate;
    }
  } catch (error) {
    repairRejectionReason = error instanceof Error ? error.message : "Correction failed local validation";
  }

  if (!repaired) {
    draft = {
      ...auditedDraft,
      singleShotRun: {
        stage: "audited",
        callsUsed,
        verdict: "correctable",
        findings: actionable,
        stopReason: repairRejectionReason ?? "The repair made no usable change.",
      },
    };
    await checkpoint({ brief, draft, usage, callsUsed });
    return { brief, draft, usage, callsUsed };
  }
  await checkpoint({
    brief,
    draft: { ...repaired, singleShotRun: { stage: "repairing", callsUsed } },
    usage,
    callsUsed,
  });

  callsUsed += 1;
  const verify = await runOpenAiEditorialQualityGate({
    apiKey: openAiApiKey,
    models: auditorOnly,
    currentDraft: repaired,
    format: generatorOptions.format,
    brief,
    topic: generatorOptions.topic,
    profile: judgedProfile,
    outputAspectRatio: generatorOptions.outputAspectRatio,
    characterRoster: generatorOptions.characterRoster,
    readOnly: true,
    slim: true,
    deadline,
    auditContext: openAiAuditContext,
  });
  usage = sumCreativeAiUsage(usage, verify.usage);

  if (verify.criticUnavailable) {
    // Never promote an unverified correction: keep the pre-repair, already
    // independently audited copy as current.
    draft = {
      ...auditedDraft,
      singleShotRun: {
        stage: "audited",
        callsUsed,
        verdict: "correctable",
        findings: actionable,
        stopReason: `Verification unavailable: ${verify.criticUnavailable.reason}. The correction was not promoted.`,
      },
    };
    await checkpoint({ brief, draft, usage, callsUsed });
    return { brief, draft, usage, callsUsed };
  }

  const verified = verify.draft;
  const finalDraft = improved(auditedDraft, verified) ? verified : auditedDraft;
  const finalActionable = actionableEditorialIssues(finalDraft);
  const finalBlockers = finalActionable.filter((issue) => issue.severity === "blocker");
  // blocked_source means the source cannot support what was asked. While the
  // brief still holds proven facts the script never spent, that claim is false:
  // the defect is allocation or wording, which a human (or a re-plan) can fix
  // without new research. Calling it blocked would send the editor hunting for
  // evidence that is already sitting in the brief.
  const spentFactIds = new Set(finalDraft.units.flatMap((unit) => unit.factIds ?? []));
  const unspentFacts = brief.keyFacts.filter((fact) => !spentFactIds.has(fact.id));
  const evidenceBlocked =
    unspentFacts.length === 0 && finalBlockers.some(isConcreteFactualQualityIssue);

  // Same rule as the first gate: the auditor's verdict decides, not the
  // absence of blocker-severity findings.
  if (finalDraft.qualityReview?.status === "accepted") {
    draft = { ...finalDraft, singleShotRun: { stage: "done", callsUsed, verdict: "accepted" } };
  } else if (evidenceBlocked) {
    // A wording correction cannot supply missing evidence: this is the
    // outcome AGENTS.md's factual-safety rules call for when that stays true
    // even after one verified repair attempt.
    draft = {
      ...finalDraft,
      singleShotRun: { stage: "done", callsUsed, verdict: "blocked_source" },
      blockedSource: {
        reason: "Independent review still finds the request unsupported by the available evidence after one verified correction.",
        missingEvidence: finalBlockers.filter(isConcreteFactualQualityIssue).map((issue) => issue.message),
      },
    };
  } else {
    draft = {
      ...finalDraft,
      singleShotRun: {
        stage: "done",
        callsUsed,
        verdict: "correctable",
        findings: finalActionable,
        stopReason: "The corrected copy is still below the publishable bar after one verified repair; kept as the best available version for human review.",
      },
    };
  }
  await checkpoint({ brief, draft, usage, callsUsed });
  return { brief, draft, usage, callsUsed };
}
