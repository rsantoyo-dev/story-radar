// Read-only: where the Opening winners come from, how much of round 1 survives the program, cost per round.
import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
nextEnv.loadEnvConfig(process.cwd(), true);
const sql = neon(process.env.DATABASE_URL!);
const rows = await sql`select id, updated_at, opening, trace from draft2_sessions where opening is not null order by updated_at desc limit 8`;

type Candidate = { id: string; revisionOf?: string; proposalOf?: string; asProposed?: boolean };
type Score = { candidateId: string; overall: number };
type Round = { round: number; candidates: Candidate[]; mechanical?: { candidateId?: string; code: string }[]; evaluation?: { verdict: string; winnerId?: string; scores: Score[]; proposals?: Candidate[] }; regressions?: { candidateId: string; from: number; to: number }[] };
type Run = { status?: string; rounds: Round[]; winnerId?: string; bestScore?: number; bestId?: string; extraRounds?: number; notes?: string[]; previousRuns?: Run[] };
type Trace = { step?: string; operation?: string; round?: number; model?: string; durationMs?: number; costMicros?: number; effort?: string };

const rootOf = (id: string) => id.split(".")[0];
const origin = (run: Run, winnerId: string | undefined) => {
  if (!winnerId) return "no winner";
  const all = run.rounds.flatMap((round) => round.candidates.map((candidate) => ({ ...candidate, round: round.round })));
  const root = all.find((candidate) => candidate.id === rootOf(winnerId));
  const winner = all.find((candidate) => candidate.id === winnerId);
  if (!root || !winner) return `unknown (${winnerId})`;
  const kind = root.proposalOf ? (root.asProposed ? "judge proposal as written" : "judge proposal edited by Claude") : root.round === 1 ? "round-1 candidate" : `late new angle (round ${root.round})`;
  const revised = winner.id === root.id ? "unrevised" : `revised in round ${winner.round}`;
  const round1 = run.rounds[0]?.evaluation?.scores.slice().sort((a, b) => b.overall - a.overall) ?? [];
  const rank = root.round === 1 ? round1.findIndex((score) => score.candidateId === root.id) + 1 : 0;
  return `${kind}${rank ? ` (rank ${rank}/${round1.length} in round 1)` : ""}, ${revised}`;
};
const describe = (label: string, run: Run, trace: Trace[]) => {
  const last = run.rounds[run.rounds.length - 1];
  const winnerId = run.winnerId ?? run.bestId ?? last?.evaluation?.winnerId;
  const best = Math.max(0, ...run.rounds.flatMap((round) => round.evaluation?.scores.map((score) => score.overall) ?? []));
  console.log(`\n${label} · status ${run.status ?? "?"} · rounds ${run.rounds.length}${run.extraRounds ? ` (+${run.extraRounds} extra)` : ""} · best ${best} · winner ${winnerId}: ${origin(run, winnerId)}`);
  for (const round of run.rounds) {
    const flagged = new Set((round.mechanical ?? []).map((finding) => finding.candidateId).filter(Boolean));
    const codes = (round.mechanical ?? []).reduce<Record<string, number>>((acc, finding) => ({ ...acc, [finding.code]: (acc[finding.code] ?? 0) + 1 }), {});
    const scores = round.evaluation?.scores ?? [];
    const clean = round.candidates.filter((candidate) => !flagged.has(candidate.id));
    const cleanScores = scores.filter((score) => !flagged.has(score.candidateId)).map((score) => score.overall).sort((a, b) => b - a);
    const kinds = { new: round.candidates.filter((c) => !c.revisionOf && !c.proposalOf).length, revised: round.candidates.filter((c) => c.revisionOf).length, written: round.candidates.filter((c) => c.proposalOf && c.asProposed).length, edited: round.candidates.filter((c) => c.proposalOf && !c.asProposed).length };
    const calls = trace.filter((entry) => entry.step === "opening" && entry.round === round.round);
    const cost = (predicate: (entry: Trace) => boolean) => calls.filter(predicate).reduce((sum, entry) => sum + (entry.costMicros ?? 0), 0) / 1e6;
    const secs = (predicate: (entry: Trace) => boolean) => calls.filter(predicate).reduce((sum, entry) => sum + (entry.durationMs ?? 0), 0) / 1000;
    const judge = (entry: Trace) => /judg|evaluat/i.test(entry.operation ?? "");
    console.log(`  round ${round.round}: ${round.candidates.length} cand (new ${kinds.new}, revised ${kinds.revised}, proposals written ${kinds.written}/edited ${kinds.edited}) · flagged ${flagged.size} (${Object.entries(codes).map(([code, n]) => `${code}×${n}`).join(", ") || "-"}) · clean ${clean.length} · clean scores ${cleanScores.join(" ")} · ${round.evaluation?.verdict ?? "-"} → ${round.evaluation?.winnerId ?? "-"} · proposals ${round.evaluation?.proposals?.length ?? 0} · regress ${round.regressions?.length ?? 0} · writer ${secs((e) => !judge(e)).toFixed(0)}s $${cost((e) => !judge(e)).toFixed(3)} · judge ${secs(judge).toFixed(0)}s $${cost(judge).toFixed(3)}`);
  }
  if (run.notes?.length) console.log(`  notes: ${run.notes.join(" | ")}`);
};
for (const row of rows) {
  const run = row.opening as Run;
  const trace = (row.trace ?? []) as Trace[];
  describe(`session ${String(row.id).slice(0, 8)} (${new Date(row.updated_at as string).toISOString().slice(0, 16)})`, run, trace);
  for (const [index, previous] of (run.previousRuns ?? []).entries()) describe(`  previous run ${index + 1}`, previous, []);
}
const sample = (rows[0].trace as Trace[]).find((entry) => entry.step === "opening");
console.log("\ntrace entry keys:", sample ? Object.keys(sample).join(", ") : "none");
