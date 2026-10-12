// Read-only: every issue and program finding of one funnel step's run, round by round, with details: inspect-step-issues.mts <sessionId> <step> [fromRound]
import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
nextEnv.loadEnvConfig(process.cwd(), true);
const sql = neon(process.env.DATABASE_URL!);
const [sessionId, step, from = "1"] = process.argv.slice(2);
if (!sessionId || !step) throw new Error("usage: inspect-step-issues.mts <sessionId> <step> [fromRound]");
const rows = await sql`select ${sql.unsafe(step)} as run from draft2_sessions where id = ${sessionId}`;
type Issue = { code: string; candidateId?: string; part?: string; detail: string; material?: boolean };
type Round = { round: number; candidates: { id: string; angle?: string; concept?: string }[]; mechanical?: Issue[]; evaluation?: { verdict: string; winnerId?: string; summary?: string; suggestions?: string[]; scores: ({ candidateId: string; overall: number } & Record<string, unknown>)[]; issues: Issue[] } };
const run = rows[0]?.run as { status: string; winnerId?: string; error?: string; rounds: Round[] } | null;
if (!run) { console.log("no run"); process.exit(0); }
console.log(`${step} · ${run.status} · winner ${run.winnerId} · ${run.error ?? ""}`);
for (const round of run.rounds.filter((entry) => entry.round >= Number(from))) {
  console.log(`\n== round ${round.round} · ${round.evaluation?.verdict ?? "unjudged"} → ${round.evaluation?.winnerId ?? "-"}`);
  for (const candidate of round.candidates) console.log(`   ${candidate.id}: ${(candidate.concept ?? candidate.angle ?? "").slice(0, 140)}`);
  for (const score of round.evaluation?.scores ?? []) console.log(`   score ${score.candidateId}: ${Object.entries(score).filter(([key]) => !["candidateId", "note"].includes(key)).map(([key, value]) => `${key} ${value}`).join(" ")} · ${String(score.note ?? "").slice(0, 160)}`);
  for (const finding of round.mechanical ?? []) console.log(`   PROGRAM ${finding.candidateId ?? "-"} ${finding.part ?? ""} ${finding.code}: ${finding.detail.slice(0, 220)}`);
  for (const issue of round.evaluation?.issues ?? []) console.log(`   judge ${issue.candidateId ?? "-"} ${issue.part ?? ""} ${issue.code}${issue.material ? " MATERIAL" : ""}: ${issue.detail.slice(0, 220)}`);
  if (round.evaluation?.summary) console.log(`   summary: ${round.evaluation.summary.slice(0, 300)}`);
  for (const suggestion of round.evaluation?.suggestions ?? []) console.log(`   suggest: ${suggestion.slice(0, 200)}`);
}
