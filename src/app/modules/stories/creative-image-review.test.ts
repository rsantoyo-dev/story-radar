import assert from "node:assert/strict";
import test from "node:test";

import { buildImageReviewInstructions, buildImageReviewText, CreativeImageReviewResponseError, imageReviewIssues, parseImageReviewAnswer } from "./creative-image-review";

const clean = { peopleOutsideVerifiedPhoto: false, possibleRealPersonLikeness: false, thirdPartyLogos: [], brandAvoidViolations: [], factContradictions: [], inventedNamedSubject: "", summary: "" };
const brand = {
  avoid: ["Photo framing and print simulations: Polaroids and instant-film borders; Taped or pinned photographs", "Text and publication artifacts: Photo-credit footers and attached bylines"],
  allowed: ["Verified map markers, separate from photographs"],
  acceptance: ["Is photography borderless and free of mounts, tape and print simulations?"],
};
const photo = { personName: "Kevin Owens", region: { left: 46, top: 42, right: 94, bottom: 90 } };

test("a clean slide passes", () => {
  assert.deepEqual(imageReviewIssues(clean, { characters: [] }), []);
});

test("an invented likeness of a real person always blocks, even with an approved character", () => {
  const issues = imageReviewIssues({ ...clean, possibleRealPersonLikeness: true }, { characters: [{ name: "Jo", description: "brand mascot" }] });
  assert.match(issues.join(" "), /could be read as a real or named person/);
});

test("people added around a verified photo block; an approved fictional character does not", () => {
  assert.match(imageReviewIssues({ ...clean, peopleOutsideVerifiedPhoto: true }, { verifiedPhoto: photo, characters: [] }).join(" "), /around the verified photo/);
  // Generic, fictional people doing the activity are allowed without a character.
  assert.deepEqual(imageReviewIssues({ ...clean, peopleOutsideVerifiedPhoto: true }, { characters: [] }), []);
  assert.deepEqual(imageReviewIssues({ ...clean, peopleOutsideVerifiedPhoto: true }, { characters: [{ name: "Jo", description: "brand mascot" }] }), []);
});

test("third-party logos block", () => {
  assert.match(imageReviewIssues({ ...clean, thirdPartyLogos: ["WWE", " "] }, { characters: [] }).join(" "), /third-party logos: WWE\./);
});

test("a pasted map keeps its provider's logo; other logos still block", () => {
  const verifiedMap = { provider: "Google", region: { left: 6, top: 47, right: 94, bottom: 92 } };
  assert.deepEqual(imageReviewIssues({ ...clean, thirdPartyLogos: ["Google", "Google Maps logo"] }, { verifiedMap, characters: [] }), []);
  assert.match(imageReviewIssues({ ...clean, thirdPartyLogos: ["Google", "Nike"] }, { verifiedMap, characters: [] }).join(" "), /third-party logos: Nike\./);
  assert.match(imageReviewIssues({ ...clean, thirdPartyLogos: ["Google"] }, { characters: [] }).join(" "), /third-party logos: Google\./, "without a pasted map, a Google logo is generated");
});

test("what the brand's identity avoids blocks, judged only against a supplied avoid list", () => {
  // The Saint-Jean cover of October 2026: Polaroids and a credit drawn on the image.
  const answer = { ...clean, brandAvoidViolations: ["Polaroid-style white photo frames", "photo credit and URL drawn on the image", " "] };
  assert.match(imageReviewIssues(answer, { characters: [], brand }).join(" "), /brand's identity avoids: Polaroid-style white photo frames; photo credit and URL drawn on the image\./);
  assert.deepEqual(imageReviewIssues(answer, { characters: [] }), [], "no avoid list, nothing to violate");
});

test("an image that contradicts the slide's facts, or invents a named work or place, blocks", () => {
  const facts = ["La formule se déroule debout et dure une heure."];
  assert.match(imageReviewIssues({ ...clean, factContradictions: ["seated audience in theatre rows"] }, { characters: [], facts }).join(" "), /contradicts the slide's facts: seated audience in theatre rows\./);
  assert.deepEqual(imageReviewIssues({ ...clean, factContradictions: ["seated audience"] }, { characters: [] }), [], "no facts, no contradiction");
  assert.match(imageReviewIssues({ ...clean, inventedNamedSubject: "the projection of « Vibrations microscopiques »" }, { characters: [] }).join(" "), /invented view of the projection of « Vibrations microscopiques » as if it were real\./);
});

test("the reviewer receives the facts, the brand's identity and the verified place photo", () => {
  const text = JSON.parse(buildImageReviewText({ visibleText: "Bêtes de fête", publicationName: "Salut St-Jean", characters: [], facts: ["debout"], brand, verifiedPlacePhoto: { placeName: "Musée du Haut-Richelieu" } }));
  assert.deepEqual(text.facts, ["debout"]);
  assert.deepEqual(text.brand, brand);
  assert.equal(text.verifiedPlacePhoto.place, "Musée du Haut-Richelieu");
  const bare = JSON.parse(buildImageReviewText({ visibleText: "x", publicationName: "p", characters: [] }));
  assert.equal(bare.brand, null);
  assert.equal(bare.facts, null);
  // The overlays the platform adds are never the brand's problem.
  assert.match(buildImageReviewInstructions(), /Never list the publication's own logo, the small page counter/);
});

test("only a complete, structured answer is trusted", () => {
  assert.throws(() => parseImageReviewAnswer("nope"), CreativeImageReviewResponseError);
  assert.throws(() => parseImageReviewAnswer(JSON.stringify({ possibleRealPersonLikeness: false })), CreativeImageReviewResponseError);
  assert.deepEqual(parseImageReviewAnswer(JSON.stringify({ ...clean, thirdPartyLogos: ["Rothmans", 4] })).thirdPartyLogos, ["Rothmans"]);
  // An answer from before v8 still parses, with nothing to report on the new checks.
  const legacy = parseImageReviewAnswer(JSON.stringify({ peopleOutsideVerifiedPhoto: false, possibleRealPersonLikeness: false, thirdPartyLogos: [], summary: "" }));
  assert.deepEqual([legacy.brandAvoidViolations, legacy.factContradictions, legacy.inventedNamedSubject], [[], [], ""]);
});

test("non-human characters such as ghosts and jack-o'-lanterns are not reviewed as people", () => {
  const instructions = buildImageReviewInstructions();
  assert.match(instructions, /Non-human characters are not people either: ghosts, monsters/);
  assert.match(instructions, /any human face, head, body, silhouette or figure/, "human figures still count");
});

