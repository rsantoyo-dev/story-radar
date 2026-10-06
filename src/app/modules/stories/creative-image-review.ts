/**
 * Automated review of a generated slide before it can be approved: the image
 * model can ignore prompt rules, so an independent vision check decides. It
 * blocks invented likenesses of real or named people, people added around a
 * verified photo, and third-party logos. The verdict is advisory text from a
 * model, so only the structured fields below are trusted.
 */
export const CREATIVE_IMAGE_REVIEW_PROMPT_VERSION = "image-review-v5";

export type CreativeImageReviewInput = {
  visibleText: string;
  publicationName: string;
  /** The verified photo pasted after generation, as percentages of the canvas. */
  verifiedPhoto?: { personName: string; region: { left: number; top: number; right: number; bottom: number } };
  /** A verified provider map pasted after generation; its logo and attribution are required. */
  verifiedMap?: { provider: string; region: { left: number; top: number; right: number; bottom: number } };
  /** Approved fictional brand characters selected for this slide. */
  characters: { name: string; description: string }[];
};

export type CreativeImageReviewAnswer = {
  peopleOutsideVerifiedPhoto: boolean;
  possibleRealPersonLikeness: boolean;
  thirdPartyLogos: string[];
  summary: string;
};

export const CREATIVE_IMAGE_REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["peopleOutsideVerifiedPhoto", "possibleRealPersonLikeness", "thirdPartyLogos", "summary"],
  properties: {
    peopleOutsideVerifiedPhoto: { type: "boolean" },
    possibleRealPersonLikeness: { type: "boolean" },
    thirdPartyLogos: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
} as const;

export function buildImageReviewInstructions(): string {
  return [
    "You review one finished social-media slide before publication. Answer only from what is visible in the image.",
    "The verified photo region is approximate (within about 6% of the canvas). The verified photograph is one cleanly bounded photo (rectangle, rounded rectangle, arch or circle) placed there; everything beyond its boundary is outside it, including a person partly hidden behind it or a scene behind it.",
    "peopleOutsideVerifiedPhoto: true if any human face, head, body, silhouette or figure appears outside the verified photograph (when one is given) and is not one of the listed approved fictional characters. Drawings, illustrations and photorealistic people all count. Theatre masks, emoji, pictograms, simple icons, object illustrations, and clothing or equipment with no visible face, skin or body part are not people.",
    "possibleRealPersonLikeness: true if anything outside the verified photograph could be read as a depiction of a real person — especially anyone named in the visible text — whether photorealistic, illustrated or caricatured. A second, generated version of the photographed person also counts.",
    "thirdPartyLogos: list recognizable logos or trademark emblems of brands, teams, leagues, sponsors or products drawn outside the verified photograph and the verified map (for example on generated clothing, belts, cars or signs). Ignore anything inside the verified photograph or the verified map — a map's provider logo and attribution are required there — words that are part of the visible text, and the publication's own name or logo.",
    "summary: one short sentence describing any problem, or an empty string.",
  ].join("\n");
}

export function buildImageReviewText(input: CreativeImageReviewInput): string {
  return JSON.stringify({
    publication: input.publicationName,
    visibleText: input.visibleText,
    verifiedPhoto: input.verifiedPhoto
      ? { person: input.verifiedPhoto.personName, regionPercent: input.verifiedPhoto.region, note: "This region holds the real, verified photograph; people inside it are expected." }
      : null,
    verifiedMap: input.verifiedMap
      ? { provider: input.verifiedMap.provider, regionPercent: input.verifiedMap.region, note: "This region holds a verified map; its provider logo and attribution are required and expected." }
      : null,
    approvedFictionalCharacters: input.characters,
  });
}

/** The blocking issues, in plain language for the editor; empty when the slide passes. */
export function imageReviewIssues(answer: CreativeImageReviewAnswer, input: Pick<CreativeImageReviewInput, "verifiedPhoto" | "verifiedMap" | "characters">): string[] {
  const issues: string[] = [];
  if (answer.possibleRealPersonLikeness) {
    issues.push("The image shows a generated person who could be read as a real or named person.");
  } else if (answer.peopleOutsideVerifiedPhoto && (input.verifiedPhoto || !input.characters.length)) {
    issues.push(input.verifiedPhoto
      ? "The image adds people around the verified photo."
      : "The image shows generated people on a slide without an approved character.");
  }
  // The pasted map must keep its provider's logo; the reviewer may still list it.
  const provider = input.verifiedMap?.provider.trim().toLowerCase();
  const logos = answer.thirdPartyLogos.map((logo) => logo.trim())
    .filter((logo) => logo && !(provider && logo.toLowerCase().includes(provider)));
  if (logos.length) issues.push(`The image shows third-party logos: ${logos.slice(0, 4).join(", ")}.`);
  return issues;
}

export class CreativeImageReviewResponseError extends Error {}

export function parseImageReviewAnswer(text: string): CreativeImageReviewAnswer {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new CreativeImageReviewResponseError("The image review response was not valid JSON");
  }
  const answer = value as Partial<CreativeImageReviewAnswer>;
  if (typeof answer.peopleOutsideVerifiedPhoto !== "boolean" || typeof answer.possibleRealPersonLikeness !== "boolean" || !Array.isArray(answer.thirdPartyLogos)) {
    throw new CreativeImageReviewResponseError("The image review response is incomplete");
  }
  return {
    peopleOutsideVerifiedPhoto: answer.peopleOutsideVerifiedPhoto,
    possibleRealPersonLikeness: answer.possibleRealPersonLikeness,
    thirdPartyLogos: answer.thirdPartyLogos.filter((logo): logo is string => typeof logo === "string").slice(0, 10),
    summary: typeof answer.summary === "string" ? answer.summary.slice(0, 300) : "",
  };
}
