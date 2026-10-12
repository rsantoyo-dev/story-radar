// Read-only: what Draft 2 has cost so far on the text ledger, by day, provider/model and step; and how many stories/sessions.
import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
nextEnv.loadEnvConfig(process.cwd(), true);
const sql = neon(process.env.DATABASE_URL!);
const columns = await sql`select column_name from information_schema.columns where table_name = 'creative_text_calls' order by ordinal_position`;
console.log("creative_text_calls columns:", columns.map((c) => c.column_name).join(", "));
const tables = await sql`select table_name from information_schema.tables where table_schema = 'public' and (table_name like '%image%' or table_name like '%creative%' or table_name like '%spend%' or table_name like '%ledger%') order by 1`;
console.log("related tables:", tables.map((t) => t.table_name).join(", "));
const total = await sql`select count(*) as calls, count(distinct story_id) as stories, round(sum(coalesce(charged_micros, reserved_micros)) / 1e6, 2) as usd, min(created_at) as first, max(created_at) as last from creative_text_calls where operation like 'draft2%'`;
console.log("draft2 text total:", JSON.stringify(total[0]));
const byDay = await sql`select (created_at at time zone 'America/Toronto')::date as day, count(*) as calls, count(distinct story_id) as stories, round(sum(coalesce(charged_micros, reserved_micros)) / 1e6, 2) as usd from creative_text_calls where operation like 'draft2%' group by 1 order by 1`;
for (const row of byDay) console.log("  day", JSON.stringify(row));
const hasModel = columns.some((c) => c.column_name === "model");
const hasProvider = columns.some((c) => c.column_name === "provider");
if (hasModel || hasProvider) {
  const byModel = hasModel
    ? await sql`select model, count(*) as calls, round(sum(coalesce(charged_micros, reserved_micros)) / 1e6, 2) as usd from creative_text_calls where operation like 'draft2%' group by 1 order by 3 desc`
    : await sql`select provider as model, count(*) as calls, round(sum(coalesce(charged_micros, reserved_micros)) / 1e6, 2) as usd from creative_text_calls where operation like 'draft2%' group by 1 order by 3 desc`;
  for (const row of byModel) console.log("  model", JSON.stringify(row));
}
const byOp = await sql`select operation, count(*) as calls, round(sum(coalesce(charged_micros, reserved_micros)) / 1e6, 2) as usd from creative_text_calls where operation like 'draft2%' group by 1 order by 3 desc limit 14`;
for (const row of byOp) console.log("  op", JSON.stringify(row));
const v1 = await sql`select count(*) as calls, count(distinct story_id) as stories, round(sum(coalesce(charged_micros, reserved_micros)) / 1e6, 2) as usd from creative_text_calls where operation not like 'draft2%' and created_at > now() - interval '3 days'`;
console.log("v1 text last 3 days:", JSON.stringify(v1[0]));
const sessions = await sql`select count(*) as sessions, count(distinct story_id) as stories from draft2_sessions`;
console.log("draft2 sessions:", JSON.stringify(sessions[0]));
