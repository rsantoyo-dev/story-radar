/**
 * Measures creative-pipeline quality across repeated runs.
 *
 * Single runs cannot tell you whether a change helped: observed hook scores
 * swung 89 -> 74 -> 78 across runs whose relevant code never changed. This
 * runs each story several times and reports the median and spread per
 * dimension, so a real improvement is distinguishable from model variance.
 *
 * It calls the real providers and spends real money. Nothing runs without
 * --confirm, and it prints the projected call count first.
 *
 *   npx tsx --env-file=.env.local scripts/creative-quality-bench.mts            # plan only
 *   npx tsx --env-file=.env.local scripts/creative-quality-bench.mts --confirm  # execute
 *
 * Options: --runs=N (default 3), --stories=id,id (default: the fixtures below),
 *          --json=path to write raw per-run results,
 *          --writer=<model> to write the script with an OpenAI model instead of
 *          Gemini (overrides CREATIVE_CAROUSEL_WRITER_MODEL for this run).
 */
import { readFileSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { neon } from "@neondatabase/serverless";

// "server-only" is a Next.js bundler marker, not an installed package, so any
// real module load of a server module fails outside Next. Resolve it to an
// empty module for this process; nothing here runs in a browser.
const loader = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = loader._load;
loader._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

type Scores = Record<string, number>;
type RunResult = {
  story: string;
  title: string;
  run: number;
  ok: boolean;
  verdict?: string;
  callsUsed?: number;
  seconds: number;
  scores?: Scores;
  issueCodes: string[];
  error?: string;
};

/** Stories with known, distinct editorial shapes; each has exposed a different defect. */
const DEFAULT_STORIES = [
  "dabd0533-d199-4a5b-99b7-bdcc0fac1c39", // gas prices: pure data, reader-consequence tension
  "cab59361-2438-42f4-b1d2-446677d2b1a4", // Laval counterfeit bills: allegations must stay allegations
];

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "true"] as const;
  }),
);
const runsPerStory = Number(args.get("runs") ?? 3);
const storyIds = (args.get("stories")?.split(",") ?? DEFAULT_STORIES).filter(Boolean);
const confirmed = args.get("confirm") === "true";

const localRequire = createRequire(process.cwd() + "/src/app/modules/stories/dummy.js");
const tsOptions = {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
};
const compile = (file: string) =>
  ts.transpileModule(readFileSync(`src/app/modules/stories/${file}`, "utf8"), tsOptions).outputText;

/**
 * Loads the pipeline with only the DB-backed metering stubbed out, so the
 * benchmark exercises the same generation, audit, repair and verify code the
 * app runs. Providers are real.
 */
function loadPipeline() {
  const shim = (id: string): unknown => {
    if (id === "server-only") return {};
    if (id === "./creative-text-meter") {
      return {
        meterCreativeText: async (_m: unknown, run: () => Promise<unknown>) => run(),
        withCreativeTextBudget: (_s: unknown, run: () => Promise<unknown>) => run(),
      };
    }
    return localRequire(id);
  };
  const sandbox = {
    Error, AbortController, AbortSignal, Buffer, Date, Map, Set, JSON,
    setTimeout, clearTimeout, console, process, fetch, URL, TextEncoder, TextDecoder,
  };
  const gemini: Record<string, unknown> = {};
  vm.runInNewContext(compile("gemini-creative-content-generator.ts"), { exports: gemini, ...sandbox, require: shim });
  const generator: Record<string, unknown> = {};
  vm.runInNewContext(compile("creative-single-shot-generator.ts"), {
    exports: generator, ...sandbox,
    require: (id: string) => (id === "./gemini-creative-content-generator" ? gemini : shim(id)),
  });
  const editorial: Record<string, unknown> = {};
  vm.runInNewContext(compile("creative-single-shot-editorial.ts"), {
    exports: editorial, ...sandbox,
    require: (id: string) =>
      id === "./gemini-creative-content-generator" ? gemini
      : id === "./creative-single-shot-generator" ? generator
      : shim(id),
  });
  return editorial.runSingleShotCreativePipeline as (options: unknown) => Promise<{
    draft: { qualityReview?: { scores?: Scores; issues?: { code: string }[] }; singleShotRun?: { verdict?: string; callsUsed?: number } };
  }>;
}

const sql = neon(process.env.DATABASE_URL!);

async function loadStoryContext(storyId: string) {
  const [story] = (await sql.query(
    "select title, canonical_url, content_text, content_status from stories where id = $1",
    [storyId],
  )) as { title: string; canonical_url: string; content_text: string; content_status: string }[];
  if (!story) throw new Error(`story ${storyId} not found`);
  const [link] = (await sql.query("select topic_id from topic_stories where story_id = $1 limit 1", [storyId])) as {
    topic_id: string;
  }[];
  if (!link) throw new Error(`story ${storyId} has no topic`);
  const [profileRow] = (await sql.query("select * from creative_profiles where topic_id = $1 limit 1", [
    link.topic_id,
  ])) as Record<string, unknown>[];
  const [topicRow] = (await sql.query("select name from topics where id = $1", [link.topic_id])) as { name: string }[];
  const [tax] = (await sql.query(
    "select taxonomy_version, lenses from topic_acquisition_lenses where topic_id = $1 order by created_at desc limit 1",
    [link.topic_id],
  )) as { taxonomy_version: number; lenses: unknown }[];

  return {
    title: story.title,
    story: {
      title: story.title, url: story.canonical_url, text: story.content_text,
      contentStatus: story.content_status, contentSource: "article",
    },
    topic: { name: topicRow?.name ?? "topic" },
    profile: {
      name: profileRow.name, language: profileRow.language, region: profileRow.region,
      platform: profileRow.platform, audience: profileRow.audience,
      brandPersonality: profileRow.brand_personality, formality: profileRow.formality,
      humor: profileRow.humor, energy: profileRow.energy, optimism: profileRow.optimism,
      provocation: profileRow.provocation, allowEmojis: profileRow.allow_emojis,
      maxEmojis: profileRow.max_emojis, callToActionStyle: profileRow.call_to_action_style,
      conversionGoal: profileRow.conversion_goal, framingStrategy: profileRow.framing_strategy,
      requireCoverTitle: profileRow.require_cover_title, storyStructure: profileRow.story_structure,
      visualGuidance: profileRow.visual_guidance, brandOverlay: profileRow.brand_overlay ?? { enabled: false },
    },
    acquisitionTaxonomy: { taxonomyVersion: tax?.taxonomy_version ?? 1, lenses: tax?.lenses ?? [] },
  };
}

