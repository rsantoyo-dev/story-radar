import { createHash } from "node:crypto";
import { validateCarouselPlan, type CarouselPlan } from "./carousel-narrative";
import type { GeneratedCreativeBrief, GeneratedCreativeDraft } from "./creative-content.types";
export type NarrativePlanReview = {
    version: 1;
    decision: "keep" | "revise";
    reason: string;
    model: string;
    evidenceKey: string;
    /** Corrective calls already consumed before script writing. Legacy reviews
     * without this field retain their original one-slot accounting. */
    repairAttempts?: { terra: number; sol: number };
    rejectedAttempts?: { model: string; reason: string }[];
    original: {
        angle: string;
        hook: string;
        plan: CarouselPlan;
    };
};
export type NarrativeRevision = {
    version: 1;
    reason: string;
    model: string;
    evidenceKey: string;
    originalPlan: CarouselPlan;
    plan: CarouselPlan;
    angle: string;
    hook: string;
    previousDraft: Omit<GeneratedCreativeDraft, "narrativeRevision" | "editorialRepair">;
};
/**
 * Identity of the SOURCE evidence a narrative revision was planned against.
 * Editor facts are additive human evidence: adding or retracting one must not
 * invalidate a saved revision, so they are excluded here.
 */
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value;
const sourceFacts = (brief: Pick<GeneratedCreativeBrief, "keyFacts">) => brief.keyFacts.filter(fact => fact.provenance !== "editor");
/**
 * Each fact's claim guard is left out: it is re-derived on every read
 * (withCreativeFactClaimGuard), so a better guard rule would otherwise make
 * every saved revision built on that fact look like different evidence.
 */
export function narrativeEvidenceKey(brief: Pick<GeneratedCreativeBrief, "keyFacts">): string {
    return createHash("sha256").update(JSON.stringify(canonical(sourceFacts(brief).map(fact => ({ ...fact, claimGuard: undefined }))))).digest("hex");
}
/** Keys saved before 9 October 2026 also hashed each fact's claim guard. */
export function legacyNarrativeEvidenceKey(brief: Pick<GeneratedCreativeBrief, "keyFacts">): string {
    return createHash("sha256").update(JSON.stringify(canonical(sourceFacts(brief)))).digest("hex");
}
/** The revision's evidence is this brief's: today's key, or a legacy key over the facts as read or as stored. */
export function narrativeEvidenceMatches(evidenceKey: string, brief: Pick<GeneratedCreativeBrief, "keyFacts" | "storedEvidenceKey">): boolean {
    return evidenceKey === narrativeEvidenceKey(brief) || evidenceKey === legacyNarrativeEvidenceKey(brief) || evidenceKey === brief.storedEvidenceKey;
}
/**
 * Editor facts are vouched for by a human and may support any slide, so every
 * planned slide allows them. Without this the plan scope would strip copy
 * that relies on them and the final validation would reject the citation.
 */
export function allowEditorFactsInPlan<T extends Pick<GeneratedCreativeBrief, "keyFacts" | "carouselPlan">>(brief: T): T {
    const editorIds = brief.keyFacts.filter(fact => fact.provenance === "editor").map(fact => fact.id);
    if (!editorIds.length || !brief.carouselPlan) return brief;
    return { ...brief, carouselPlan: { ...brief.carouselPlan, slides: brief.carouselPlan.slides.map(slide => ({
        ...slide, allowedFactIds: [...slide.allowedFactIds, ...editorIds.filter(id => !slide.allowedFactIds.includes(id))],
    })) } };
}
/** Resolve one evidence-bound plan for review, edits and generation; never mutate the original brief. */
export function resolveNarrativeBrief<T extends GeneratedCreativeBrief>(brief: T, draft?: GeneratedCreativeDraft): T {
    const revision = draft?.narrativeRevision;
    if (!revision)
        return allowEditorFactsInPlan(brief);
    if (!narrativeEvidenceMatches(revision.evidenceKey, brief))
        throw new Error("The narrative revision belongs to different evidence; refresh the draft before continuing.");
    const errors = validateCarouselPlan(revision.plan, new Set(brief.keyFacts.map(f => f.id)));
    if (errors.length)
        throw new Error(errors[0]);
    return allowEditorFactsInPlan({ ...brief, angle: revision.angle, hook: revision.hook, carouselPlan: revision.plan });
}
