import { structuralNarrativeIssues } from "./creative-narrative-diagnostics";
import type { CreativeAiUsage, GeneratedCreativeDraft, CreativeQualityIssue } from "./creative-content.types";
import { CREATIVE_QUALITY_THRESHOLDS } from "./creative-quality";
export type EditorialRepairProgress = {
    narrativeReplanAttempted?: boolean;
    terraAttempts: number;
    solAttempts: number;
    pendingVerification: boolean;
    terraStopped?: boolean;
    solStopped?: boolean;
    lastTier?: "terra" | "sol";
    verifiedFallback?: Omit<GeneratedCreativeDraft, "editorialRepair">;
    stopReason?: string;
    lastPatchRejection?: { tier: "terra" | "sol"; reason: string; kind?: "plan" | "copy" };
};
const emptyUsage = (): CreativeAiUsage => ({ promptTokens: 0, outputTokens: 0, thoughtsTokens: 0, totalTokens: 0 });
const operational = /^(?:CRITIC_|EDITORIAL_REVIEW_|EDITORIAL_TIME_BUDGET|EDITORIAL_REPAIR_|FINAL_(?:COPY_REVIEW_REQUIRED|REVIEW_UNAVAILABLE))/u;
export function actionableEditorialIssues(draft: GeneratedCreativeDraft): CreativeQualityIssue[] {
    return (draft.qualityReview?.issues ?? []).filter(issue => !operational.test(issue.code));
}
function deficit(draft: GeneratedCreativeDraft): number {
    const scores = draft.qualityReview?.scores;
    if (!scores)
        return Infinity;
    return Object.entries(CREATIVE_QUALITY_THRESHOLDS).reduce((sum, [key, minimum]) => sum + Math.max(0, minimum - scores[key as keyof typeof scores]), 0);
}
function improved(before: GeneratedCreativeDraft, after: GeneratedCreativeDraft): boolean {
    const issues = (draft: GeneratedCreativeDraft) => actionableEditorialIssues(draft);
    const blockers = (draft: GeneratedCreativeDraft) => issues(draft).filter(issue => issue.severity === 'blocker').length;
    if (blockers(after) > blockers(before))
        return false;
    if (blockers(after) < blockers(before))
        return true;
    const oldKeys = new Set(issues(before).map(issue => `${issue.code}:${issue.unitOrder ?? 0}`));
    return deficit(after) < deficit(before) || issues(after).length < oldKeys.size && issues(after).every(issue => oldKeys.has(`${issue.code}:${issue.unitOrder ?? 0}`));
}
/** Explain an exhausted/early-stopped loop without claiming four calls were made. */
export function describeEditorialRepairStop(draft: Pick<GeneratedCreativeDraft, "qualityReview" | "editorialRepair">): string {
    const progress = draft.editorialRepair;
    const defects = (draft.qualityReview?.issues ?? []).filter(issue => issue.severity === "blocker" && !operational.test(issue.code)).slice(0, 3);
    const deficits = Object.entries(CREATIVE_QUALITY_THRESHOLDS).flatMap(([key, minimum]) => {
        const score = draft.qualityReview?.scores[key as keyof typeof CREATIVE_QUALITY_THRESHOLDS];
        return typeof score === "number" && score < minimum ? [`${key} ${score}/${minimum}`] : [];
    });
    return `Editorial repair stopped: Terra ${progress?.terraAttempts ?? 0}/2 attempts; Sol ${progress?.solAttempts ?? 0}/2 attempts. ` +
        (progress?.lastPatchRejection ? `Last rejected correction (${progress.lastPatchRejection.tier}): ${progress.lastPatchRejection.reason}. ` : "") +
        (deficits.length ? `Below target: ${deficits.join(", ")}. ` : "") +
        (defects.length ? `Unresolved findings: ${defects.map(issue => `${issue.unitOrder ? `slide ${issue.unitOrder}: ` : ""}${issue.message}`).join("; ")}` : "See the remaining reviewer findings. A tier may stop early when it makes no change or no verified improvement.");
}

