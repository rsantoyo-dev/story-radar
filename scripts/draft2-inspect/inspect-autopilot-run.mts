import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
nextEnv.loadEnvConfig(process.cwd(), true);
const sql = neon(process.env.DATABASE_URL!);
const storyId = process.argv[2];
// Read-only: the latest session of a story: each step's outcome, every round's real judgment beside its shadow (winner, scores, issues), and what each step took.
type Score = { candidateId: string; overall: number };
type Issue = { code: string; candidateId?: string; part?: string; detail: string; material?: boolean };
type Round = { round: number; candidates: { id: string }[]; evaluation?: { verdict: string; winnerId: string; scores: Score[]; issues: Issue[]; proposals?: unknown[]; summary?: string }; shadow?: { model: string; effort: string; verdict?: string; winnerId?: string; scores?: Score[]; issues?: Issue[]; proposals?: number; agrees?: boolean; durationMs: number; error?: string }; mechanical: unknown[] };
type Run = { status: string; winnerId?: string; editorChoiceId?: string; error?: string; rounds: Round[]; extraRounds?: number } | null;
type Entry = { step: string; round: number; provider: string; model: string; operation: string; durationMs: number; outcome: string; effort?: string; costMicros?: number; note?: string; usage?: { outputTokens: number; promptTokens: number; thoughtsTokens?: number }; cachedInputTokens?: number };
const [row] = await sql`select s.id, t.name as topic, s.step, s.status, s.error, s.focus, s.opening, s.closing, s.deck, s.inventory->>'status' as inventory, s.mentions->>'status' as mentions, s.visual, s.images, s.caption, s.trace, s.created_at, s.updated_at, jsonb_array_length(coalesce(s.facts,'[]'::jsonb)) as facts_count
  from draft2_sessions s join topics t on t.id = s.topic_id where s.story_id = ${storyId} order by s.updated_at desc limit 1` as { id: string; topic: string; step: string; status: string; error: string | null; focus: { status: string; version: number; values?: { visualDirection?: string; structure?: { kind: string }; goal?: string; framing?: string; voice?: { gravity: string } } } | null; opening: Run; closing: Run; deck: Run; inventory: string | null; mentions: string | null; visual: Run; images: { status: string; slides: { label: string; attempts: { status: string; kind: string; review?: { status: string; issues: string[] } }[] }[] } | null; caption: Run; trace: Entry[]; created_at: string; updated_at: string; facts_count: number }[];
