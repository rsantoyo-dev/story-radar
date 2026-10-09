import type { CreativeFramingStrategy, CreativeStoryStructure } from "./creative-content.types";

import { MAX_CAROUSEL_LIST_ITEMS, MAX_CAROUSEL_SLIDES } from "./carousel-narrative";

/**
 * A list slide is read in a few seconds: a short headline, one sentence, and
 * the practical line (day · time · ages · price), which is not counted in the
 * sentence because a reader cannot act on an item without it.
 */
export const LIST_ITEM_HEADLINE_MAX_WORDS = 8;
export const LIST_ITEM_SENTENCE_MAX_WORDS = 12;
/** The closing's takeaway, before the call to action, when it is not the plan for the period. */
export const LIST_CLOSING_MAX_WORDS = 18;
export const LIST_CLOSING_CTA_MAX_WORDS = 8;

/** The list rules both a "hook-list" profile and an "auto" profile that finds a list follow. */
const LIST_BRIEF_RULES = `Extract one keyFact per enumerated item stating what it is, with how it happens when the source says so (standing or seated, indoors or outdoors, who it is for, such as children aged 4 to 7). When the source gives the item's practical details (day, date, time or opening hours, price or free admission, ages, address, registration) in a separate passage, such as a labelled block ("Date : … Heure : … Coût : …"), extract that whole passage, copied exactly, as a second keyFact and cite both facts on the item's slide: a reader cannot act on an item without them. That fact's statement says only what the passage says; never add the item's name to it, because its excerpt does not carry it and the item's first fact does. Add a further fact for an item only when the source states a separate condition for it, such as a road closure or a full registration. Extract a condition the source gives for the whole period, such as a weather forecast, as one fact that keeps its qualifiers (a forecast stays a forecast, with the date it was consulted), and cite it on the slide of the outdoor item it matters most for. Never extract a fact that only says a detail is missing ("price not stated", "admission unspecified"). Extract one keyFact whose sourceExcerpt establishes how many items the source enumerates, so the cover's count is supported. Plan the carousel as: a hook slide whose viewerQuestion asks what the list offers and whose allowedFactIds include the count fact, plus the facts of the items that give the list a draw when the source states one — first the items that are free, then those that are new or opening, then those ending this weekend; a famous name or a big event alone is not a draw — so the cover can promise it: reuse those items' own facts, never a separate fact that groups several items, and keep each item slide on its own facts; then one slide per item in source order — explain, or opportunity when the item is something the reader can do — each citing only that item's facts; then a conclude slide that reuses two or more items' facts to help the reader choose, plan, save or share, preferring the items' practical passages so it can lay out the plan for the period. Do not merge two items into one slide, do not drop an item to fit a preferred arc, and never promise more items than the facts enumerate. Use as many slides as the list needs, up to ${MAX_CAROUSEL_SLIDES} (hook, up to ${MAX_CAROUSEL_LIST_ITEMS} items, conclude); only a longer list keeps its first ${MAX_CAROUSEL_LIST_ITEMS} items in source order and names the rest in riskFlags. The framing strategy shapes wording only; it never turns the list into a consequence story.`;

/**
 * The brief-side structure rules, returned with their own leading blank line
 * so callers can append them directly. "hook-list" always plans a list; "auto"
 * (the default) plans one only when the source enumerates distinct items, and
 * either way the brief declares what it planned in carouselPlan.structure, so
 * the script, the critic and the code checks follow the same decision.
 * "hook-steps" is already described in the shared brief instruction.
 */
export function creativeBriefStructureInstruction(
  storyStructure: CreativeStoryStructure | undefined,
): string {
  if (storyStructure === "hook-list") {
    return `\n\nSTORY STRUCTURE: hook-list
This story is an enumerated list ("N things to do", "N tips", "N changes"), not a narrative arc; keep the carousel format and set carouselPlan.structure to "list". ${LIST_BRIEF_RULES} If the source does not enumerate distinct items, plan an ordinary carousel, set carouselPlan.structure to "arc", and say so in riskFlags.`;
  }
  if (storyStructure === "hook-steps") return `\n\nSet carouselPlan.structure to "arc".`;
  return `\n\nSTORY STRUCTURE: decide from the source
When the source's value is a set of three or more distinct items a reader can act on or choose between separately — events, places, plans, tips, offers, changes — it is an enumerated list ("N things to do this weekend", "5 new rules"): keep the carousel format, set carouselPlan.structure to "list", and follow these rules. ${LIST_BRIEF_RULES} Otherwise set carouselPlan.structure to "arc" and plan an ordinary carousel; a story that merely mentions several things while making one point is not a list.`;
}

