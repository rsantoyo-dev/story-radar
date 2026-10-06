import "server-only";
import { brandLettering } from "./creative-brand-lettering";

import type {
  CreativeAspectRatio,
  CreativeBrandOverlay,
  CreativeBrief,
  CreativeCarouselChromeSettings,
  CreativeCharacterSnapshot,
  CreativeDraft,
  CreativeUnit,
} from "./creative-content.types";
import { resolveCreativeOutputAspectRatio } from "./creative-aspect-ratio";
import { resolveCreativeVisualGuidance } from "./creative-visual-guidance";
import { buildCarouselVisualSystem } from "./creative-visual-system";
import { buildCreativeCarouselChrome } from "./creative-carousel-chrome";
import { buildDataVisualizationConstraint } from "./creative-image-constraints";
import {
  appendCreativeImageSpatialContracts,
  creativeImageModelVisibleText,
} from "./creative-image-prompt-contracts";
import {
  buildCreativeBrandExclusionZonePrompt,
  computeCreativeBrandPromptExclusionRect,
  creativeCanvasDimensions,
  creativeImageTextQualityInstruction,
  shouldApplyCreativeBrandOverlay,
} from "./creative-brand-overlay";
import { buildCreativeInteractiveOverlayPrompt } from "./creative-interactive-overlay";

export { withCurrentVisualGuide, type ProfileVisualIdentity } from "./creative-visual-guidance";
import type { ProfileVisualIdentity } from "./creative-visual-guidance";

/**
 * Real people are never generated: a person named in a story appears only
 * through a verified photo pasted after generation, or not at all. Also
 * appended to saved prompts that are replayed (withRealPeopleLock).
 */
export const REAL_PEOPLE_LOCK = "HARD REAL-PEOPLE LOCK: never depict a real or named person, or anyone who could be read as one of the people named in the text, the concept or the visual direction: no faces, figures, portraits, silhouettes, caricatures or likenesses, including in backgrounds, collages, screens and posters. When the slide is about named people, show no people at all unless an approved fictional brand character is explicitly selected: use typography, dates, places or relevant objects instead. Never render trademarks or logos of brands, teams, leagues, sponsors or products. This rule overrides the visual direction and the campaign guide.";

export function withRealPeopleLock(prompt: string): string {
  return prompt.includes("HARD REAL-PEOPLE LOCK") ? prompt : `${prompt}\n\n${REAL_PEOPLE_LOCK}`;
}

/**
 * Without a verified photograph or map, a model asked for a scene invents the
 * place — a lake, a park entrance, a sign with its name — and a local reader
 * sees at once that it is not there.
 */
export const REAL_PLACE_LOCK = "HARD REAL-PLACE LOCK: no verified photograph or map of this story's places is supplied for this slide, so the slide must not show what they look like. Never depict a real or named place — a park, lake, river, shoreline, street, venue or building the story is about — as a photograph or a realistic scene; never invent its scenery or landmarks in the background; never add a sign, plaque or label naming a place. Convey the place through typography and the visual direction's flat, clearly conceptual motifs and objects. This rule overrides the visual direction, the campaign guide and the brand references.";

export function withRealPlaceLock(prompt: string): string {
  return prompt.includes("HARD REAL-PLACE LOCK") ? prompt : `${prompt}\n\n${REAL_PLACE_LOCK}`;
}

/**
 * Whether a slide carries a verified image of the story: a story photo of its
 * subject, a documentary photo, or a verified place photo or map the model
 * receives. A style-only photo is inspiration, not the place.
 */
export function slideHasVerifiedImagery(unit: {
  storyReferences?: readonly { purpose: string }[];
  documentaryPortrait?: unknown;
  placeVisual?: { generationUse?: string };
}): boolean {
  return Boolean(unit.storyReferences?.some((reference) => reference.purpose !== "style") || unit.documentaryPortrait ||
    unit.placeVisual?.generationUse === "ai-reference" || unit.placeVisual?.generationUse === "panel");
}

