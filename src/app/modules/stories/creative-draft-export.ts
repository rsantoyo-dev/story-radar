import type {
  CreativeFormat,
  GeneratedCreativeDraft,
} from "./creative-content.types";

type DraftScriptSource = Pick<
  GeneratedCreativeDraft,
  | "concept"
  | "caption"
  | "callToAction"
  | "hashtags"
  | "altText"
  | "narrativeRationale"
  | "units"
>;

/** Builds one paste-ready representation of the complete editable script. */
export function buildCompleteDraftScript(
  draft: DraftScriptSource,
  format: CreativeFormat,
): string {
  const hashtags = draft.hashtags
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .join(" ");
  const sections = [
    "FULL CREATIVE SCRIPT",
    `FORMAT: ${format.toUpperCase()} · ${draft.units.length} ${draft.units.length === 1 ? "IMAGE" : "IMAGES"}`,
    field("CONCEPT", draft.concept),
    field("CAPTION", draft.caption),
    field("GENERAL CTA", draft.callToAction),
    field("HASHTAGS", hashtags),
    field("ACCESSIBILITY ALT TEXT", draft.altText),
    field("NARRATIVE RATIONALE", draft.narrativeRationale),
    ...draft.units.map((unit, index) =>
      [
        `IMAGE ${index + 1}`,
        `Role: ${unit.role}`,
        unit.editorialGoal
          ? `Editorial purpose: ${unit.editorialGoal}`
          : undefined,
        unit.viewerQuestion
          ? `Internal viewer question (not visible): ${unit.viewerQuestion}`
          : undefined,
        field("ON-IMAGE HEADLINE", unit.headline),
        field("SUBHEADLINE", unit.subheadline),
        field("SUPPORTING TEXT", unit.body),
        field("CONTINUATION CUE", unit.continuationCue),
        field("VISIBLE CTA", unit.ctaQuestion),
        field("IMAGE OUTPUT / VISUAL DIRECTION", unit.visualDirection),
        unit.interactiveOverlay?.recommendation
          ? interactionRecommendation(unit.interactiveOverlay.recommendation)
          : undefined,
        unit.factIds.length
          ? `Selected facts: ${unit.factIds.join(", ")}`
          : undefined,
      ]
        .filter(isText)
        .join("\n"),
    ),
  ];

  return sections.filter(isText).join("\n\n").trim();
}

function interactionRecommendation(
  recommendation: NonNullable<
    DraftScriptSource["units"][number]["interactiveOverlay"]
  >["recommendation"],
): string | undefined {
  if (!recommendation) return undefined;
  return [
    "MANUAL INSTAGRAM INTERACTION (add after export)",
    `Type: ${recommendation.kind}`,
    `Prompt: ${recommendation.prompt}`,
    recommendation.options?.length
      ? `Options: ${recommendation.options.join(" | ")}`
      : undefined,
    recommendation.correctOption
      ? `Correct quiz answer: ${recommendation.correctOption}`
      : undefined,
    recommendation.emoji ? `Slider emoji: ${recommendation.emoji}` : undefined,
    `Why this works: ${recommendation.rationale}`,
  ]
    .filter(isText)
    .join("\n");
}

function field(label: string, value?: string): string | undefined {
  const text = value?.trim();
  return text ? `${label}:\n${text}` : undefined;
}

function isText(value: string | undefined): value is string {
  return Boolean(value?.trim());
}
