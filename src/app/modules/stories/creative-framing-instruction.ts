import type { CreativeFramingStrategy, CreativeStoryStructure } from "./creative-content.types";

/**
 * The brief-side rules for an enumerated list. Returned with its own leading
 * blank line so callers can append it directly; empty for every other
 * structure, since "hook-steps" is already described in the shared brief
 * instruction and "auto" needs nothing.
 */
export function creativeBriefStructureInstruction(
  storyStructure: CreativeStoryStructure | undefined,
): string {
  if (storyStructure !== "hook-list") return "";
  return `\n\nSTORY STRUCTURE: hook-list
This story is an enumerated list ("N things to do", "N tips", "N changes"), not a narrative arc; keep the carousel format. Extract one keyFact per enumerated item, stating what it is together with the date, time, place, price, registration or condition a reader needs to act on it, exactly as the source states them; add a second fact for an item only when the source states a separate condition for it, such as a road closure or a full registration. Extract one keyFact whose sourceExcerpt establishes how many items the source enumerates, so the cover's count is supported. Plan the carousel as: a hook slide whose viewerQuestion asks what the list offers and whose allowedFactIds include the count fact; then one slide per item in source order — explain, or opportunity when the item is something the reader can do — each citing only that item's facts; then a conclude slide that reuses two or more items' facts to help the reader choose, plan, save or share. Do not merge two items into one slide, do not drop an item to fit a preferred arc, and never promise more items than the facts enumerate. With at most 8 slides (hook, up to 6 items, conclude), keep the source's first items in order and name in riskFlags any item left out. The framing strategy shapes wording only; it never turns the list into a consequence story. If the source does not enumerate distinct items, plan an ordinary carousel and say so in riskFlags.`;
}

/**
 * The script-side rules for a structured carousel, in the writer's terms.
 * "hook-steps" is stated only when the brief confirmed a source-backed
 * procedure: forcing steps onto a carousel the brief already downgraded would
 * invent them. Returned with a leading blank line; empty when not applicable.
 */
export function creativeScriptStructureInstruction(
  storyStructure: CreativeStoryStructure | undefined,
  procedureSupported = false,
): string {
  switch (storyStructure) {
    case "hook-list":
      return `\n\nSTRUCTURE FOR THE SCRIPT: hook-list
The cover is the count-and-subject promise the plan's hook fact supports (for example "5 choses à faire à Saint-Jean ce week-end"), with the date range or scope as subheadline when a fact states it; the number of concrete items is the reason to continue, so do not replace it with a consequence, a run-on summary of the items, or a question that hides the list. Its continuationCue may name the first item. Each middle slide is one item: its name as the headline, then the practical details its facts state — when, where, cost, registration, conditions — in the body; do not narrate a story across items and do not add a consequence a fact does not state. The closing helps the reader act on the list — choose, plan, save or share — carrying the configured conversion goal as its single action; it is not a synthesis and not a recap label. If the plan's hook slide cites no count fact, the brief found no enumerated list: write an ordinary carousel.`;
    case "hook-steps":
      return procedureSupported
        ? `\n\nSTRUCTURE FOR THE SCRIPT: hook-steps
Use the approved carouselPlan as an ordered procedure. Cover: supported result hook and swipe invitation. Middle: necessary materials/prerequisites and actionable steps in source order, with quantities and conditions preserved. Closing: result payoff and the configured CTA. Group adjacent steps if needed, but do not omit prerequisites, invent steps, or replace the procedure with topical commentary. The same rules apply to recipes, assembly and tutorials.`
        : "";
    default:
      return "";
  }
}

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
