import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
nextEnv.loadEnvConfig(process.cwd(), true);
const sql = neon(process.env.DATABASE_URL!);
// Read-only: any Draft 2 step running, paused, or touched in the last 5 minutes?
const rows = await sql`select id, step, status, round(extract(epoch from now() - updated_at)) as age_seconds,
  opening->>'status' as opening, closing->>'status' as closing, deck->>'status' as deck, inventory->>'status' as inventory, visual->>'status' as visual,
  images->>'status' as images, mentions->>'status' as mentions, caption->>'status' as caption
  from draft2_sessions
  where status = 'running' or updated_at > now() - interval '5 minutes'
    or opening->>'status' in ('running', 'paused') or closing->>'status' in ('running', 'paused') or deck->>'status' in ('running', 'paused')
    or inventory->>'status' = 'running' or visual->>'status' in ('running', 'paused') or images->>'status' in ('running', 'paused')
    or mentions->>'status' = 'running' or caption->>'status' in ('running', 'paused')
  order by updated_at desc limit 8`;
console.log(JSON.stringify(rows, null, 1));