/**
 * The script-side rules for a structured carousel, in the writer's terms.
 * Called with the structure the brief resolved (see resolveStoryStructure), so
 * an "auto" profile whose brief found a list gets the list rules.
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
Cover: the headline is the count-and-subject promise the plan's hook fact supports, with the place and period when a fact states them (for example "5 sorties à Saint-Jean ce week-end" or "8 Austin plans this weekend"). The subheadline is the draw, when the hook slide's allowed facts give one, in at most 8 words: what is free, new or opening, or ending soon (for example "Dernière chance pour le Grand Feu de 1876" or "Deux sorties gratuites"), or the span between two very different items. Without a draw it carries the date range or scope. Count a subset only when the hook slide cites a fact for every item in it. The number of concrete items stays the reason to continue: do not replace it with a consequence, a run-on summary of the items, or a question that hides the list. Name the list's real scope: do not present one item's neighborhood, venue or condition as the subject of the whole list. The cover's visualDirection is one main image: the draw's own subject, or the list's most appetizing item, as a single photograph or real object. It is never a collage, a grid, a set of cards, photos, Polaroids or thumbnails standing for the items, or a bundle of props. The concept describes the editorial idea, never a visual device such as one card or photo per item. The continuationCue may name the first item.
Each middle slide is one item, read in a few seconds:
- headline: at most ${LIST_ITEM_HEADLINE_MAX_WORDS} words, leading with what the reader gets to do or enjoy there, with the event's own name when the source gives one (a festival, a series, a night like "Boo at the Zoo"); never a price, an admission rule, a warning or a condition. Vary how the headlines open — never start two in a row with the same verb ("Découvrez", "Retrouvez", "Discover") — and leave the venue to the practical line unless it is the item's name.
- body: one sentence of at most ${LIST_ITEM_SENTENCE_MAX_WORDS} words on what happens there, as the facts describe it (the activity, food, music or craft; standing or seated; who it is for). Then, on its own line, the practical line: day · time · ages or audience · price, each exactly as the item's facts state it, in that order. Examples: "Dim. 11 oct. · 10 h 30–11 h 30 · Gratuit", "Dim. · 16 h · 4–7 ans · 22 $", "Sat. · 11 a.m.–5 p.m. · free". Leave out what the facts do not state, always say free when a fact says so, and add the place only when no other line on the slide names it.
- Keep every required qualifier with the fact it qualifies, in its shortest faithful wording. Conditions, warnings, secondary offers and fine print (weather, closures, limits, purchase conditions) stay off the slide unless the item cannot be used without them; the caption carries them, with their qualifiers.
Do not narrate a story across items and do not add a consequence a fact does not state.
Closing: when its allowed facts state the items' days or times, the closing is the plan for the period:
- a headline of at most 6 words (for example "Ta fin de semaine en un coup d'œil" or "Your weekend at a glance");
- a body with one line per day, each item as its time and a short name of one or two words, in time order (for example "Samedi : musée 11 h–17 h · chanson 20 h", then "Dimanche : Trinity 10 h 30 · Bêtes de fête 16 h");
- then the configured conversion goal as its single action, in at most ${LIST_CLOSING_CTA_MAX_WORDS} words.
Otherwise the closing has at most ${LIST_CLOSING_MAX_WORDS} words before the call to action: one concrete takeaway that helps the reader choose or plan (which items are free, which one ends this weekend, or what to book first). It is never a comparison of the items, a synthesis, a recap label or a list of admission terms, and it carries the configured conversion goal as its single action. If the plan's hook slide cites no count fact, the brief found no enumerated list: write an ordinary carousel.`;
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
