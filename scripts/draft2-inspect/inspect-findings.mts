import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
nextEnv.loadEnvConfig(process.cwd(), true);
const sql = neon(process.env.DATABASE_URL!);
// Read-only: the program's findings on each funnel round of the latest sessions (or the sessions given), before and after the fix pass,
// with the length findings counted apart, to see whether the writers keep under their word limits.
// Usage: npx tsx scripts/draft2-inspect/inspect-findings.mts [sessionIdPrefix…]
const prefixes = process.argv.slice(2);
type Issue = { code: string };
type Round = { round: number; candidates: unknown[]; mechanical: Issue[]; fix?: { findingsBefore: number; findingsAfter: number; skipped?: string } };
type Run = { rounds: Round[] } | null;
const rows = await sql`select id, created_at, opening, closing, deck, visual, caption from draft2_sessions where opening is not null order by created_at desc limit 40`;
const chosen = (prefixes.length ? rows.filter((row) => prefixes.some((prefix) => String(row.id).startsWith(prefix))) : rows.slice(0, 4)).reverse();
const LENGTH = /TOO_LONG$/;
for (const row of chosen) {
  console.log(`=== ${String(row.id).slice(0, 8)} ${String(row.created_at).slice(0, 16)}`);
  let candidates = 0, before = 0, after = 0, lengthLeft = 0;
  for (const step of ["opening", "closing", "deck", "visual", "caption"] as const) {
    const run = row[step] as Run;
    for (const round of run?.rounds ?? []) {
      const codes: Record<string, number> = {};
      for (const issue of round.mechanical) codes[issue.code] = (codes[issue.code] ?? 0) + 1;
      const length = round.mechanical.filter((issue) => LENGTH.test(issue.code)).length;
      candidates += round.candidates.length; after += round.mechanical.length; lengthLeft += length;
      before += round.fix ? round.fix.findingsBefore : round.mechanical.length;
      const fix = round.fix ? `fix ${round.fix.findingsBefore}→${round.fix.findingsAfter}${round.fix.skipped ? ` (skipped: ${round.fix.skipped.slice(0, 40)})` : ""}` : "no fix";
      console.log(`  ${step.padEnd(8)} r${round.round} · ${String(round.candidates.length).padStart(2)} candidates · ${fix.padEnd(10)} · left ${round.mechanical.length}${length ? ` (${length} length)` : ""} ${Object.keys(codes).length ? JSON.stringify(codes) : ""}`);
    }
  }
  console.log(`  total: ${candidates} candidates · ${before} findings before the fix pass · ${after} after · ${lengthLeft} of them on length`);
}
