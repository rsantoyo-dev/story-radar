// Read-only: the people-and-places inventory of one session: each entity, its kind, and whether a place was matched or verified.
import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
nextEnv.loadEnvConfig(process.cwd(), true);
const sql = neon(process.env.DATABASE_URL!);
const [row] = await sql`select inventory from draft2_sessions where id = ${process.argv[2]}`;
const inventory = row.inventory as { status: string; version: number; entities: Record<string, unknown>[]; storyPhotos?: unknown[] };
console.log(`inventory ${inventory.status} v${inventory.version} · entities ${inventory.entities.length} · story photos ${inventory.storyPhotos?.length ?? 0}`);
for (const entity of inventory.entities) {
  const { id, name, kind, role, place, match, decision, verified, photo, status } = entity as Record<string, unknown>;
  const placeInfo = place && typeof place === "object" ? JSON.stringify(place).slice(0, 160) : String(place ?? "-");
  console.log(`  ${id} ${kind}${role ? `/${role}` : ""} · ${name} · match ${JSON.stringify(match ?? null)?.slice(0, 120)} · decision ${JSON.stringify(decision ?? null)} · verified ${JSON.stringify(verified ?? null)} · status ${JSON.stringify(status ?? null)} · photo ${photo ? "yes" : "no"} · place ${placeInfo}`);
}
console.log("entity keys:", Object.keys(inventory.entities[0] ?? {}).join(", "));