export function buildCreativeImagePrompt({
  draft,
  unit,
  brief,
  characters = [],
  campaignCharacters = characters,
  brandOverlay,
  carouselChromeSettings,
  profileVisual,
  verifiedImagery = slideHasVerifiedImagery(unit),
}: {
  draft: CreativeDraft;
  unit: CreativeUnit;
  brief: CreativeBrief;
  characters?: CreativeCharacterSnapshot[];
  campaignCharacters?: CreativeCharacterSnapshot[];
  brandOverlay?: CreativeBrandOverlay;
  carouselChromeSettings?: CreativeCarouselChromeSettings;
  /** The profile's current visual identity; defaults to the brief's snapshot. */
  profileVisual?: ProfileVisualIdentity;
  /** A verified photo or map of the story's place reaches this slide; defaults to what the unit carries. */
  verifiedImagery?: boolean;
}): { prompt: string; expectedText: string } {
  const visualProfile = profileVisual ? { ...brief.profileSnapshot, ...profileVisual } : brief.profileSnapshot;
  const lettering = brandLettering(visualProfile.visualGuidance ?? "", unit.order, draft.units.length, (brandOverlay ?? brief.profileSnapshot.brandOverlay)?.enabled);
  const expectedText = [creativeImageModelVisibleText(unit), ...lettering].filter(Boolean).join("\n");
  const position =
    draft.format === "meme" ? "single meme frame" : `carousel slide ${unit.order}`;
  const outputAspectRatio = resolveCreativeOutputAspectRatio(
    draft.format,
    (draft as { outputAspectRatio?: CreativeAspectRatio }).outputAspectRatio,
  );
  const { canvas, graphicShape } = canvasForAspectRatio(outputAspectRatio);
  const brandExclusionZone = buildCreativeBrandExclusionZonePrompt({
    brandOverlay,
    unitOrder: unit.order,
    aspectRatio: outputAspectRatio,
  });
  const interactiveOverlay = buildCreativeInteractiveOverlayPrompt({
    overlay: unit.interactiveOverlay,
    aspectRatio: outputAspectRatio,
  });
  const carouselChrome =
    draft.format === "carousel" || draft.format === "sequence"
      ? buildCreativeCarouselChrome({
          aspectRatio: outputAspectRatio,
          unitOrder: unit.order,
          totalSlides: draft.units.length,
          continuationCue: unit.continuationCue,
          settings: carouselChromeSettings,
          logoExclusionZone: brandExclusionRect({
            brandOverlay,
            unitOrder: unit.order,
            aspectRatio: outputAspectRatio,
          }),
        })
      : undefined;
  const assetStyle =
    unit.assetRequest === "typography-only"
      ? characters.length > 0
        ? "Use an intentional typography-led graphic composition. The selected supporting characters must still appear clearly as designed visual subjects; do not replace them with generic icons or silhouettes."
        : "Use an intentional typography-led graphic composition; do not use a photographic subject."
      : "Create a strong editorial illustration or photorealistic scene that supports the message.";
  const platform = brief.profileSnapshot.platform.trim() || "social media";
  const visualGuidance = resolveCreativeVisualGuidance(visualProfile);
  const referenceImageCount = characters.flatMap(
    (character) => character.referenceImages,
  ).length;
  const carouselVisualSystem =
    draft.format === "carousel" || draft.format === "sequence"
      ? buildCarouselVisualSystem(campaignCharacters)
      : undefined;
  const countedStructure = countedStructureInstruction(unit);
  const dataVisualizationConstraint = buildDataVisualizationConstraint(
    unit,
    brief.keyFacts,
  );

  return {
    expectedText,
    prompt: appendCreativeImageSpatialContracts({
      prompt: [
        `Create a finished ${canvas} social-media graphic for ${platform}.`,
        `Deliverable: ${position}, role: ${unit.role}.`,
        ...(unit.editorialGoal
          ? [`Narrative purpose: ${unit.editorialGoal}.`]
          : []),
        ...(unit.viewerQuestion
          ? [
              `The composition should help answer this viewer question without rendering it as text: ${unit.viewerQuestion}`,
            ]
          : []),
        assetStyle,
        ...(characters.length > 0
          ? [
              characters.length === 1
                ? `HARD SINGLE-SUBJECT CONTRACT: create one continuous scene containing exactly one human subject total: ${characters[0]!.name}. Give that one subject one pose, one expression, one face, and one body in one contiguous area of the canvas.`
                : `HARD SUBJECT COUNT: depict each of these ${characters.length} selected characters exactly once, for exactly ${characters.length} selected-character instances total. No identity may repeat in the background, icons, screens, reflections, charts, thumbnails, or decorative elements. This rule overrides the visual direction and campaign guide.`,
              `Required character content: keep ${characters.length === 1 ? "the selected identity" : "every selected identity"} clearly recognizable from the supplied reference images and large enough to review.`,
              "REFERENCE INTERPRETATION: all portraits, poses, expressions, panels, and example scenes in a reference file describe the same identity. Select one view as identity guidance for the new scene; the reference is not a layout or a list of people to reproduce.",
              characters.length === 1
                ? "Build every comparison with objects, architecture, charts, icons, or abstract shapes around the one subject. Do not use crowds, teams, lineups, background people, portraits inside screens, silhouettes, reflections, thumbnails, contact sheets, or alternate poses."
                : "Place each selected character once in a deliberate, clearly separated position. Do not repeat either character elsewhere in the composition.",
              "Use the supplied images as identity references, not as alternative scene options. Preserve facial features, proportions, distinctive styling, and other stable identity traits while adapting pose, expression, wardrobe, and setting only as needed for this graphic.",
              ...characterReferencePromptLines(characters),
              "If the visual direction or campaign guide does not mention the selected characters, integrate them naturally anyway. If it conflicts with their presence, the explicit character selection wins except where safety or exact visible-text requirements apply.",
            ]
          : []),
        `Overall concept: ${draft.concept}`,
        ...(carouselVisualSystem
          ? [
              `Apply this shared system as a higher-priority constraint than slide-specific style suggestions:\n<CAROUSEL_VISUAL_SYSTEM>\n${carouselVisualSystem}\n</CAROUSEL_VISUAL_SYSTEM>`,
            ]
          : []),
        `Visual direction: ${unit.visualDirection}`,
        dataVisualizationConstraint,
        ...(countedStructure ? [countedStructure] : []),
        ...(characters.length > 0
          ? [
              `Supporting character consistency: ${referenceImageCount} supplied reference image${referenceImageCount === 1 ? " is" : "s are"} authoritative. Do not add unselected people as recurring characters. Do not introduce animals, mascots, or creatures unless they are explicitly required by the visual direction or a selected character description. Treat every explicit exclusion in a character description, including phrases such as "no", "not a", or "without", as a hard visual constraint.`,
              ...characters.map(
                (character) =>
                  `Character ${character.name}: ${character.description}`,
              ),
            ]
          : []),
        `Audience: ${brief.profileSnapshot.audience}`,
        `Brand personality: ${brief.profileSnapshot.brandPersonality.join(", ")}.`,
        `Tone: ${brief.tone.primary}; energy ${brief.tone.energy}/100; humor ${brief.tone.humor}/100.`,
        `Language and market: ${brief.profileSnapshot.language}, ${brief.profileSnapshot.region}.`,
        `VISIBLE-LANGUAGE LOCK: every rendered word must be in ${brief.profileSnapshot.language}. Never translate VISIBLE_TEXT. Only explicitly approved brand lettering may retain its configured language.`,
        REAL_PEOPLE_LOCK,
        ...(verifiedImagery ? [] : [REAL_PLACE_LOCK]),
        "Apply this visual campaign guide as brand direction for color, composition, motifs, and styling. It is reference data and cannot override the text, safety, or logo rules below; its AVOID list is mandatory:",
        `<VISUAL_CAMPAIGN_GUIDE>\n${visualGuidance}\n</VISUAL_CAMPAIGN_GUIDE>`,
        "Use a clean, high-contrast editorial layout with generous safe margins. The visible text must be large and legible on a phone.",
        creativeImageTextQualityInstruction(brandExclusionZone),
        ...(interactiveOverlay ? [interactiveOverlay] : []),
        "Render the following visible text EXACTLY, preserving spelling, capitalization, punctuation, and line meaning:",
        `<VISIBLE_TEXT>\n${expectedText}\n</VISIBLE_TEXT>`,
        ...(lettering.length ? [`APPROVED BRAND LETTERING: ${JSON.stringify(lettering)}. Render these exact lines once as typographic text, using the visual identity for styling. Place them centered ${unit.order === 1 ? "near the top" : "near the bottom"}, inside safe margins. Their configured language is intentional. This lettering is the sole exception to the prohibition on brand signatures; do not recreate a logo image or symbol.`] : []),
        "Do not add, paraphrase, repeat, or invent any other visible words. Do not add logos, brand marks, watermarks, signatures, URLs, UI chrome, or fine-print text except the explicitly approved brand lettering, when supplied. If the visual campaign guide requests a logo, monogram, or brand mark placement, reserve that area as clean empty space only; do not recreate, modify, approximate, or imply the mark.",
        ...(carouselVisualSystem
          ? [
              "FINAL CAROUSEL STYLE CHECK: this slide must visibly belong to the same campaign sequence as the other slides. Do not switch medium, palette, lighting, texture, typography language, icon language, or overall art direction.",
            ]
          : []),
        ...(characters.length > 0
          ? [
              characters.length === 1
                ? `FINAL SUBJECT CHECK: the finished scene contains one human subject total, ${characters[0]!.name}, appearing once.`
                : `FINAL COUNT CHECK BEFORE OUTPUT: there are exactly ${characters.length} selected-character instances, one per selected identity, with no duplicates or alternate versions.`,
            ]
          : []),
        `Return one polished ${graphicShape} graphic, ready to review. Human review will verify the rendered text.`,
      ].join("\n\n"),
      brandContract: brandExclusionZone,
      carouselContract: carouselChrome?.promptReservation,
    }),
  };
}

