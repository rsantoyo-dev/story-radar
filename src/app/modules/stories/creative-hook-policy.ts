import type { CreativeQualityIssue, GeneratedCreativeDraft } from "./creative-content.types";

export const COVER_HOOK_TARGET = "4–7";
export const COVER_HOOK_MAX_WORDS = 9;
export const COVER_CONTEXT_MAX_WORDS = 24;
export const HOOK_CHECKS = ["clear", "tension", "consequence", "human", "curiosity"] as const;
export const HOOK_CHECK_LABELS: Record<typeof HOOK_CHECKS[number], string> = {
  clear: "Understood at a glance", tension: "Supported tension or surprise",
  consequence: "Concrete relevance or consequence", human: "Natural, nontechnical language",
  curiosity: "A specific reason to continue",
};
export type CreativeHookCandidate = {
  headline: string;
  subheadline: string;
  factIds: string[];
  readerQuestion: string;
  payoffUnitOrder: number;
  supported: boolean;
  checks: Record<typeof HOOK_CHECKS[number], boolean>;
  reason: string;
};
export type CreativeHookSelection = {
  candidates: CreativeHookCandidate[];
  selectedIndex: number;
};

export const HOOK_EDITORIAL_POLICY = `Hook selection contract:
- Judge headline + one short context line as one opening. Aim for ${COVER_HOOK_TARGET} headline words, normally at most ${COVER_HOOK_MAX_WORDS}, and no more than ${COVER_CONTEXT_MAX_WORDS} words of cover context. These are editorial targets for space-delimited languages, not reasons to truncate names or remove qualifiers. Clarity and source fidelity outrank length.
- Prefer a concrete supported capability, useful distinction, recognizable stake or surprising contrast over an announcement recap. Name the action: "fill forms" is more informative than "click". A company name may be essential attribution; do not delete it merely to sound more personal.
- Never strengthen copy by adding autonomy ("on its own"), intention ("wants"), near-term availability ("soon"), booking, danger, causality, or personal impact absent from the selected evidence. A question mark or "may" does not make an unsupported premise acceptable.
- Compare three concise, distinct angles within the cover's allowed facts: a concrete capability/usefulness, a supported contrast/surprise, and a recognizable question/stake when available. If evidence is narrow, compare phrasing of its real finding instead of manufacturing three different claims. Preserve the configured framing strategy.
- Evaluate five checks explicitly: clear (understood at a glance, not a measured reading-time claim); tension (source-backed contrast or surprise); consequence (concrete relevance/usefulness, not a fabricated effect on the reader); human (natural language without unexplained jargon); curiosity (a specific question the carousel can answer).
- Source fidelity and clear=true are mandatory. The chosen opening needs at least four true checks and a concrete payoff in the subsequent slides (or the same frame/caption for a meme). Tension is not mandatory for a useful straightforward story. Do not force fear, frustration or second-person consequences.
- Select by the strongest supported reason to continue and the payoff actually delivered, not a self-awarded 100. Keep attribution and essential scope in the opening. The next slides explain the mechanism, limit or contrast instead of simply repeating the headline. Scores are editorial judgments, never engagement guarantees.`;

const stringSchema = (maxLength: number) => ({ type: "string", maxLength });
export const hookSelectionSchema = {
  type: "object", additionalProperties: false, required: ["candidates", "selectedIndex"],
  properties: {
    selectedIndex: { type: "integer", minimum: 0, maximum: 2 },
    candidates: { type: "array", minItems: 3, maxItems: 3, items: {
      type: "object", additionalProperties: false,
      required: ["headline", "subheadline", "factIds", "readerQuestion", "payoffUnitOrder", "supported", "checks", "reason"],
      properties: {
        headline: stringSchema(240), subheadline: stringSchema(240),
        factIds: { type: "array", minItems: 1, maxItems: 6, items: stringSchema(80) },
        readerQuestion: stringSchema(200), payoffUnitOrder: { type: "integer", minimum: 1, maximum: 8 },
        supported: { type: "boolean" },
        checks: { type: "object", additionalProperties: false, required: [...HOOK_CHECKS],
          properties: Object.fromEntries(HOOK_CHECKS.map(key => [key, { type: "boolean" }])) },
        reason: stringSchema(240),
      },
    } },
  },
};