/** Caps survive saved-draft recovery. Reserve an attempt durably before calling a provider. */
export async function runEditorialRepairLoop(input: {
    draft: GeneratedCreativeDraft;
    canContinue: () => boolean;
    canVerify?: () => boolean;
    checkpoint: (draft: GeneratedCreativeDraft, usage: CreativeAiUsage) => Promise<void>;
    replan?: (draft: GeneratedCreativeDraft, issues: CreativeQualityIssue[], tier: "terra" | "sol") => Promise<{draft:GeneratedCreativeDraft;usage:CreativeAiUsage;rejectionReason?:string}>;
    patch: (draft: GeneratedCreativeDraft, tier: "terra" | "sol", issues: CreativeQualityIssue[]) => Promise<{
        draft: GeneratedCreativeDraft;
        usage: CreativeAiUsage;
        rejectionReason?: string;
    }>;
    verify: (draft: GeneratedCreativeDraft) => Promise<{
        draft: GeneratedCreativeDraft;
        usage: CreativeAiUsage;
        unavailable?: boolean;
    }>;
}): Promise<{
    draft: GeneratedCreativeDraft;
    usage: CreativeAiUsage;
}> {
    let draft = input.draft;
    const progress: EditorialRepairProgress = { terraAttempts: 0, solAttempts: 0, pendingVerification: false, ...draft.editorialRepair };
    // Compatibility: the old adapter silently classified invalid patches as no-ops.
    // Permit only its unused allowance, never reset attempts or spending.
    if (progress.stopReason === "The editorial target remains unmet after the bounded Terra/Sol repair attempts.") {
        if (progress.terraAttempts < 2) progress.terraStopped = false;
        if (progress.solAttempts < 2) progress.solStopped = false;
    }
    delete progress.stopReason;
    let usage = emptyUsage();
    const add = (next: CreativeAiUsage) => { usage = { promptTokens: usage.promptTokens + next.promptTokens, outputTokens: usage.outputTokens + next.outputTokens, thoughtsTokens: usage.thoughtsTokens + next.thoughtsTokens, totalTokens: usage.totalTokens + next.totalTokens }; };
    const save = async () => { draft = { ...draft, editorialRepair: { ...progress } }; await input.checkpoint(draft, usage); };
    const stop = async (reason: string) => {
        progress.stopReason = reason;
        if (draft.qualityReview)
            draft = { ...draft, qualityReview: { ...draft.qualityReview, status: draft.qualityReview.status === 'rejected' ? 'rejected' : 'needs-review', issues: [...draft.qualityReview.issues.filter(i => i.code !== 'EDITORIAL_REPAIR_STOPPED'), { code: 'EDITORIAL_REPAIR_STOPPED', severity: 'blocker', message: reason }] } };
        await save();
        return { draft, usage };
    };
    while (true) {
        if (progress.pendingVerification) {
            if (!(input.canVerify ?? input.canContinue)())
                return stop('The saved correction still needs independent verification; time or budget must be available to resume.');
            let verified: Awaited<ReturnType<typeof input.verify>>;
            try {
                verified = await input.verify(draft);
            }
            catch (error) {
                return stop(error instanceof Error ? error.message : 'Independent verification failed.');
            }
            add(verified.usage);
            if (verified.unavailable)
                return stop('Independent verification is unavailable. The correction is saved and cannot be approved.');
            const before = progress.verifiedFallback;
            if (!before || verified.draft.qualityReview?.status === 'accepted' || improved(before, verified.draft))
                draft = verified.draft;
            else {
                progress.lastPatchRejection = {
                    tier: progress.lastTier ?? "terra", kind: "copy",
                    reason: "The correction was rolled back because independent review found no improvement. " + actionableEditorialIssues(verified.draft).map(issue => `${issue.unitOrder ? `slide ${issue.unitOrder}: ` : ""}${issue.message}`).join("; "),
                };
                draft = before;
                if (progress.lastTier === 'terra')
                    progress.terraStopped = true;
                else
                    progress.solStopped = true;
            }
            delete progress.verifiedFallback;
            progress.pendingVerification = false;
            await save();
        }
        if (draft.qualityReview?.status === 'accepted')
            return { draft: { ...draft, editorialRepair: { ...progress } }, usage };
        const issues = actionableEditorialIssues(draft);
        if (!draft.qualityReview || !issues.length)
            return stop('No actionable independent findings are available; another rewrite would not fix a reviewer outage.');
        if ((progress.terraAttempts >= 2 || progress.terraStopped) && (progress.solAttempts >= 2 || progress.solStopped))
            return stop(describeEditorialRepairStop({...draft,editorialRepair:progress}));
        if (!input.canContinue())
            return stop('The editorial time limit was reached. Saved copy and attempt counts are retained.');
        const tier = progress.terraAttempts < 2 && !progress.terraStopped ? 'terra' : 'sol';
        const before = draft;
        progress.lastTier = tier;
        if (tier === 'terra')
            progress.terraAttempts++;
        else
            progress.solAttempts++;
        // Invalid structural proposals need another structural correction, not
        // a text-only patch that cannot change the plan causing the failure.
        const replan=Boolean(input.replan && (!progress.narrativeReplanAttempted || progress.lastPatchRejection?.kind === "plan") && structuralNarrativeIssues(draft).length);
        if(replan)progress.narrativeReplanAttempted=true;
        await save(); // Persist the replan allowance before a paid request too.
        let patched: Awaited<ReturnType<typeof input.patch>>;
        try {
            patched = replan ? await input.replan!(draft,issues,tier) : await input.patch(draft, tier, issues);
        }
        catch (error) {
            return stop(error instanceof Error ? error.message : 'Targeted correction failed.');
        }
        add(patched.usage);
        if (patched.rejectionReason) {
            progress.lastPatchRejection = {tier, reason: patched.rejectionReason, kind: replan ? "plan" : "copy"};
            await save();
            continue; // Give the same tier its remaining attempt, with validator feedback.
        }
        delete progress.lastPatchRejection;
        const copy = (value: GeneratedCreativeDraft) => JSON.stringify({ ...value, qualityReview: undefined, editorialRepair: undefined });
        if (copy(patched.draft) === copy(draft)) {
            if (tier === 'terra')
                progress.terraStopped = true;
            else
                progress.solStopped = true;
            await save();
            continue;
        }
        draft = { ...patched.draft, qualityReview: patched.draft.qualityReview ? { ...patched.draft.qualityReview, status: 'needs-review', issues: [...patched.draft.qualityReview.issues, { code: 'FINAL_COPY_REVIEW_REQUIRED', severity: 'blocker', message: 'The corrected copy requires independent verification.' }] } : undefined };
        const { editorialRepair: _progress, ...verifiedFallback } = before;
        void _progress;
        progress.verifiedFallback = verifiedFallback;
        progress.pendingVerification = true;
        await save();
    }
}
