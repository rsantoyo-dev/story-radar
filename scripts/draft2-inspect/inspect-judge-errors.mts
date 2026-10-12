// Read-only: how often a funnel step ended on a malformed judge or writer answer, and on which models.
import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
nextEnv.loadEnvConfig(process.cwd(), true);
const sql = neon(process.env.DATABASE_URL!);
const rows = await sql`select id, story_id, updated_at, step, status, error,
    opening->>'error' as opening_error, closing->>'error' as closing_error, deck->>'error' as deck_error, visual->>'error' as visual_error, caption->>'error' as caption_error
  from draft2_sessions order by updated_at desc limit 40`;
const patterns = /unknown candidate|returned none|malformed|did not return|is not a|schema|parse|invalid/i;
for (const row of rows) {
  const errors = [["session", row.error], ["opening", row.opening_error], ["closing", row.closing_error], ["deck", row.deck_error], ["visual", row.visual_error], ["caption", row.caption_error]]
    .filter(([, error]) => typeof error === "string" && patterns.test(error as string));
  for (const [where, error] of errors) console.log(`${String(row.id).slice(0, 8)} ${new Date(row.updated_at as string).toISOString().slice(0, 16)} ${where}: ${String(error).slice(0, 160)}`);
}
const trace = await sql`select s.id, e->>'step' as step, e->>'operation' as op, e->>'model' as model, e->>'note' as note, e->>'at' as at
  from draft2_sessions s, jsonb_array_elements(s.trace) e where e->>'outcome' = 'error' order by e->>'at' desc limit 30`;
console.log("\nfailed calls on traces:");
for (const row of trace) console.log(`  ${String(row.at).slice(0, 16)} ${String(row.id).slice(0, 8)} ${row.step}/${row.op} ${row.model}: ${String(row.note).slice(0, 140)}`);
