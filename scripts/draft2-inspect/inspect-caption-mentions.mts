import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import { confirmedMentions } from "../../src/app/modules/draft2/draft2-mentions.types";
nextEnv.loadEnvConfig(process.cwd(), true);
const sql = neon(process.env.DATABASE_URL!);
// Read-only: the accounts the caption tagged against the accounts confirmed now.
const [s] = await sql`select caption, mentions from draft2_sessions where id = ${process.argv[2]}`;
console.log("caption written for:", JSON.stringify(s.caption?.mentions), "| mentions version then:", s.caption?.mentionsVersion);
console.log("confirmed now:", JSON.stringify(confirmedMentions(s.mentions)), "| mentions version now:", s.mentions?.version, "| updated", s.mentions?.updatedAt);
for (const account of s.mentions?.accounts ?? []) console.log(`  ${account.status.padEnd(9)} @${account.handle} · ${account.name} · ${account.source}${account.decidedAt ? " · decided " + account.decidedAt : ""}`);
const chosenId = s.caption?.editorChoiceId ?? s.caption?.winnerId;
const chosen = (s.caption?.rounds ?? []).flatMap((round: { candidates: { id: string; text: string }[] }) => round.candidates).filter((c: { id: string }) => c.id === chosenId).at(-1);
console.log("\nchosen caption", chosenId, "tags:", [...(chosen?.text ?? "").matchAll(/@([A-Za-z0-9._]+)/g)].map((m) => m[0]).join(" "));
