import "server-only";

import { actionableEditorialIssues, improved } from "./creative-editorial-loop";
import {
  isConcreteFactualQualityIssue,
  runGeminiEditorialQualityGate,
  sumCreativeAiUsage,
} from "./gemini-creative-content-generator";
import { generateSingleShotCreativeScript } from "./creative-single-shot-generator";
import { CREATIVE_PUBLISHABLE_THRESHOLDS, deterministicCreativeQualityIssues } from "./creative-quality";
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
 * gate is the failure mode this split exists to prevent. One audit call, plus
 * up to MAX_SINGLE_SHOT_REPAIR_ROUNDS rounds of (repair + verify).
 */
const EDITORIAL_CALL_RESERVE = 7;

/**
 * Physical text-provider calls allowed per logical run, including retries.
 * Typical run is 3 (brief, script, audit) since most drafts clear the bar on
 * the first audit or a single cheap repair round; worst case is 11 when every
 * repair round is spent without reaching accepted.
 */
const SINGLE_SHOT_CALL_BUDGET = GENERATION_CALL_CAP + EDITORIAL_CALL_RESERVE;

/**
 * Luna is cheap enough that several attempts cost less than one Sol/Terra
 * round, so more, smaller shots at the same open findings beats a single
 * expensive one. Bounded so a source with an inherent gap (see
 * evidenceBlocked below) cannot loop forever chasing an unreachable score.
 */
const MAX_SINGLE_SHOT_REPAIR_ROUNDS = 3;

export type SingleShotCheckpoint = {
  brief: GeneratedCreativeBrief;
  draft: GeneratedCreativeDraft;
  usage: CreativeAiUsage;
  callsUsed: number;
  /**
   * Whoever actually wrote the visible script for the draft in this exact
   * checkpoint — "openai" when a Topic hands the carousel writer (or the
   * repair loop) to an OpenAI model, "google" otherwise. A kept repair round
   * updates this to its own writer: a Luna-repaired draft must never be
   * checkpointed under the initial writer's name. Callers must persist this
   * instead of assuming "google", or a Sol/Luna-written draft is silently
   * mislabeled as Gemini's.
   */
  provider: "google" | "openai";
  model: string;
};

export type SingleShotPipelineResult = SingleShotCheckpoint;

/**
 * generate (1 Gemini call, possibly +1 bounded validation retry) -> audit (1
 * Gemini call, read-only, full schema) -> up to MAX_SINGLE_SHOT_REPAIR_ROUNDS
 * rounds of [repair (1 Luna call, or whichever repairWriterModel is
 * configured) -> verify (1 Gemini call, read-only, slim)], stopping the
 * moment a round is accepted or fails to improve on the last kept draft. The
 * critic is always Gemini — a different model family from any configured
 * OpenAI writer, so it is never the writer grading its own draft. Never
 * spends a repair call it cannot also verify, and never promotes a repaired
 * draft that verification could not confirm improved on the last kept
 * version. `checkpoint` is called before/after every state change so a crash
 * or outage resumes from durable state rather than restarting.
 */
