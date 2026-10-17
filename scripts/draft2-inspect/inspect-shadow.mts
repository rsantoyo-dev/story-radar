import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
nextEnv.loadEnvConfig(process.cwd(), true);
const sql = neon(process.env.DATABASE_URL!);
// Read-only: the shadow judgments stored before 2026-10-16 (the shadow was removed with v3; see draft2-v3.md) beside the real ones, round by round and per step:
// the same winner or not, the best score's difference, the verdicts, and the judge's time at each setting. Usage: npx tsx scripts/draft2-inspect/inspect-shadow.mts [since YYYY-MM-DD]
const since = process.argv[2] ?? new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
type Score = { candidateId: string; overall: number };
type Shadow = { effort: string; model: string; durationMs: number; verdict?: string; winnerId?: string; scores?: Score[]; agrees?: boolean; error?: string };
type Round = { round: number; evaluation?: { verdict: string; winnerId: string; scores: Score[] }; shadow?: Shadow };
type Run = { rounds: Round[]; judge?: { model: string } } | null;
type Entry = { step: string; operation: string; round: number; outcome: string; durationMs: number; effort?: string };
type Row = { id: string; created_at: string; trace: Entry[] } & Record<"opening" | "closing" | "deck" | "visual" | "caption", Run>;
const rows = await sql`select id, created_at, opening, closing, deck, visual, caption, trace from draft2_sessions where created_at > ${since} order by created_at` as Row[];
const steps = ["opening", "closing", "deck", "visual", "caption"] as const;
const totals: Record<string, { rounds: number; agree: number; deltaSum: number; deltaN: number; realMs: number; realN: number; shadowMs: number; acceptReal: number; acceptShadow: number; failed: number }> = {};
const best = (scores: Score[] | undefined) => scores?.length ? Math.max(...scores.map((score) => score.overall)) : undefined;
for (const row of rows) {
  for (const step of steps) {
    const run = row[step];
    if (!run) continue;
    for (const round of run.rounds) {
      if (!round.shadow || !round.evaluation) continue;
      const total = totals[step] ??= { rounds: 0, agree: 0, deltaSum: 0, deltaN: 0, realMs: 0, realN: 0, shadowMs: 0, acceptReal: 0, acceptShadow: 0, failed: 0 };
      total.rounds++;
      if (round.shadow.agrees) total.agree++;
      if (round.shadow.error) total.failed++;
      total.shadowMs += round.shadow.durationMs;
      const real = row.trace.find((entry) => entry.step === step && entry.operation === `draft2_${step}_review` && entry.round === round.round && entry.outcome === "ok");
      if (real) { total.realMs += real.durationMs; total.realN++; }
      if (round.evaluation.verdict === "accept") total.acceptReal++;
      if (round.shadow.verdict === "accept") total.acceptShadow++;
      const realBest = best(round.evaluation.scores);
      const shadowBest = best(round.shadow.scores);
      if (realBest !== undefined && shadowBest !== undefined) { total.deltaSum += shadowBest - realBest; total.deltaN++; }
      const shadowText = round.shadow.error
        ? `FAILED ${round.shadow.error.slice(0, 60)}`
        : `${round.shadow.verdict} ${round.shadow.winnerId} best ${shadowBest ?? "?"} ${Math.round(round.shadow.durationMs / 1000)}s ${round.shadow.agrees ? "AGREES" : "DIFFERS"}`;
      console.log(`${String(row.created_at).slice(0, 10)} ${String(row.id).slice(0, 8)} ${step.padEnd(8)} r${round.round} real ${run.judge?.model ?? "?"}@${real?.effort ?? "?"} ${round.evaluation.verdict} ${round.evaluation.winnerId} best ${realBest ?? "?"} ${real ? `${Math.round(real.durationMs / 1000)}s` : "?"} | shadow ${round.shadow.model}@${round.shadow.effort} ${shadowText}`);
    }
  }
}
console.log(`\nsince ${since}:`);
for (const [step, total] of Object.entries(totals)) {
  const perRound = (ms: number, n: number) => n ? `${(ms / 1000 / n).toFixed(0)}s` : "?";
  console.log(`  ${step.padEnd(8)} rounds ${total.rounds} · same winner ${total.agree}/${total.rounds} · shadow best − real best ${total.deltaN ? (total.deltaSum / total.deltaN).toFixed(1) : "?"} on average · accepts real ${total.acceptReal}, shadow ${total.acceptShadow} · judge time per round real ${perRound(total.realMs, total.realN)}, shadow ${perRound(total.shadowMs, total.rounds)}${total.failed ? ` · shadow failed ${total.failed}` : ""}`);
}
if (!Object.keys(totals).length) console.log("  no shadow judgments since then: set DRAFT2_SHADOW_JUDGE_EFFORT (low | medium | high) or DRAFT2_SHADOW_JUDGE_MODEL in .env.local, run a story, and read this again");