export class HookSelectionValidationError extends Error {}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function text(value: unknown, max: number, empty = false): string {
  if (typeof value !== "string" || value.length > max || (!empty && !value.trim())) throw new HookSelectionValidationError("Invalid hook selection text");
  return value.trim();
}
const copy = (value?: string) => (value || "").trim().replace(/\s+/gu, " ");
export function hookSelectionMatches(selection: CreativeHookSelection, draft: Pick<GeneratedCreativeDraft, "units">): boolean {
  const chosen = selection.candidates[selection.selectedIndex], cover = draft.units[0];
  return !!chosen && !!cover && copy(chosen.headline) === copy(cover.headline) && copy(chosen.subheadline) === copy(cover.subheadline)
    && chosen.factIds.every(id => cover.factIds.includes(id)) && chosen.factIds.length === new Set(cover.factIds).size;
}
/** Checks structure, planned evidence IDs and exact selected copy; semantics remain subject to factual validators and final review. */
export function parseHookSelection(value: unknown, draft: Pick<GeneratedCreativeDraft, "units">, allowedFactIds: readonly string[]): CreativeHookSelection {
  if (!object(value) || !Array.isArray(value.candidates) || value.candidates.length !== 3 || !Number.isInteger(value.selectedIndex) || Number(value.selectedIndex) < 0 || Number(value.selectedIndex) > 2) throw new HookSelectionValidationError("The editorial response needs three hook candidates and a valid selection");
  const candidates = value.candidates.map((item): CreativeHookCandidate => {
    if (!object(item) || !object(item.checks) || HOOK_CHECKS.some(key => typeof (item.checks as Record<string, unknown>)[key] !== "boolean") || typeof item.supported !== "boolean") throw new HookSelectionValidationError("Invalid hook checklist");
    if (!Array.isArray(item.factIds) || item.factIds.length < 1 || item.factIds.length > 6 || item.factIds.some(id => typeof id !== "string" || !allowedFactIds.includes(id)) || new Set(item.factIds).size !== item.factIds.length) throw new HookSelectionValidationError("Hook candidates must use the cover's planned fact IDs");
    if (!Number.isInteger(item.payoffUnitOrder) || Number(item.payoffUnitOrder) < (draft.units.length > 1 ? 2 : 1) || Number(item.payoffUnitOrder) > draft.units.length) throw new HookSelectionValidationError("Hook payoff must identify a subsequent slide, or the single meme");
    return { headline: text(item.headline, 240), subheadline: text(item.subheadline, 240, true), factIds: item.factIds as string[],
      readerQuestion: text(item.readerQuestion, 200), payoffUnitOrder: Number(item.payoffUnitOrder), supported: item.supported,
      checks: Object.fromEntries(HOOK_CHECKS.map(key => [key, (item.checks as Record<string, boolean>)[key]])) as CreativeHookCandidate["checks"], reason: text(item.reason, 240) };
  });
  if (new Set(candidates.map(c => copy(c.headline) + "\n" + copy(c.subheadline))).size !== 3) throw new HookSelectionValidationError("Hook alternatives must be distinct");
  const selection = { candidates, selectedIndex: Number(value.selectedIndex) };
  if (!hookSelectionMatches(selection, draft)) throw new HookSelectionValidationError("The chosen hook and its fact IDs must match the returned opening exactly");
  return selection;
}
export function hookSelectionIssues(selection: CreativeHookSelection): CreativeQualityIssue[] {
  const chosen = selection.candidates[selection.selectedIndex], issues: CreativeQualityIssue[] = [];
  if (!chosen.supported) issues.push({ code: "UNSUPPORTED", severity: "blocker", unitOrder: 1, message: "The selected hook is not supported by its cited evidence. Narrow the opening; do not add evidence or certainty." });
  if (!chosen.checks.clear) issues.push({ code: "WEAK_HOOK", severity: "warning", unitOrder: 1, message: "The selected opening is not immediately clear. Name its subject and concrete action in plain language." });
  const failed = HOOK_CHECKS.filter(key => !chosen.checks[key]);
  if (failed.length > 1) issues.push({ code: "LOW_HUMAN_CURIOSITY", severity: "warning", unitOrder: 1, message: `The hook meets ${5 - failed.length}/5 checks; at least 4 are required. Improve: ${failed.map(key => HOOK_CHECK_LABELS[key]).join(", ")}. Preserve its evidence and deliver the promised answer.` });
  return issues;
}
