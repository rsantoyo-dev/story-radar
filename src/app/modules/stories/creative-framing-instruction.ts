import type { CreativeFramingStrategy } from "./creative-content.types";

/**
 * The writer's version of the framing rules. The brief call has always had an
 * explicit framing instruction; the script call only had the strategy as one
 * field among many and the rules buried in a long system prompt, and a live
 * reader-consequence cover led with the closure's duration instead of the
 * reader's trip. This states, for the script specifically, what the cover
 * must open with and what the closing must resolve.
 */
export function creativeScriptFramingInstruction(
  framingStrategy: CreativeFramingStrategy,
): string {
  switch (framingStrategy) {
    case "reader-consequence":
      return `FRAMING FOR THE SCRIPT: reader-consequence
The cover headline must open with the concrete change a keyFact establishes for the reader — what changes in what they pay, owe, do, drive, or decide — before any duration, figure, organization, or place name; a closure's length or a detour belongs after the stake, not in front of it. Carry every hedge from the facts and never add a causal or explanatory link that the cited excerpts do not state, even between facts from the same document. The closing slide must say what this means for the reader's next decision or action; it must not enumerate figures, and may carry at most one line of secondary figures.`;
    case "explainer":
      return `FRAMING FOR THE SCRIPT: explainer
Lead the cover with the mechanism or the clearest account of the development; do not force second person or a reader consequence. The closing resolves the mechanism or the practical implication the facts established.`;
    case "authority":
      return `FRAMING FOR THE SCRIPT: authority
Lead the cover with the supported organization, decision, or expert; do not force second person. The closing resolves the decision or the accountable next step the facts support.`;
    case "auto":
    default:
      return `FRAMING FOR THE SCRIPT: auto
Follow the lens the brief applied and the hook it chose. Prefer a concrete reader consequence on the cover when a fact establishes one; never manufacture one.`;
  }
}

export function creativeBriefFramingInstruction(
  framingStrategy: CreativeFramingStrategy,
): string {
  switch (framingStrategy) {
    case "reader-consequence":
      return `FRAMING STRATEGY: reader-consequence
Use the audience decision, action, or consequence lens whenever a keyFact — as written in its sourceExcerpt — establishes an effect on something the configured audience pays, owes, buys, uses, or decides. State that reader-relevant change before naming any organization or product. The cover headline must not open with an organization name or a bare policy-status statement such as "kept the rate", "held rates", "announced", or "maintained"; it must open with a concrete stake the reader recognizes, such as what a bill, payment, rate, or decision looks like for them. Do not use a vague statement that the topic "affects your money". State the outcome rather than asking whether it happened, and do not defer the central fact to a later slide. Preserve every required hedge and never add a causal or trend claim absent from the sourceExcerpt. If the only supported consequence is too hedged or minor to lead the cover, use an explainer lens for this brief and record that fallback in riskFlags; never inflate a fact or fail to produce a brief. Do not extract secondary official figures (a bank rate, a deposit rate, an edition count, an index sub-series) as keyFacts unless the source ties that figure to something the audience pays, owes, or decides; the reader came for one thing, so every keyFact must earn its place against that. The closing slide must resolve what the decision means for the reader, not enumerate secondary official figures. For a hold, pause, or no-change, contrast what is settled for the reader with what still moves; never lead with the unchanged official figure.`;
    case "explainer":
      return `FRAMING STRATEGY: explainer
Lead with the mechanism, process, or clearest account of how the development works. A neutral, non-personal, institution- or product-led cover is allowed when it makes the explanation clearer. Do not force a reader consequence, second-person language, or riskFlags note when the source does not establish one. The closing slide should resolve the mechanism or practical implication established by the facts.`;
    case "authority":
      return `FRAMING STRATEGY: authority
Lead with the supported organization, expert, institution, official decision, or credibility signal. An institution-, announcement-, or product-centered cover is allowed when supported by the facts. Do not force a reader consequence or second-person language. The closing slide should resolve the supported decision, institutional implication, or accountable next step.`;
    case "auto":
    default:
      return `FRAMING STRATEGY: auto
Choose the strongest supported lens using the four-lens assessment. Prefer a concrete reader consequence when the source establishes one, but use an explainer or authority lens when that is clearer or better supported. Never manufacture a personal consequence merely to use second-person language.`;
  }
}