const usd = (m: number) => `$${(m / 1e6).toFixed(2)}`;
const s = (ms: number) => `${(ms / 1000).toFixed(0)}s`;
console.log(`${row.topic} · session ${row.id.slice(0, 8)} · step ${row.step}/${row.status} · ${row.error ?? "no error"} · facts ${row.facts_count} · created ${row.created_at} · updated ${row.updated_at}`);
console.log(`focus: ${row.focus?.status} v${row.focus?.version} · framing ${row.focus?.values?.framing} · structure ${row.focus?.values?.structure?.kind} · goal ${row.focus?.values?.goal} · gravity ${row.focus?.values?.voice?.gravity}\n  visualDirection: ${row.focus?.values?.visualDirection ?? "(none)"}`);
console.log(`inventory ${row.inventory} · mentions ${row.mentions}`);
const top = (scores?: Score[]) => (scores ?? []).slice().sort((a, b) => b.overall - a.overall).slice(0, 4).map((x) => `${x.candidateId} ${x.overall}`).join(", ");
const codes = (issues?: Issue[]) => { const m = new Map<string, number>(); for (const i of issues ?? []) m.set(i.code, (m.get(i.code) ?? 0) + 1); return [...m].map(([c, n]) => n > 1 ? `${c}×${n}` : c).join(", "); };
for (const [name, run] of [["opening", row.opening], ["closing", row.closing], ["deck", row.deck], ["visual", row.visual], ["caption", row.caption]] as [string, Run][]) {
  if (!run) { console.log(`\n[${name}] none`); continue; }
  const call = (round: number, op: string) => row.trace.find((e) => e.step === name && e.round === round && e.operation === op && e.outcome === "ok");
  console.log(`\n[${name}] ${run.status} · winner ${run.winnerId}${run.editorChoiceId ? ` · editor ${run.editorChoiceId}` : ""}${run.extraRounds ? ` · extra rounds ${run.extraRounds}` : ""}${run.error ? ` · ${run.error.slice(0, 150)}` : ""}`);
  for (const r of run.rounds) {
    const ev = r.evaluation; const real = call(r.round, `draft2_${name}_review`); const sh = call(r.round, `draft2_${name}_review_shadow`); const writer = call(r.round, `draft2_${name}`);
    console.log(`  r${r.round} · ${r.candidates.length} candidates · program findings ${r.mechanical.length} · writer ${writer ? `${s(writer.durationMs)} ${usd(writer.costMicros ?? 0)}` : "?"}`);
    console.log(`     Sol  (${real?.effort ?? "?"}): ${ev?.verdict ?? "no verdict"} · winner ${ev?.winnerId} · ${top(ev?.scores)} · ${ev?.issues.length ?? 0} issues [${codes(ev?.issues)}] · ${ev?.proposals?.length ?? 0} proposals · ${real ? `${s(real.durationMs)} · reasoning ${((real.usage?.thoughtsTokens ?? 0) / 1000).toFixed(1)}k · ${usd(real.costMicros ?? 0)}` : "no trace"}`);
    if (r.shadow) console.log(`     ${r.shadow.model} (${r.shadow.effort}): ${r.shadow.error ? `failed: ${r.shadow.error}` : `${r.shadow.verdict} · winner ${r.shadow.winnerId} · ${top(r.shadow.scores)} · ${r.shadow.issues?.length ?? 0} issues [${codes(r.shadow.issues)}] · ${r.shadow.proposals ?? 0} proposals · ${r.shadow.agrees ? "AGREES" : "DIFFERS"}`} · ${s(r.shadow.durationMs)}${sh ? ` · reasoning ${((sh.usage?.thoughtsTokens ?? 0) / 1000).toFixed(1)}k · ${usd(sh.costMicros ?? 0)}` : ""}`);
    if (r.shadow?.issues?.length) for (const i of r.shadow.issues.slice(0, 4)) console.log(`        · ${i.code}${i.candidateId ? ` ${i.candidateId}` : ""}: ${i.detail.slice(0, 140)}`);
    if (ev?.issues.length) for (const i of ev.issues.slice(0, 3)) console.log(`        Sol · ${i.code}${i.candidateId ? ` ${i.candidateId}` : ""}${i.part ? ` ${i.part}` : ""}: ${i.detail.slice(0, 140)}`);
  }
}
if (row.images) console.log(`\n[images] ${row.images.status} · ` + row.images.slides.map((sl) => { const a = sl.attempts[sl.attempts.length - 1]; return `${sl.label}: ${a?.status}${a?.review ? ` ${a.review.status}${a.review.issues.length ? ` (${a.review.issues.join(" | ").slice(0, 100)})` : ""}` : ""}`; }).join(" · "));
const steps = new Map<string, { ms: number; cost: number; sol: number; calls: number }>();
for (const e of row.trace) { const k = steps.get(e.step) ?? { ms: 0, cost: 0, sol: 0, calls: 0 }; const shadow = e.operation.endsWith("_shadow"); k.ms += shadow ? 0 : e.durationMs; k.cost += shadow ? 0 : (e.costMicros ?? 0); if (e.provider === "openai" && !shadow) k.sol += e.durationMs; k.calls++; steps.set(e.step, k); }
let ms = 0, cost = 0, sol = 0, shadowCost = 0, shadowMs = 0, shadowN = 0;
console.log("\n[per step, shadows excluded] time in calls · Sol share · cost");
for (const [step, k] of steps) { ms += k.ms; cost += k.cost; sol += k.sol; console.log(`  ${step.padEnd(10)} ${s(k.ms).padStart(5)} · Sol ${s(k.sol).padStart(5)} · ${usd(k.cost)} · ${k.calls} calls`); }
for (const e of row.trace) if (e.operation.endsWith("_shadow")) { shadowCost += e.costMicros ?? 0; shadowMs += e.durationMs; shadowN++; }
console.log(`  TOTAL      ${s(ms)} (${(ms / 60000).toFixed(1)} min) · Sol ${s(sol)} (${Math.round(100 * sol / Math.max(1, ms))}%) · ${usd(cost)} · shadows: ${shadowN} calls, ${usd(shadowCost)}, ${s(shadowMs)} in parallel`);
const errors = row.trace.filter((e) => e.outcome === "error");
if (errors.length) console.log("\n[errors] " + errors.map((e) => `${e.step} r${e.round} ${e.operation}: ${e.note?.slice(0, 160)}`).join("\n  "));
