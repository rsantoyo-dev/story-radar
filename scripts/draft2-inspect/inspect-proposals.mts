import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
nextEnv.loadEnvConfig(process.cwd(), true);
const sql = neon(process.env.DATABASE_URL!);
// Read-only: since Luna judges (2026-10-11), where do the winners of each funnel step come from?
// A winner "descends from a proposal" when it, or a version it revises, carries proposalOf.
type Candidate = { id: string; revisionOf?: string; proposalOf?: string; asProposed?: boolean; byEditor?: true };
type Round = { round: number; candidates: Candidate[]; evaluation?: { proposals?: unknown[]; scores?: { candidateId: string; overall: number }[] } };
type Run = { status: string; rounds: Round[]; winnerId?: string; editorChoiceId?: string; judge?: { model: string }; writer?: { model: string }; extraRounds?: number } | null;
const rows = await sql`select id, created_at, opening, closing, deck, visual from draft2_sessions where created_at > '2026-10-11' order by created_at`;
const steps = ["opening", "closing", "deck", "visual"] as const;
const totals: Record<string, { runs: number; fromProposal: number; asProposed: number; editorOwn: number; rounds: number; accepted: number; judgeTimeless: number }> = {};
for (const row of rows) {
  for (const step of steps) {
    const run = row[step] as Run;
    if (!run || !run.rounds?.length || !(run.editorChoiceId ?? run.winnerId)) continue;
    if (run.judge?.model && !/luna/.test(run.judge.model)) continue;
    const all = new Map<string, Candidate>();
    for (const round of run.rounds) for (const c of round.candidates) all.set(c.id, c);
    const winnerId = run.editorChoiceId ?? run.winnerId!;
    let c = all.get(winnerId); let fromProposal = false; let asProposed = false; let own = false; let hops = 0;
    while (c && hops++ < 10) { if (c.proposalOf) { fromProposal = true; asProposed = Boolean(c.asProposed); } if (c.byEditor) own = true; c = c.revisionOf ? all.get(c.revisionOf) : undefined; }
    const t = totals[step] ??= { runs: 0, fromProposal: 0, asProposed: 0, editorOwn: 0, rounds: 0, accepted: 0, judgeTimeless: 0 };
    t.runs++; t.rounds += run.rounds.length; if (fromProposal) t.fromProposal++; if (asProposed) t.asProposed++; if (own) t.editorOwn++; if (run.status === "ready") t.accepted++;
    const best = run.rounds.at(-1)?.evaluation?.scores?.find((s) => s.candidateId === winnerId)?.overall;
    console.log(`${String(row.created_at).slice(4, 15)} ${String(row.id).slice(0, 8)} ${step.padEnd(8)} ${run.status.padEnd(12)} rounds ${run.rounds.length}${run.extraRounds ? `(+${run.extraRounds})` : ""} winner ${winnerId.padEnd(6)} ${best ?? "?"} ${fromProposal ? (asProposed ? "FROM PROPOSAL (as written)" : "FROM PROPOSAL (edited/revised)") : own ? "EDITOR'S OWN" : "writer's"}`);
  }
}
console.log("\nsince 2026-10-11, Luna judging:");
for (const [step, t] of Object.entries(totals)) console.log(`  ${step.padEnd(8)} runs ${t.runs} · accepted ${t.accepted} · avg rounds ${(t.rounds / t.runs).toFixed(1)} · winners from a judge proposal ${t.fromProposal} (${t.asProposed} as written) · editor's own ${t.editorOwn}`);
