/**
 * Automated review of a generated slide before it can be approved: the image
 * model can ignore prompt rules, so an independent vision check decides. It
 * blocks invented likenesses of real or named people, people added around a
 * verified photo, third-party logos, what the brand's identity says never to
 * include, images that contradict the slide's facts, and invented views of a
 * named show, exhibition, artwork or place presented as real. The verdict is
 * advisory text from a model, so only the structured fields below are trusted.
 */
export const CREATIVE_IMAGE_REVIEW_PROMPT_VERSION = "image-review-v8";

export type CreativeImageReviewInput = {
  visibleText: string;
  publicationName: string;
  /** The verified photo pasted after generation, as percentages of the canvas. */
  verifiedPhoto?: { personName: string; region: { left: number; top: number; right: number; bottom: number } };
  /** A verified provider map pasted after generation; its logo and attribution are required. */
  verifiedMap?: { provider: string; region: { left: number; top: number; right: number; bottom: number } };
  /** A verified photo of this place was the model's reference, so a faithful view of it is expected. */
  verifiedPlacePhoto?: { placeName: string };
  /** Approved fictional brand characters selected for this slide. */
  characters: { name: string; description: string }[];
  /** The statements of the facts this slide cites. */
  facts?: string[];
  /** The brand identity's avoid list, its allowed exceptions and its editor's acceptance criteria. */
  brand?: { avoid: string[]; allowed: string[]; acceptance: string[] };
};

export type CreativeImageReviewAnswer = {
  peopleOutsideVerifiedPhoto: boolean;
  possibleRealPersonLikeness: boolean;
  thirdPartyLogos: string[];
  brandAvoidViolations: string[];
  factContradictions: string[];
  inventedNamedSubject: string;
  summary: string;
};

const stringList = { type: "array", items: { type: "string" } } as const;

export const CREATIVE_IMAGE_REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["peopleOutsideVerifiedPhoto", "possibleRealPersonLikeness", "thirdPartyLogos", "brandAvoidViolations", "factContradictions", "inventedNamedSubject", "summary"],
  properties: {
    peopleOutsideVerifiedPhoto: { type: "boolean" },
    possibleRealPersonLikeness: { type: "boolean" },
    thirdPartyLogos: stringList,
    brandAvoidViolations: stringList,
    factContradictions: stringList,
    inventedNamedSubject: { type: "string" },
    summary: { type: "string" },
  },
} as const;

export function buildImageReviewInstructions(): string {
  return [
    "You review one finished social-media slide before publication. Answer only from what is visible in the image.",
    "The verified photo region is approximate (within about 6% of the canvas). The verified photograph is one cleanly bounded photo (rectangle, rounded rectangle, arch or circle) placed there; everything beyond its boundary is outside it, including a person partly hidden behind it or a scene behind it.",
    "peopleOutsideVerifiedPhoto: true if any human face, head, body, silhouette or figure appears outside the verified photograph (when one is given) and is not one of the listed approved fictional characters. Drawings, illustrations and photorealistic people all count. Theatre masks, emoji, pictograms, simple icons, object illustrations, and clothing or equipment with no visible face, skin or body part are not people. Non-human characters are not people either: ghosts, monsters, skeletons, witches' hats or costumes without a person in them, scarecrows, jack-o'-lanterns, mascots, toys, animals and creatures, even when drawn with a face.",
    "possibleRealPersonLikeness: true if anything outside the verified photograph could be read as a depiction of a specific real person — anyone named in the visible text, or a recognizable public figure — whether photorealistic, illustrated or caricatured. A second, generated version of the photographed person also counts. Generic, anonymous people who are not presented as anyone in particular (a crowd at a festival, patrons at a table, a band on a stage) are not a likeness.",
    "thirdPartyLogos: list recognizable logos or trademark emblems of brands, teams, leagues, sponsors or products drawn outside the verified photograph and the verified map (for example on generated clothing, belts, cars or signs). Ignore anything inside the verified photograph or the verified map — a map's provider logo and attribution are required there — words that are part of the visible text, and the publication's own name or logo.",
    "brandAvoidViolations: when brand.avoid is given, list each element clearly visible in the image that matches an item of that list and is not covered by brand.allowed, in a few words each (for example \"Polaroid-style white photo frames\", \"painted brush stroke behind the date\", \"decorative lines near the headline\", \"photo credit and URL drawn on the image\"). Judge only what you can see; brand.acceptance shows how the brand's editor judges an image and is context, not a checklist. Never list the publication's own logo, the small page counter at the bottom, the verified map with its own logo and attribution, or the verified photo.",
    "factContradictions: list what the image shows that contradicts the supplied facts about the activity, in a few words each: for example a seated audience in rows for an activity the facts describe as standing or dancing, only adults for an activity for children, an indoor room for an outdoor activity. A detail the facts do not mention is not a contradiction.",
    "inventedNamedSubject: when the image presents, as if photographed or faithfully reproduced, a show, exhibition, artwork, projection or performance the visible text or facts name, or a recognizable view of a named place (its interior, facade or scenery) without the verified photo of that place, name that subject in a few words; otherwise return an empty string. Real objects, instruments or tools, typography and clearly generic settings are not an invented subject.",
    "summary: one short sentence describing any problem, or an empty string.",
  ].join("\n");
}

