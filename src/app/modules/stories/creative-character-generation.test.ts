import assert from "node:assert/strict";
import test from "node:test";

import type { CreativeCharacterSnapshot } from "./creative-content.types";
import { charactersForImageGeneration } from "./creative-character-generation";

test("uses one primary reference per character without mutating the snapshot", () => {
  const characters = [character("richard", [3, 1, 2]), character("alex", [2, 1])];

  const selected = charactersForImageGeneration(characters);

  assert.deepEqual(
    selected.map((characterSnapshot) =>
      characterSnapshot.referenceImages.map((reference) => reference.order),
    ),
    [[1], [1]],
  );
  assert.deepEqual(
    characters.map((characterSnapshot) =>
      characterSnapshot.referenceImages.map((reference) => reference.order),
    ),
    [[3, 1, 2], [2, 1]],
  );
});

function character(
  id: string,
  referenceOrders: number[],
): CreativeCharacterSnapshot {
  return {
    id,
    name: id,
    description: `${id} identity reference`,
    referenceImages: referenceOrders.map((order) => ({
      id: `${id}-${order}`,
      objectKey: `${id}/${order}.png`,
      fileName: `${order}.png`,
      contentType: "image/png",
      fileSize: 100,
      order,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    })),
  };
}
