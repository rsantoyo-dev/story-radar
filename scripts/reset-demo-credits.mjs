import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";

nextEnv.loadEnvConfig(process.cwd(), true);

const reasonIndex = process.argv.indexOf("--reason");
const reason = reasonIndex >= 0 ? process.argv[reasonIndex + 1]?.trim() : "";
const keyIndex = process.argv.indexOf("--key");
const key = keyIndex >= 0 ? process.argv[keyIndex + 1]?.trim() : `demo_reset:${randomUUID()}`;

if (!reason || !key || reason.startsWith("--") || key.startsWith("--")) {
  throw new Error("Usage: npm run credits:reset -- --reason 'Why this demo balance is reset' [--key stable-idempotency-key]");
}
if (!key.startsWith("demo_reset:")) throw new Error("The reset key must start with demo_reset:");
if (process.env.VERCEL || process.env.NODE_ENV === "production") {
  throw new Error("Demo credit reset is a local operator action only");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");

const query = neon(process.env.DATABASE_URL);
const rows = await query`SELECT reset_demo_credits(${key}, 'local-operator', ${reason}) AS balance`;
console.log(`Demo credits: ${Number(rows[0]?.balance) / 10_000} credits available. Reset key: ${key}`);
