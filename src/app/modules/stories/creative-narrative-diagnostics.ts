import type { GeneratedCreativeDraft, CreativeQualityIssue } from "./creative-content.types";
const structuralCodes = new Set(["BURIED_HOOK", "HOOK_RESOLUTION_GAP", "SEMANTIC_REPETITION", "WEAK_RESOLUTION", "WEAK_SWIPE_REWARD", "VIEWER_QUESTION_MISMATCH", "UNSUPPORTED_SYNTHESIS_AND_UNANSWERED_CONCLUSION", "PLAN_REPETITIVE_CLOSING", "PLAN_REPEATED_SUPPORT"]);
export function structuralNarrativeIssues(draft: GeneratedCreativeDraft): CreativeQualityIssue[] {
    return (draft.qualityReview?.issues ?? []).filter(i => structuralCodes.has(i.code));
}
const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** Exact redundancy is deterministic; semantic usefulness still needs an evidence-based critic. */
export function narrativeRepetitionIssues(draft: GeneratedCreativeDraft): CreativeQualityIssue[] {
    if (draft.units.length < 3)
        return [];
    const issues: CreativeQualityIssue[] = [];
    for (const unit of draft.units) {
        const headline = normalize(unit.headline);
        if (headline.length >= 25 && [unit.body, unit.subheadline].some(text => text && normalize(text) === headline))
            issues.push({ code: "PLAN_REPEATED_SUPPORT", severity: "warning", unitOrder: unit.order, message: "The supporting copy repeats the headline verbatim instead of adding context." });
    }
    const last = draft.units.at(-1)!;
    const body = normalize(last.body ?? last.subheadline ?? "");
    if (body.length >= 40 && draft.units.slice(0, -1).some(unit => normalize(unit.body ?? unit.subheadline ?? "") === body))
        issues.push({ code: "PLAN_REPETITIVE_CLOSING", severity: "warning", unitOrder: last.order, message: "The closing repeats earlier supporting copy verbatim instead of resolving the opening promise." });
    return issues;
}
