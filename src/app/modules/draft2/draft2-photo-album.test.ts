import assert from "node:assert/strict";
import test from "node:test";
import { loadInSandbox } from "./draft2-test-sandbox";

test("a photo carousel's album reaches the planner and the writer as small previews in the album's order, each photo resolved on its own (a slide's references are three at most)", async () => {
  const resolved: string[][] = [];
  const mocks: Record<string, unknown> = {
    "server-only": {},
    sharp: { default: () => ({ rotate: () => ({ resize: () => ({ jpeg: () => ({ toBuffer: async () => Buffer.from("jpeg") }) }) }) }) },
    "../stories/manage-story-photos": {
      resolveStoryReferences: async (_topic: string, _story: string, selections: { id: string }[]) => { resolved.push(selections.map((selection) => selection.id)); return selections.map((selection) => ({ id: selection.id, name: selection.id })); },
      loadStoryReferenceImages: async (references: { id: string }[]) => references.map((reference) => new File([Buffer.from(reference.id)], `${reference.id}.png`, { type: "image/png" })),
    },
  };
  const exports = loadInSandbox("./draft2-photo-album.ts", mocks, { Buffer, File }) as { albumPreviews: (topicId: string, storyId: string, album: { id: string }[]) => Promise<string[]> };
  const previews = await exports.albumPreviews("t", "s", ["p1", "p2", "p3", "p4", "p5", "p6"].map((id) => ({ id })));
  assert.equal(JSON.stringify(resolved), JSON.stringify([["p1"], ["p2"], ["p3"], ["p4"], ["p5"], ["p6"]]), "one photo per resolution, in order");
  assert.equal(previews.length, 6);
  assert.ok(previews.every((preview) => preview === `data:image/jpeg;base64,${Buffer.from("jpeg").toString("base64")}`));
  // The sandbox's arrays are another realm's: compared by content.
  assert.equal(JSON.stringify(await exports.albumPreviews("t", "s", [])), "[]", "no album, no previews");
});
