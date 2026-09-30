import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as aspectRatio from "./creative-aspect-ratio";
import * as quality from "./creative-quality";
import * as runErrors from "./creative-run-errors";
import type { GeneratedCreativeDraft } from "./creative-content.types";

const forecast = "Pic régional estimé : 3e semaine d’octobre";
const fact = {
  id: "park-fact",
  statement: "Le parc possède des sentiers de promenade.",
  sourceExcerpt: "Le parc possède des sentiers de promenade.",
};
const brief = {
  keyFacts: [fact],
  profileSnapshot: { language: "french" },
};
const draft = {
  id: "draft",
  storyId: "story",
  briefId: "brief",
  version: 8,
  status: "draft",
  format: "meme",
  provider: "google",
  outputAspectRatio: "4:5",
  concept: "Promenades d’automne",
  caption: "Une promenade au parc.",
  altText: "Un sentier dans le parc.",
  hashtags: [],
  units: [{
    id: "slide-1",
    order: 1,
    type: "meme-frame",
    role: "cover",
    headline: "Marcher au parc cet automne",
    body: `Les sentiers invitent à marcher. ${forecast}`,
    visualDirection: "Un sentier d’automne.",
    factIds: ["park-fact"],
    characterIds: [],
    storyReferences: [],
    assetRequest: "typography-only",
    aspectRatio: "4:5",
  }],
};

function service(repository: Record<string, unknown>) {
  const source = readFileSync(resolve("src/app/modules/stories/manage-creative-content.ts"), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  const dependencies: Record<string, unknown> = {
    "./creative-run-errors": runErrors,
    "./creative-aspect-ratio": aspectRatio,
    "./creative-quality": quality,
    "./creative-content.repository": {
      findCreativeDraftById: async () => draft,
      findCreativeBriefById: async () => brief,
      ...repository,
    },
    "./creative-characters.repository": {
      listCreativeCharacterRoster: async () => [],
      snapshotsForCreativeCharacterIds: async () => new Map(),
    },
    "./manage-story-photos": { resolveStoryReferences: async () => undefined },
    "./story-materials.types": { parseStoryReferences: () => [] },
    "./creative-assets.repository": { findLatestCreativeAssetBatch: async () => undefined },
    "./daily-draft-access": { getDailyDraftStory: async () => ({ storyId: "story" }) },
  };
  runInNewContext(code, {
    exports, Date, Map, Set, console,
    require: (name: string) => dependencies[name] ?? {},
  });
  return exports;
}

test("saving manual supporting text keeps an unsupported claim visible for review", async () => {
  let saved: GeneratedCreativeDraft | undefined;
  const editor = service({
    replaceCreativeDraft: async (_topic: unknown, _current: unknown, input: unknown) => {
      saved = input as GeneratedCreativeDraft;
      return input;
    },
  });

  await editor.saveCreativeDraft("topic", "draft", { ...draft, expectedVersion: 8 });
  assert.equal(saved?.units[0].body, draft.units[0].body);
  assert.ok(quality.deterministicCreativeQualityIssues(saved!, "meme", brief.keyFacts, "french")
    .some((issue) => issue.code === "UNSUPPORTED_NUMBER"));
});

test("approval rejects the saved unsupported claim without rewriting it", async () => {
  let approvals = 0;
  let replacements = 0;
  const editor = service({
    approveCreativeDraft: async () => { approvals++; },
    replaceCreativeDraft: async () => { replacements++; },
  });

  await assert.rejects(
    () => editor.approveSavedCreativeDraft("topic", "draft", true, 8),
    /Slide 1 uses 3 without support/,
  );
  assert.equal(approvals, 0);
  assert.equal(replacements, 0);
  assert.equal(draft.units[0].body, `Les sentiers invitent à marcher. ${forecast}`);
});
