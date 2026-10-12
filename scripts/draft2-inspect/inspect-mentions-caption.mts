// Read-only: for recent sessions with a caption, the mentions (version, statuses) vs what the caption followed and wrote. Handles are shown; no contact values.
import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
nextEnv.loadEnvConfig(process.cwd(), true);
const sql = neon(process.env.DATABASE_URL!);
const rows = await sql`select id, updated_at, mentions, caption, publication is not null as published from draft2_sessions where caption is not null order by updated_at desc limit 4`;
type Account = { id?: string; handle: string; name: string; status: string; source?: string; account?: { username: string; name?: string }; entityId?: string };
type Mentions = { status: string; version?: number; accounts: Account[]; searchedAt?: string; updatedAt?: string };
type Candidate = { id: string; text?: string; caption?: string; hashtags?: string[]; mentions?: string[] };
type Round = { round: number; candidates: Candidate[]; mechanical?: { candidateId?: string; code: string; detail?: string }[]; evaluation?: { verdict: string; winnerId?: string } };
type Caption = { status?: string; mentionsVersion?: number; mentions?: { name: string; handle: string }[]; rounds?: Round[]; winnerId?: string; bestId?: string; editorChoiceId?: string; startedAt?: string; finishedAt?: string; updatedAt?: string; notes?: string[]; previousRuns?: unknown[] };
for (const row of rows) {
  const mentions = row.mentions as Mentions | null;
  const caption = row.caption as Caption;
  console.log(`\nsession ${String(row.id).slice(0, 8)} updated ${new Date(row.updated_at as string).toISOString()} published ${row.published}`);
  console.log(`  mentions: status ${mentions?.status} version ${mentions?.version} searched ${mentions?.searchedAt ?? "?"} updated ${mentions?.updatedAt ?? "?"}`);
  for (const account of mentions?.accounts ?? []) console.log(`    ${account.id ?? "-"} @${account.handle} → ${account.account ? `@${account.account.username}` : "(no account)"} · ${account.status} · source ${account.source ?? "?"} · ${account.name}`);
  console.log(`  caption: status ${caption.status} mentionsVersion ${caption.mentionsVersion} followed [${(caption.mentions ?? []).map((m) => m.handle).join(", ")}] started ${caption.startedAt ?? "?"} finished ${caption.finishedAt ?? caption.updatedAt ?? "?"} rounds ${caption.rounds?.length ?? 0} previousRuns ${caption.previousRuns?.length ?? 0}`);
  console.log(`  caption keys: ${Object.keys(caption).join(", ")}`);
  const winnerId = caption.editorChoiceId ?? caption.winnerId ?? caption.bestId ?? caption.rounds?.at(-1)?.evaluation?.winnerId;
  const winner = caption.rounds?.flatMap((round) => round.candidates).find((candidate) => candidate.id === winnerId);
  const text = winner?.text ?? winner?.caption ?? JSON.stringify(winner)?.slice(0, 600);
  console.log(`  winner ${winnerId}: ${text?.replace(/\n/g, " ⏎ ").slice(0, 700)}`);
  console.log(`  winner keys: ${winner ? Object.keys(winner).join(", ") : "-"}; @ in text: ${(text?.match(/@[\w.]+/g) ?? []).join(", ") || "none"}`);
  for (const round of caption.rounds ?? []) for (const finding of round.mechanical ?? []) console.log(`    r${round.round} ${finding.candidateId ?? "-"} ${finding.code}: ${finding.detail ?? ""}`);
}
