import type { CreativeFramingStrategy } from "./creative-content.types";

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