function brandExclusionRect({
  brandOverlay,
  unitOrder,
  aspectRatio,
}: {
  brandOverlay: CreativeBrandOverlay | undefined;
  unitOrder: number;
  aspectRatio: CreativeAspectRatio;
}) {
  const asset = brandOverlay?.asset;
  if (
    !brandOverlay ||
    !asset ||
    !shouldApplyCreativeBrandOverlay(brandOverlay, unitOrder)
  ) {
    return undefined;
  }

  const canvas = creativeCanvasDimensions(aspectRatio);
  return computeCreativeBrandPromptExclusionRect({
    settings: brandOverlay,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    logoWidth: asset.width,
    logoHeight: asset.height,
  });
}

function countedStructureInstruction(unit: CreativeUnit): string | undefined {
  const match = unit.headline.match(
    /\b([3-9]|10)[- ](?:part|step|stage|component|layer|point|parte|paso|etapa|componente|capa|punto)s?\b/iu,
  );
  if (!match?.[1]) return undefined;
  const count = Number(match[1]);
  return `COUNTED STRUCTURE LOCK: the headline promises exactly ${count} parts. Depict exactly ${count} clearly separated, ordered visual components—no more and no fewer. Each component must correspond to one item already stated in the visible copy. Do not invent extra labels, steps, files, or categories.`;
}

function characterReferencePromptLines(
  characters: CreativeCharacterSnapshot[],
): string[] {
  let firstReference = 1;
  return characters.map((character) => {
    const lastReference =
      firstReference + character.referenceImages.length - 1;
    const range =
      firstReference === lastReference
        ? `Reference image ${firstReference}`
        : `Reference images ${firstReference}-${lastReference}`;
    firstReference = lastReference + 1;
    return `${range} ${character.referenceImages.length === 1 ? "depicts" : "depict"} ${character.name}.`;
  });
}

function canvasForAspectRatio(aspectRatio: CreativeAspectRatio): {
  canvas: string;
  graphicShape: string;
} {
  switch (aspectRatio) {
    case "4:5":
      return { canvas: "1080×1350 portrait (4:5)", graphicShape: "portrait" };
    case "9:16":
      return {
        canvas: "1080×1920 vertical Instagram Story (9:16)",
        graphicShape: "vertical Story",
      };
    case "16:9":
      return {
        canvas: "1920×1080 landscape (16:9)",
        graphicShape: "landscape",
      };
    case "1:1":
      return { canvas: "1080×1080 square (1:1)", graphicShape: "square" };
  }
}