export function buildImageReviewText(input: CreativeImageReviewInput): string {
  return JSON.stringify({
    publication: input.publicationName,
    visibleText: input.visibleText,
    facts: input.facts?.length ? input.facts : null,
    verifiedPhoto: input.verifiedPhoto
      ? { person: input.verifiedPhoto.personName, regionPercent: input.verifiedPhoto.region, note: "This region holds the real, verified photograph; people inside it are expected." }
      : null,
    verifiedMap: input.verifiedMap
      ? { provider: input.verifiedMap.provider, regionPercent: input.verifiedMap.region, note: "This region holds a verified map; its provider logo and attribution are required and expected." }
      : null,
    verifiedPlacePhoto: input.verifiedPlacePhoto
      ? { place: input.verifiedPlacePhoto.placeName, note: "A verified photograph of this place was the reference; a faithful view of its exterior is expected, not an invented interior or event." }
      : null,
    approvedFictionalCharacters: input.characters,
    brand: input.brand?.avoid.length ? input.brand : null,
  });
}

const listed = (values: readonly string[]) => values.map((value) => value.trim()).filter(Boolean).slice(0, 4);

/** The blocking issues, in plain language for the editor; empty when the slide passes. */
export function imageReviewIssues(answer: CreativeImageReviewAnswer, input: Pick<CreativeImageReviewInput, "verifiedPhoto" | "verifiedMap" | "characters" | "brand" | "facts">): string[] {
  const issues: string[] = [];
  if (answer.possibleRealPersonLikeness) {
    issues.push("The image shows a generated person who could be read as a real or named person.");
  } else if (answer.peopleOutsideVerifiedPhoto && input.verifiedPhoto) {
    // Generic, fictional people doing the slide's activity are allowed on any
    // slide (October 2026); around a real person's verified photo they would
    // read as people who were there, so they still block.
    issues.push("The image adds people around the verified photo.");
  }
  // The pasted map must keep its provider's logo; the reviewer may still list it.
  const provider = input.verifiedMap?.provider.trim().toLowerCase();
  const logos = answer.thirdPartyLogos.map((logo) => logo.trim())
    .filter((logo) => logo && !(provider && logo.toLowerCase().includes(provider)));
  if (logos.length) issues.push(`The image shows third-party logos: ${logos.slice(0, 4).join(", ")}.`);
  // Only judged against what was supplied: no avoid list, no avoid finding.
  const avoided = input.brand?.avoid.length ? listed(answer.brandAvoidViolations) : [];
  if (avoided.length) issues.push(`The image shows what the brand's identity avoids: ${avoided.join("; ")}.`);
  const contradictions = input.facts?.length ? listed(answer.factContradictions) : [];
  if (contradictions.length) issues.push(`The image contradicts the slide's facts: ${contradictions.join("; ")}.`);
  const invented = answer.inventedNamedSubject.trim();
  if (invented) issues.push(`The image presents an invented view of ${invented} as if it were real.`);
  return issues;
}

export class CreativeImageReviewResponseError extends Error {}

const strings = (value: unknown, max: number) =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.slice(0, 160)).slice(0, max) : [];

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
    brandAvoidViolations: strings(answer.brandAvoidViolations, 10),
    factContradictions: strings(answer.factContradictions, 10),
    inventedNamedSubject: typeof answer.inventedNamedSubject === "string" ? answer.inventedNamedSubject.slice(0, 160) : "",
    summary: typeof answer.summary === "string" ? answer.summary.slice(0, 300) : "",
  };
}
