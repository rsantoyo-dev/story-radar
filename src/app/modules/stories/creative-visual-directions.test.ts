import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVisualDirectionsContents,
  buildVisualDirectionsInstructions,
  CreativeVisualDirectionsResponseError,
  parseVisualDirectionsResponse,
} from "./creative-visual-directions";
import type { CreativeUnit } from "./creative-content.types";

const unit = (order: number, extra: Partial<CreativeUnit> = {}): CreativeUnit => ({
  order,
  type: "carousel-slide",
  role: order === 1 ? "cover" : "content",
  headline: `Titre ${order}`,
  body: `Texte ${order}`,
  visualDirection: `Collage en papiers découpés, slide ${order}`,
  factIds: [],
  assetRequest: { kind: "image" } as unknown as CreativeUnit["assetRequest"],
  aspectRatio: "4:5",
  ...extra,
});

test("the model sees the identity, each slide's fixed text, its old direction and its verified material", () => {
  const contents = JSON.parse(buildVisualDirectionsContents({
    identity: "STYLE: documentary editorial",
    format: "carousel",
    language: "french",
    concept: "Cinq fiches",
    units: [unit(1, { characterIds: ["c1"] }), unit(2, { storyReferences: [{ photoId: "p" }] as unknown as CreativeUnit["storyReferences"] })],
  }));
  assert.equal(contents.creativeIdentity, "STYLE: documentary editorial");
  assert.deepEqual(contents.slides[0].visibleText, { headline: "Titre 1", body: "Texte 1" });
  assert.equal(contents.slides[0].previousVisualDirection, "Collage en papiers découpés, slide 1");
  assert.equal(contents.slides[0].usesApprovedCharacter, true);
  assert.equal(contents.slides[1].usesVerifiedStoryPhoto, true);
  assert.match(buildVisualDirectionsInstructions(), /visible text of every slide is approved and fixed/);
});

test("a rewrite must return exactly one usable direction per slide", () => {
  const units = [unit(1), unit(2)];
  const ok = parseVisualDirectionsResponse(JSON.stringify({ units: [
    { order: 2, visualDirection: "  Mise en page typographique, date en grand, fond crème.  " },
    { order: 1, visualDirection: "Photo documentaire pleine largeur en haut, titre sur aplat bleu." },
  ] }), units);
  assert.equal(ok.get(2), "Mise en page typographique, date en grand, fond crème.");

  const bad = [
    "not json",
    JSON.stringify({ units: [{ order: 1, visualDirection: "Photo documentaire pleine largeur." }] }),
    JSON.stringify({ units: [{ order: 1, visualDirection: "Photo documentaire pleine largeur." }, { order: 3, visualDirection: "Une autre mise en page claire." }] }),
    JSON.stringify({ units: [{ order: 1, visualDirection: "court" }, { order: 2, visualDirection: "Une autre mise en page claire." }] }),
    JSON.stringify({ units: [{ order: 1, visualDirection: "Photo documentaire pleine largeur." }, { order: 1, visualDirection: "Une autre mise en page claire." }] }),
  ];
  for (const text of bad) assert.throws(() => parseVisualDirectionsResponse(text, units), CreativeVisualDirectionsResponseError, text);
});

test("an overlong direction is cut at a word boundary within the stored limit", () => {
  const long = `${"mot ".repeat(400)}fin`;
  const result = parseVisualDirectionsResponse(JSON.stringify({ units: [{ order: 1, visualDirection: long }] }), [unit(1)]);
  assert.ok(result.get(1)!.length <= 1_000);
  assert.match(result.get(1)!, /mot$/);
});
