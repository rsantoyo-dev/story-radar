/**
 * Live check of the official MTMD road-map match for one story, with no paid
 * provider involved: it reads the story (and its latest creative brief, when
 * one exists) from the database, fetches the ministry's WFS feed and reports
 * exactly what prepare-road-map.ts would decide — the signals read from the
 * facts, the reason, and the matched work site. With --render it also draws
 * the map the way the asset pipeline would (one public Overpass query).
 *
 * The feed lists closures night by night, so a press release issued days
 * ahead of its closure reports "windows do not cover … yet" until then; rerun
 * closer to the date. When the story has no brief, the whole story text
 * stands in for the key facts, which is a superset of what the pipeline
 * will see: a match here means the signals exist, not that a brief will
 * necessarily cite them all.
 *
 *   npx tsx --env-file=.env.local scripts/road-map-check.mts <storyId>
 *   npx tsx --env-file=.env.local scripts/road-map-check.mts <storyId> --render /tmp/map.png
 *   npx tsx scripts/road-map-check.mts --url <official url> --text <file.txt> [--render out.png]
 *   npx tsx scripts/road-map-check.mts --row 172650 --render /tmp/map.png   # draw one live WFS row, no matching
 */
import { readFileSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { neon } from "@neondatabase/serverless";
import { ROAD_DATA_URL, hasRoadNoticeRecord, isOfficialRoadNoticeSource, matchRoadSegment, roadNoticeSignals } from "../src/app/modules/stories/quebec-road-map";
import type { CreativeKeyFact } from "../src/app/modules/stories/creative-content.types";

const args = process.argv.slice(2);
const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const storyId = args.find(a => /^[0-9a-f-]{36}$/.test(a));
const renderTo = option("--render");

let url: string, title: string, facts: CreativeKeyFact[], factSource: string;
const row = option("--row");
if (row) {
  // Visual QA of the renderer for any active notice: no story, no matching.
  url = ROAD_DATA_URL; title = `WFS row ${row}`; facts = []; factSource = "none (row render)";
} else if (storyId) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (use --env-file=.env.local)");
  const sql = neon(process.env.DATABASE_URL);
  const [story] = await sql`SELECT title, canonical_url, content_text FROM stories WHERE id = ${storyId}::uuid`;
  if (!story) throw new Error(`Story ${storyId} not found`);
  const [brief] = await sql`SELECT id, created_at, key_facts FROM story_creative_briefs WHERE story_id = ${storyId}::uuid ORDER BY created_at DESC LIMIT 1`;
  url = story.canonical_url; title = story.title;
  if (brief) {
    facts = (brief.key_facts as CreativeKeyFact[]).map(f => ({ id: f.id, statement: f.statement, sourceExcerpt: f.sourceExcerpt }));
    factSource = `latest brief ${brief.id} (${String(brief.created_at).slice(0, 10)}), ${facts.length} key facts — what the pipeline uses`;
  } else {
    facts = [{ id: "story", statement: story.title, sourceExcerpt: story.content_text }];
    factSource = "no brief yet: title + full story text (a superset of any future brief's facts)";
  }
} else if (option("--url") && option("--text")) {
  url = option("--url")!; const text = readFileSync(option("--text")!, "utf8"); title = text.split("\n")[0];
  facts = [{ id: "text", statement: title, sourceExcerpt: text }]; factSource = `file ${option("--text")}`;
} else {
  throw new Error("Usage: road-map-check.mts <storyId> [--render out.png] | --url <url> --text <file> [--render out.png]");
}

console.log(`Story: ${title}\nSource: ${url}\nFacts: ${factSource}`);
const official = row ? true : isOfficialRoadNoticeSource(new URL(url));
if (!row) {
  console.log(`Official road-notice source: ${official ? "yes" : "NO — the adapter will not run for this source"}`);
  const tabular = hasRoadNoticeRecord(facts);
  console.log(`Evidence type: ${tabular ? "511 notice record (exact dates)" : "prose notice (work-site match)"}`);
  if (!tabular) {
    const signals = roadNoticeSignals(facts);
    console.log(`Signals — routes+direction: ${signals.routes.map(r => r.join(" ")).join(", ") || "none"} · window: ${signals.window ? `${signals.window.start} → ${signals.window.end}` : "none"} · closure: ${signals.closure ?? "unspecified"}`);
  }
}

