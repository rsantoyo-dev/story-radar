/** Idempotent one-time assignment of the existing default workspace to a registered user.
 * Usage: node --env-file=.env.local --import tsx scripts/seed-workspace-owner.mts owner@example.com
 */
import { neon } from "@neondatabase/serverless";
import { membershipIdentity } from "../src/app/modules/auth/personal-workspace";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes("@")) throw new Error("Pass the registered owner's email address.");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not configured; no changes were made.");
const sql = neon(url);
const users = await sql`SELECT id FROM users WHERE lower(email) = ${email} LIMIT 1`;
const userId = users[0]?.id;
if (typeof userId !== "string") throw new Error("No registered user has this email; no user was created.");
const workspaces = await sql`SELECT id FROM workspaces WHERE id = 'default' LIMIT 1`;
if (!workspaces.length) throw new Error("The existing default workspace was not found.");
await sql`INSERT INTO workspace_members (id, workspace_id, user_id, role)
  VALUES (${membershipIdentity("default", userId)}, 'default', ${userId}, 'owner')
  ON CONFLICT (workspace_id, user_id) DO NOTHING`;
console.log("Existing default workspace owner membership is present.");
