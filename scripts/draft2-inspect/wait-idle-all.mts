import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import { setTimeout as wait } from "node:timers/promises";
nextEnv.loadEnvConfig(process.cwd(), true);
const sql = neon(process.env.DATABASE_URL!);
// Read-only: wait until no Draft 2 step is alive (running with a heartbeat in the last 150 s, or paused moments ago, about to continue).
const deadline = Date.now() + 45 * 60_000;
let last = "";
while (Date.now() < deadline) {
  const rows = await sql`select id, step, status, visual->>'status' as visual_status,
    jsonb_array_length(coalesce(visual->'rounds','[]'::jsonb)) as visual_rounds,
    round(extract(epoch from now() - updated_at)) as age
    from draft2_sessions
    where (status = 'running' or opening->>'status' in ('running', 'paused') or closing->>'status' in ('running', 'paused')
      or deck->>'status' in ('running', 'paused') or inventory->>'status' = 'running' or visual->>'status' in ('running', 'paused'))
      and updated_at > now() - interval '150 seconds'`;
  const state = rows.map((row) => `${String(row.id).slice(0, 8)} ${row.step} ${row.status}/${row.visual_status} visual rounds=${row.visual_rounds}`).join("; ");
  if (state !== last) console.log(new Date().toISOString(), state || "idle");
  last = state;
  if (rows.length === 0) {
    const [latest] = await sql`select id, step, status, error, visual->>'status' as visual_status, visual->>'winnerId' as winner,
      jsonb_array_length(coalesce(visual->'rounds','[]'::jsonb)) as visual_rounds, updated_at
      from draft2_sessions order by updated_at desc limit 1`;
    console.log("IDLE", JSON.stringify(latest));
    process.exit(0);
  }
  await wait(15_000);
}
console.log("TIMEOUT still busy:", last);