const response = await fetch(ROAD_DATA_URL, { signal: AbortSignal.timeout(25_000) });
if (!response.ok) throw new Error(`WFS responded ${response.status}`);
const body = await response.text();
if (body.length > 8_000_000) throw new Error("WFS response too large");
const data = JSON.parse(body) as { numberMatched?: number; features: { properties: Record<string, string>; geometry: { type: string; coordinates: number[][] } }[] };
console.log(`WFS: ${data.numberMatched} active records`);

type Segment = NonNullable<ReturnType<typeof matchRoadSegment>["segment"]>;
let s: Segment;
if (row) {
  const feature = data.features.find(f => f.properties.identifiant === row);
  if (!feature || feature.geometry.type !== "LineString") throw new Error(`Row ${row} is not an active LineString notice`);
  const p = feature.properties;
  s = { id: p.identifiant, chantier: p.identifiantChantier, route: p.routeAutoroute, location: p.localisation, direction: p.direction, start: p.debut, end: p.fin, updated: p.miseAJour, coordinates: feature.geometry.coordinates, entrave: p.entrave?.trim() || undefined, detour: p.detoursEtItinerairesFacultatifs?.trim() || undefined };
  console.log("\nResult: row selected directly (no matching)");
} else {
  const match = matchRoadSegment(data, facts);
  console.log(`\nResult: ${match.reason}`);
  if (!match.segment) process.exit(official ? 0 : 1);
  s = match.segment;
}
console.log(`Row ${s.id}${s.chantier ? ` · work site ${s.chantier}` : ""} · route ${s.route} ${s.direction}\n${s.location}\n${s.start} → ${s.end} (updated ${s.updated}) · ${s.coordinates.length} points${s.entrave ? `\n${s.entrave}` : ""}${s.detour ? ` · Détour : ${s.detour}` : ""}`);

if (renderTo) {
  // Same harness as creative-schema-check.mts: the renderer is server-only.
  const loader = Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
  const originalLoad = loader._load;
  loader._load = function patchedLoad(request, parent, isMain) { return request === "server-only" ? {} : originalLoad.call(this, request, parent, isMain); };
  const localRequire = createRequire(process.cwd() + "/src/app/modules/stories/dummy.js");
  const compiled = ts.transpileModule(readFileSync("src/app/modules/stories/open-map-render.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const render: Record<string, unknown> = {};
  vm.runInNewContext(compiled, {
    exports: render, Error, AbortSignal, Buffer, Date, Map, Set, JSON, Promise, URL, console, process,
    require: (id: string) => {
      if (id === "server-only") return {};
      // The DNS guard only matters for a private Overpass endpoint; the check uses the public one.
      if (id === "../sources/rss/fetch-rss-feed") return { lookupPublicAddress: undefined };
      if (id === "./creative-documentary") return { record: (v: unknown) => v !== null && typeof v === "object" && !Array.isArray(v) };
      if (id === "./creative-documentary-render") return { escapeDocumentaryText: (v: string) => v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;") };
      return localRequire(id);
    },
  });
  const legend = [s.entrave, s.detour ? `Détour : ${s.detour}` : ""].filter(Boolean).join(" · ");
  const renderOpenMap = render.renderOpenMap as (t: unknown) => Promise<Buffer>;
  const png = await renderOpenMap({ kind: "line", name: s.location, points: s.coordinates, ...(legend ? { legend } : {}) });
  writeFileSync(renderTo, png);
  console.log(`\nRendered ${renderTo} (${png.length} bytes) — legend: ${legend || "none"}`);
}
