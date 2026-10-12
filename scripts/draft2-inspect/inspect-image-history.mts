// Read-only: the session's current and previous images runs: id, status, start, and each slide's generated attempts.
import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
nextEnv.loadEnvConfig(process.cwd(), true);
const sql = neon(process.env.DATABASE_URL!);
const [row] = await sql`select images from draft2_sessions where id = ${process.argv[2]}`;
type Run = { runId: string; status: string; visualId: string; startedAt: string; updatedAt: string; error?: string; slides: { slide: string; attempts: { version: number; kind: string; status: string; sha256?: string; error?: string }[] }[]; previousRuns?: Run[] };
const images = row.images as Run;
for (const run of [images, ...(images.previousRuns ?? [])]) {
  console.log(`run ${run.runId.slice(0, 8)} · ${run.status} · visual ${run.visualId} · ${run.startedAt} → ${run.updatedAt} · ${run.error ?? "no error"}`);
  for (const slide of run.slides) console.log(`   ${slide.slide}: ${slide.attempts.map((a) => `v${a.version} ${a.kind} ${a.status}${a.sha256 ? " " + a.sha256.slice(0, 8) : ""}${a.error ? " ✗ " + a.error.slice(0, 60) : ""}`).join(" | ")}`);
}