export async function runSingleShotCreativePipeline(
  options: Parameters<typeof generateSingleShotCreativeScript>[0] & {
    /** Unused now that both editorial gates run on Gemini (no per-call timeout param); kept optional so existing callers need not change. */
    deadline?: number;
    checkpoint: (value: SingleShotCheckpoint) => Promise<void>;
  },
): Promise<SingleShotPipelineResult> {
  const { openAiApiKey, openAiAuditContext, checkpoint, ...generatorOptions } = options;

  // A configured carouselWriterModel writes the script on OpenAI, so the
  // generator needs the same credential and usage context the audit uses. Both
  // are destructured out above; put them back rather than widening the rest.
  const generated = await generateSingleShotCreativeScript({
    ...generatorOptions,
    ...(openAiApiKey ? { openAiApiKey } : {}),
    ...(openAiAuditContext ? { openAiAuditContext } : {}),
    maxAttempts: GENERATION_CALL_CAP,
  });
  let usage = generated.usage;
  let callsUsed = generated.attempts;
  const brief = generated.brief;
  // The writer that produced the current best draft. Starts as the initial
  // writer, but a kept repair round updates it — see the SingleShotCheckpoint
  // doc comment above for why this must never stay fixed to the first writer.
  let provider = generated.provider;
  let model = generated.model;
  let draft: GeneratedCreativeDraft = {
    ...generated.draft,
    singleShotRun: { stage: "generated", callsUsed },
  };
  await checkpoint({ brief, draft, usage, callsUsed, provider, model });

  // Judge the draft by the lens the brief actually applied. A brief that
  // correctly fell back to explainer — because no fact established a reader
  // consequence — was still being failed for not being reader-framed.
  const judgedProfile = {
    ...generatorOptions.profile,
    framingStrategy: effectiveFramingStrategy(generatorOptions.profile.framingStrategy, brief),
  };

  // Gemini credentials are mandatory for this pipeline (they write the
  // brief), so unlike the old OpenAI critic this audit is never skipped for
  // missing optional configuration — every single-shot draft gets an
  // independent review.
  callsUsed += 1;
  const audit = await runGeminiEditorialQualityGate({
    apiKey: generatorOptions.apiKey,
    paidApiKey: generatorOptions.paidGeminiApiKey,
    model: generatorOptions.model,
    currentDraft: draft,
    format: generatorOptions.format,
    brief,
    topic: generatorOptions.topic,
    profile: judgedProfile,
    outputAspectRatio: generatorOptions.outputAspectRatio,
    characterRoster: generatorOptions.characterRoster,
    slim: false,
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
    await checkpoint({ brief, draft, usage, callsUsed, provider, model });
    return { brief, draft, usage, callsUsed, provider, model };
  }

  draft = audit.draft;
  let actionable = actionableEditorialIssues(draft);

  // Only the auditor's own verdict means accepted. buildCreativeQualityReview
  // sets "accepted" exactly when every dimension clears
  // CREATIVE_PUBLISHABLE_THRESHOLDS, so a draft that is merely free of
  // blocker-severity issues is NOT accepted: a hook at 76/85 or a resolution
  // at 55/80 is a real shortfall, and closing it is what the repair rounds
  // below are for. Treating "no blockers" as acceptance silently discarded
  // the audit.
  if (draft.qualityReview?.status === "accepted") {
    draft = { ...draft, singleShotRun: { stage: "done", callsUsed, verdict: "accepted" } };
    await checkpoint({ brief, draft, usage, callsUsed, provider, model });
    return { brief, draft, usage, callsUsed, provider, model };
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
    await checkpoint({ brief, draft, usage, callsUsed, provider, model });
    return { brief, draft, usage, callsUsed, provider, model };
  }

  // Repair by rewriting, not patching. Two live runs showed what a targeted
  // patch cannot do: re-lead a cover with the configured framing, rewrite a
  // closing so it resolves the opening, or remove a causal link the facts do
  // not state. The writer gets the reviewed script and every finding still
  // open and writes the script again against the same brief. Each round is
  // held to the same gates as before: local validation, an independent
  // verify, and improved() deciding what is kept — but now there are several
  // cheap Luna shots at it instead of one, each starting from whatever the
  // previous round actually achieved.
  let bestDraft = draft;
  let repairAttempted = false;
  let successfulRounds = 0;

  // A completed repair+verify cycle (whichever way it comes out) always
  // resolves through finalize() below — never "audited". Only a call-level
  // failure that prevented a cycle from completing at all (no budget for one,
  // the rewrite itself rejected, or the verify unreachable) short-circuits
  // with the older "audited" stage and a hardcoded "correctable" verdict, the
  // same way a single-round audit failure always has.
  const finalize = (finalDraft: GeneratedCreativeDraft): GeneratedCreativeDraft => {
    const finalActionable = actionableEditorialIssues(finalDraft);
    const finalBlockers = finalActionable.filter((issue) => issue.severity === "blocker");
    // blocked_source means the source cannot support what was asked. While the
    // brief still holds proven facts the script never spent, that claim is false:
    // the defect is allocation or wording, which a human (or a re-plan) can fix
    // without new research. Calling it blocked would send the editor hunting for
    // evidence that is already sitting in the brief.
    const spentFactIds = new Set(finalDraft.units.flatMap((unit) => unit.factIds ?? []));
    const unspentFacts = brief.keyFacts.filter((fact) => !spentFactIds.has(fact.id));
    const evidenceBlocked = unspentFacts.length === 0 && finalBlockers.some(isConcreteFactualQualityIssue);

    // Same rule as the first gate: the auditor's verdict decides, not the
    // absence of blocker-severity findings.
    if (finalDraft.qualityReview?.status === "accepted") {
      return { ...finalDraft, singleShotRun: { stage: "done", callsUsed, verdict: "accepted", repairAttempted, repairRounds: successfulRounds } };
    }
    if (evidenceBlocked) {
      // A wording correction cannot supply missing evidence: this is the
      // outcome AGENTS.md's factual-safety rules call for when that stays true
      // even after verified correction.
      return {
        ...finalDraft,
        singleShotRun: { stage: "done", callsUsed, verdict: "blocked_source", repairAttempted, repairRounds: successfulRounds },
        blockedSource: {
          reason: "Independent review still finds the request unsupported by the available evidence after verified correction.",
          missingEvidence: finalBlockers.filter(isConcreteFactualQualityIssue).map((issue) => issue.message),
        },
      };
    }
    return {
      ...finalDraft,
      singleShotRun: {
        stage: "done",
        callsUsed,
        verdict: "correctable",
        findings: finalActionable,
        repairAttempted,
        repairRounds: successfulRounds,
        stopReason: "The corrected copy is still below the publishable bar after verified repair; kept as the best available version for human review.",
      },
    };
  };
  const stopIncomplete = async (stopReason: string): Promise<SingleShotPipelineResult> => {
    draft = {
      ...bestDraft,
      singleShotRun: {
        stage: "audited",
        callsUsed,
        verdict: "correctable",
        findings: actionable,
        repairAttempted,
        repairRounds: successfulRounds,
        stopReason,
      },
    };
    await checkpoint({ brief, draft, usage, callsUsed, provider, model });
    return { brief, draft, usage, callsUsed, provider, model };
  };

  for (let attempt = 1; attempt <= MAX_SINGLE_SHOT_REPAIR_ROUNDS; attempt++) {
    if (callsUsed + 2 > SINGLE_SHOT_CALL_BUDGET) {
      return stopIncomplete("No call budget remains for another repair-and-verify round; kept as the best available version for human review.");
    }

    repairAttempted = true;
    callsUsed += 1;
    let repaired: GeneratedCreativeDraft | undefined;
    let repairedProvider = provider;
    let repairedModel = model;
    let repairRejectionReason: string | undefined;
    try {
      const revision = await generateSingleShotCreativeScript({
        ...generatorOptions,
        ...(openAiApiKey ? { openAiApiKey } : {}),
        ...(openAiAuditContext ? { openAiAuditContext } : {}),
        // The repair loop can use a different (cheaper) writer than the
        // initial script — see CREATIVE_SINGLE_SHOT_REPAIR_MODEL. Falls back
        // to the same writer that wrote the script when unset.
        carouselWriterModel: generatorOptions.repairWriterModel ?? generatorOptions.carouselWriterModel,
        existingBrief: brief,
        maxAttempts: 1,
        revision: {
          previousDraft: bestDraft,
          findings: actionable,
          ...(bestDraft.qualityReview?.scores ? { scores: bestDraft.qualityReview.scores } : {}),
          thresholds: CREATIVE_PUBLISHABLE_THRESHOLDS,
        },
      });
      usage = sumCreativeAiUsage(usage, revision.usage);
      const candidate = revision.draft;
      const inspect = (value: GeneratedCreativeDraft) =>
        deterministicCreativeQualityIssues(
          value,
          generatorOptions.format,
          brief.keyFacts,
          judgedProfile.language,
          judgedProfile.conversionGoal,
          judgedProfile.framingStrategy,
          judgedProfile.storyStructure,
        )
          .filter((issue) => issue.severity === "blocker")
          .map((issue) => `${issue.code}:${issue.unitOrder ?? 0}`);
      const before = new Set(inspect(bestDraft));
      const introduced = inspect(candidate).filter((key) => !before.has(key));
      if (introduced.length) {
        repairRejectionReason = `Correction introduces validation blockers: ${introduced.join(", ")}`;
      } else {
        repaired = candidate;
        repairedProvider = revision.provider;
        repairedModel = revision.model;
      }
    } catch (error) {
      repairRejectionReason = error instanceof Error ? error.message : "Correction failed local validation";
    }

    if (!repaired) {
      return stopIncomplete(repairRejectionReason ?? "The repair made no usable change.");
    }

    await checkpoint({
      brief,
      draft: { ...repaired, singleShotRun: { stage: "repairing", callsUsed, repairAttempted: true } },
      usage,
      callsUsed,
      provider: repairedProvider,
      model: repairedModel,
    });

    callsUsed += 1;
    const verify = await runGeminiEditorialQualityGate({
      apiKey: generatorOptions.apiKey,
      paidApiKey: generatorOptions.paidGeminiApiKey,
      model: generatorOptions.model,
      currentDraft: repaired,
      format: generatorOptions.format,
      brief,
      topic: generatorOptions.topic,
      profile: judgedProfile,
      outputAspectRatio: generatorOptions.outputAspectRatio,
      characterRoster: generatorOptions.characterRoster,
      slim: true,
    });
    usage = sumCreativeAiUsage(usage, verify.usage);

    if (verify.criticUnavailable) {
      // Never promote an unverified correction: keep the last independently
      // verified draft as current.
      return stopIncomplete(`Verification unavailable: ${verify.criticUnavailable.reason}. The correction was not promoted.`);
    }

    const verified = verify.draft;
    if (!improved(bestDraft, verified)) {
      // A completed, independently verified cycle — just not a better one.
      // Classify the last kept draft rather than discarding it as incomplete.
      draft = finalize(bestDraft);
      await checkpoint({ brief, draft, usage, callsUsed, provider, model });
      return { brief, draft, usage, callsUsed, provider, model };
    }

    bestDraft = verified;
    actionable = actionableEditorialIssues(verified);
    provider = repairedProvider;
    model = repairedModel;
    successfulRounds += 1;

    if (verified.qualityReview?.status === "accepted" || attempt === MAX_SINGLE_SHOT_REPAIR_ROUNDS) {
      draft = finalize(bestDraft);
      await checkpoint({ brief, draft, usage, callsUsed, provider, model });
      return { brief, draft, usage, callsUsed, provider, model };
    }
  }

  throw new Error("unreachable: the repair loop always returns before exhausting its iterations");
}
