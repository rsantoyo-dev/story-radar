/**
 * Every metered provider call is sold as a small product: an operation gets
 * a readable name and the workflow stage it belongs to. Unknown operations
 * stay visible under their own name rather than disappearing into "Other".
 */
export type SpendingGroup = "Discovery" | "Writing" | "Images" | "Places & maps" | "Brand setup" | "Other";

export type SpendingProduct = { key: string; label: string; group: SpendingGroup };

const PRODUCTS: Record<string, Omit<SpendingProduct, "key">> = {
  editorial_evaluation: { label: "Story evaluation", group: "Discovery" },
  editorial_evaluations: { label: "Story evaluation", group: "Discovery" },
  daily_planner: { label: "Daily plan", group: "Discovery" },
  daily_editorial_plan: { label: "Daily plan", group: "Discovery" },
  ai_research: { label: "AI research", group: "Discovery" },
  story_duplicates: { label: "Duplicate check", group: "Discovery" },
  editorial_focus: { label: "Editorial focus", group: "Writing" },
  creative_brief: { label: "Creative brief", group: "Writing" },
  creative_draft: { label: "Draft writing", group: "Writing" },
  creative_json: { label: "Draft writing", group: "Writing" },
  creative_critic: { label: "Draft critique", group: "Writing" },
  creative_editorial_final_audit: { label: "Editorial audit", group: "Writing" },
  creative_editorial_targeted_patch: { label: "Draft repair", group: "Writing" },
  creative_draft_repair: { label: "Draft repair", group: "Writing" },
  creative_single_shot_repair: { label: "Draft repair", group: "Writing" },
  creative_narrative_plan_review: { label: "Narrative plan", group: "Writing" },
  creative_narrative_replan: { label: "Narrative plan", group: "Writing" },
  hook_candidates: { label: "Cover hooks", group: "Writing" },
  hook_scores: { label: "Cover hooks", group: "Writing" },
  visual_directions: { label: "Visual directions", group: "Writing" },
  companion_instagram_story: { label: "Companion story", group: "Writing" },
  companion_story_terra_critic: { label: "Companion story", group: "Writing" },
  creative_image: { label: "Slide image", group: "Images" },
  image_review: { label: "Image review", group: "Images" },
  place_search: { label: "Place lookup", group: "Places & maps" },
  static_map: { label: "Map", group: "Places & maps" },
  place_photo: { label: "Place photo", group: "Places & maps" },
  place_photo_review: { label: "Place photo check", group: "Places & maps" },
  publication_places: { label: "Place research", group: "Places & maps" },
  documentary_places: { label: "Place research", group: "Places & maps" },
  creative_identity: { label: "Brand identity assistant", group: "Brand setup" },
  brand_palette_suggestion: { label: "Palette assistant", group: "Brand setup" },
  brand_reference_analysis: { label: "Brand reference analysis", group: "Brand setup" },
};

const KIND_GROUPS: Record<string, SpendingGroup> = { image: "Images", map: "Places & maps", search: "Discovery", embedding: "Discovery" };

export function spendingProduct(operation: string, kind: string): SpendingProduct {
  // "<operation>:web_search" is the search fee of that operation's calls.
  if (operation.endsWith(":web_search")) {
    const parent = spendingProduct(operation.slice(0, -":web_search".length), "text");
    return { key: operation, label: `${parent.label} · web search`, group: parent.group };
  }
  const known = PRODUCTS[operation];
  if (known) return { key: operation, ...known };
  const label = operation.replace(/[_:]+/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
  return { key: operation, label, group: KIND_GROUPS[kind] ?? (kind === "text" ? "Writing" : "Other") };
}
