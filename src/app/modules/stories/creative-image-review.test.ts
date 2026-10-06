import assert from "node:assert/strict";
import test from "node:test";

import { CreativeImageReviewResponseError, imageReviewIssues, parseImageReviewAnswer } from "./creative-image-review";

const clean = { peopleOutsideVerifiedPhoto: false, possibleRealPersonLikeness: false, thirdPartyLogos: [], summary: "" };
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
  assert.match(imageReviewIssues({ ...clean, peopleOutsideVerifiedPhoto: true }, { characters: [] }).join(" "), /without an approved character/);
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

test("only a complete, structured answer is trusted", () => {
  assert.throws(() => parseImageReviewAnswer("nope"), CreativeImageReviewResponseError);
  assert.throws(() => parseImageReviewAnswer(JSON.stringify({ possibleRealPersonLikeness: false })), CreativeImageReviewResponseError);
  assert.deepEqual(parseImageReviewAnswer(JSON.stringify({ ...clean, thirdPartyLogos: ["Rothmans", 4] })).thirdPartyLogos, ["Rothmans"]);
});
