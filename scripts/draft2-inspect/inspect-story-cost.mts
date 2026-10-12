// Read-only: what one story cost: text calls from the ledger (by step and model), fal.ai images from the Draft 2 sessions (by run), and v1 spend if any.
import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
nextEnv.loadEnvConfig(process.cwd(), true);
const sql = neon(process.env.DATABASE_URL!);
const storyId = process.argv[2];
const usd = (micros: number) => (micros / 1e6).toFixed(2);
const text = await sql`select operation, model, count(*) as calls, sum(coalesce(charged_micros, reserved_micros)) as micros, min(created_at) as first, max(created_at) as last from creative_text_calls where story_id = ${storyId} group by 1, 2 order by 4 desc`;
let textTotal = 0, draft2Text = 0, v1Text = 0;
console.log("text calls by operation and model:");
for (const row of text) {
  const micros = Number(row.micros); textTotal += micros; if (String(row.operation).startsWith("draft2")) draft2Text += micros; else v1Text += micros;
  console.log(`  ${row.operation} · ${row.model} · ${row.calls} calls · $${usd(micros)}`);
}
const span = await sql`select min(created_at) as first, max(created_at) as last from creative_text_calls where story_id = ${storyId}`;
console.log(`text total $${usd(textTotal)} (draft2 $${usd(draft2Text)}, v1 $${usd(v1Text)}) · from ${span[0].first} to ${span[0].last}`);
const byStep = await sql`select regexp_replace(operation, '^draft2_|_review$|_shadow$', '', 'g') as step, sum(case when operation like '%_review%' then coalesce(charged_micros, reserved_micros) else 0 end) as judge, sum(case when operation not like '%_review%' then coalesce(charged_micros, reserved_micros) else 0 end) as writer from creative_text_calls where story_id = ${storyId} and operation like 'draft2%' group by 1 order by 1`;
console.log("draft2 text by step (writer / judge):");
for (const row of byStep) console.log(`  ${row.step}: $${usd(Number(row.writer))} / $${usd(Number(row.judge))}`);
const sessions = await sql`select id, created_at, step, status, images, trace from draft2_sessions where story_id = ${storyId} order by created_at`;
type Attempt = { kind: string; status: string; costMicros?: number };
type Run = { runId: string; status: string; startedAt: string; slides: { attempts: Attempt[] }[]; previousRuns?: Run[] };
let imagesTotal = 0, traceTotal = 0;
console.log(`sessions: ${sessions.length}`);
for (const session of sessions) {
  const trace = (session.trace ?? []) as { costMicros?: number }[];
  const traced = trace.reduce((sum, entry) => sum + (entry.costMicros ?? 0), 0); traceTotal += traced;
  console.log(`  ${String(session.id).slice(0, 8)} · ${new Date(session.created_at as string).toISOString().slice(0, 16)} · ${session.step}/${session.status} · trace text $${usd(traced)} over ${trace.length} calls`);
  const images = session.images as Run | null;
  for (const run of images ? [images, ...(images.previousRuns ?? [])] : []) {
    const attempts = run.slides.flatMap((slide) => slide.attempts);
    const cost = attempts.reduce((sum, attempt) => sum + (attempt.costMicros ?? 0), 0); imagesTotal += cost;
    const generated = attempts.filter((attempt) => attempt.status === "generated").length, failed = attempts.filter((attempt) => attempt.status === "failed").length;
    console.log(`     images run ${run.runId.slice(0, 8)} · ${run.status} · ${run.startedAt.slice(11, 16)} · ${generated} generated, ${failed} failed · $${usd(cost)}`);
  }
}
console.log(`\nTOTAL story: text $${usd(textTotal)} + images $${usd(imagesTotal)} = $${usd(textTotal + imagesTotal)}  (trace-based text $${usd(traceTotal)})`);