function median(values: number[]): number {
  if (!values.length) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

async function main() {
  const totalRuns = storyIds.length * runsPerStory;
  console.log(`stories: ${storyIds.length} x ${runsPerStory} runs = ${totalRuns} pipeline runs`);
  console.log(`each run costs roughly 3-7 provider calls, so expect ~${totalRuns * 3}-${totalRuns * 7} calls.`);
  if (!confirmed) {
    console.log("\nDry run. Re-run with --confirm to execute and spend real credits.");
    return;
  }

  const run = loadPipeline();
  const results: RunResult[] = [];

  for (const storyId of storyIds) {
    const context = await loadStoryContext(storyId);
    for (let attempt = 1; attempt <= runsPerStory; attempt++) {
      const started = Date.now();
      const label = `${context.title.slice(0, 48)} [run ${attempt}/${runsPerStory}]`;
      try {
        const result = await run({
          apiKey: process.env.GEMINI_API_KEY,
          paidGeminiApiKey: process.env.GEMINI_PAID_API_KEY,
          model: process.env.CREATIVE_GEMINI_MODEL ?? "gemini-3.8-flash",
          primaryProvider: "google",
          ...context,
          format: "carousel",
          outputAspectRatio: "4:5",
          characterRoster: [],
          // Set CREATIVE_CAROUSEL_WRITER_MODEL to hand the script to an OpenAI
          // writer instead of Gemini; --writer=<model> overrides it per run so
          // the two can be compared without editing .env.local.
          carouselWriterModel: args.get("writer") ?? process.env.CREATIVE_CAROUSEL_WRITER_MODEL,
          openAiApiKey: process.env.OPENAI_API_KEY,
          openAiEditorialModels: {
            criticModel: process.env.CREATIVE_CRITIC_MODEL ?? "gpt-5.6-terra",
            minorRepairModel: process.env.CREATIVE_MINOR_REPAIR_MODEL ?? "gpt-5.6-luna",
            structuralRepairModel: process.env.CREATIVE_STRUCTURAL_REPAIR_MODEL ?? "gpt-5.6-terra",
            severeRepairModel: process.env.CREATIVE_SEVERE_REPAIR_MODEL ?? "gpt-5.6-sol",
          },
          deadline: Date.now() + 480_000,
          checkpoint: async () => {},
        });
        const review = result.draft.qualityReview;
        results.push({
          story: storyId, title: context.title, run: attempt, ok: true,
          verdict: result.draft.singleShotRun?.verdict,
          callsUsed: result.draft.singleShotRun?.callsUsed,
          seconds: Math.round((Date.now() - started) / 1000),
          scores: review?.scores,
          issueCodes: (review?.issues ?? []).map((issue) => issue.code),
        });
        console.log(`  ok   ${label} -> ${result.draft.singleShotRun?.verdict}, overall ${review?.scores?.overall}`);
      } catch (error) {
        results.push({
          story: storyId, title: context.title, run: attempt, ok: false,
          seconds: Math.round((Date.now() - started) / 1000), issueCodes: [],
          error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
        });
        console.log(`  FAIL ${label} -> ${error instanceof Error ? error.message.slice(0, 90) : "unknown"}`);
      }
    }
  }

  console.log("\n=== median scores per story (spread in brackets) ===");
  const dimensions = ["factuality", "hook", "curiosity", "swipeReward", "continuity", "relevance", "clarity", "resolution", "cta", "overall"];
  for (const storyId of storyIds) {
    const rows = results.filter((r) => r.story === storyId && r.scores);
    if (!rows.length) { console.log(`${storyId}: no successful runs`); continue; }
    console.log(`\n${rows[0]!.title.slice(0, 60)}  (${rows.length}/${runsPerStory} ok)`);
    for (const dimension of dimensions) {
      const values = rows.map((r) => r.scores![dimension]!).filter((v) => typeof v === "number");
      if (!values.length) continue;
      const spread = `${Math.min(...values)}-${Math.max(...values)}`;
      console.log(`  ${dimension.padEnd(12)} median ${String(median(values)).padStart(5)}   [${spread}]`);
    }
    const verdicts = rows.map((r) => r.verdict ?? "?");
    console.log(`  verdicts: ${verdicts.join(", ")}`);
  }

  console.log("\n=== most frequent findings ===");
  const counts = new Map<string, number>();
  for (const row of results) for (const code of row.issueCodes) counts.set(code, (counts.get(code) ?? 0) + 1);
  for (const [code, count] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${String(count).padStart(3)}x  ${code}`);
  }

  const failures = results.filter((r) => !r.ok);
  if (failures.length) console.log(`\n${failures.length}/${results.length} runs failed outright.`);

  const jsonPath = args.get("json");
  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify(results, null, 2));
    console.log(`\nraw results -> ${jsonPath}`);
  }
}

await main();
