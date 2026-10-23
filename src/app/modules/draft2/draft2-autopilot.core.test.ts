import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTOPILOT_MAX_STEP_RUNS, AUTOPILOT_PASS_BUDGET_MS, AUTOPILOT_STEPS, autopilotJobEnd, autopilotStepRuns, nextAutopilotStep, parseAutopilotUntil, runAutopilotPass, runNeeds, sessionCostMicros,
  type AutopilotNext, type AutopilotPassDependencies, type AutopilotSession, type Draft2AutopilotStep,
} from "./draft2-autopilot.core";

/** A session with one step's run in the state a test needs; the decision is scripted, so the rest stays empty. */
const session = (patch: Partial<AutopilotSession> = {}): AutopilotSession => ({
  id: "s1", status: "ready", step: "caption", facts: [], focus: null, opening: null, closing: null, deck: null, review: null, inventory: null, visual: null, images: null, mentions: null, caption: null,
  trace: [], error: null, updatedAt: new Date("2026-10-22T12:00:00Z"), ...patch,
});

/** A pass over a scripted order of steps: each run moves the session on; the decision reads how many steps ran. */
function harness(order: readonly Draft2AutopilotStep[], options: Partial<AutopilotPassDependencies> & { paused?: Draft2AutopilotStep; fail?: Draft2AutopilotStep; stepMs?: number } = {}) {
  let ran: Draft2AutopilotStep[] = [];
  let clock = Date.parse("2026-10-22T12:00:00Z");
  const stepMs = options.stepMs ?? 20_000;
  let pausedOnce = false;
  const calls = { progress: 0, patches: 0, stops: 0 };
  const current = (): AutopilotSession => session({ id: ran.includes("facts") ? "s2" : "s1", review: ran.includes("review") ? ({ status: "ready", editor: { scores: { overall: 74 }, patches: [{ id: "p1", status: "proposed", kind: "repetition" }] } } as unknown as AutopilotSession["review"]) : null });
  const deps: AutopilotPassDependencies = {
    loadSession: async () => current(),
    runStep: async (step) => {
      if (options.fail === step) throw new Error(`${step} broke`);
      clock += stepMs;
      ran.push(step);
      const value = current();
      if (options.paused === step && !pausedOnce) { pausedOnce = true; return { ...value, [step]: { status: "paused" } } as AutopilotSession; }
      return value;
    },
    applyReviewPatches: async (value) => { calls.patches++; return value; },
    stopRequested: async () => { calls.stops++; return false; },
    progress: async () => { calls.progress++; },
    until: "caption",
    steps: [],
    stepRuns: 0,
    deadline: clock + AUTOPILOT_PASS_BUDGET_MS,
    maxCostMicros: 6_000_000,
    now: () => clock,
    next: (): AutopilotNext => { const step = order[ran.length]; return step ? { step, ...(options.paused === step && pausedOnce && ran.at(-1) === step ? { continuing: true } : {}) } : { done: true }; },
    ...options,
  };
  return { deps, ran: () => ran, calls, reset: () => { ran = []; } };
}

test("a pass runs the steps in order to the target and ends done; the review's patches are applied and its score never stops the job", async () => {
  // A long pass, so every step fits: twelve steps of ten seconds and the review's 200 s estimate.
  const h = harness(["facts", "inventory", "focus", "spine", "mentions", "opening", "closing", "deck", "review", "visual", "images", "caption"], { stepMs: 10_000, deadline: Date.parse("2026-10-22T12:00:00Z") + 600_000 });
  const { end, steps } = await runAutopilotPass(h.deps);
  assert.deepEqual(end, { kind: "done" });
  assert.deepEqual(h.ran(), [...AUTOPILOT_STEPS]);
  assert.equal(steps.find((entry) => entry.step === "review")?.score, 74, "the review's score is in the log");
  assert.equal(h.calls.patches, 1, "its necessary patches are applied");
  assert.ok(h.calls.stops >= 12, "the stop request is read before every step");
  assert.deepEqual(autopilotJobEnd(end, "caption")?.status, "done");
});

test("a target cuts the run: the steps after it wait for the editor", async () => {
  const h = harness(["facts", "inventory", "focus"], { until: "inventory" });
  const { end, steps } = await runAutopilotPass(h.deps);
  assert.deepEqual([end, h.ran(), steps.map((entry) => entry.step)], [{ kind: "done" }, ["facts", "inventory"], ["facts", "inventory"]]);
  assert.match(autopilotJobEnd(end, "inventory")?.outcome ?? "", /Reached the people and places/u);
  assert.deepEqual(AUTOPILOT_STEPS.filter((step) => autopilotStepRuns(step, "spine")), ["facts", "inventory", "focus", "spine"]);
  assert.equal(parseAutopilotUntil(undefined), "caption");
  assert.equal(parseAutopilotUntil("images"), "images");
  assert.equal(parseAutopilotUntil("publication"), undefined);
});

test("a pass starts no step it has no time for and says which one waits; a budgeted step needs less than one with a fixed estimate", async () => {
  const h = harness(["opening", "closing"], { stepMs: 200_000 });
  const { end } = await runAutopilotPass(h.deps);
  assert.deepEqual([end, h.ran()], [{ kind: "out-of-time", next: "closing" }, ["opening"]], "the closing waits for the next pass");
  assert.equal(autopilotJobEnd(end, "caption"), undefined, "the job stays running");
  const review = harness(["review"], { deadline: Date.parse("2026-10-22T12:00:00Z") + 150_000 });
  assert.deepEqual((await runAutopilotPass(review.deps)).end, { kind: "out-of-time", next: "review" }, "a review needs about 200 s");
  const opening = harness(["opening"], { deadline: Date.parse("2026-10-22T12:00:00Z") + 150_000 });
  assert.deepEqual((await runAutopilotPass(opening.deps)).end, { kind: "done" }, "a funnel step pauses itself before the deadline, so 150 s is enough to start it");
});

test("a step that pauses for time is continued at once and logged once it ends; a step that fails ends the job with its reason", async () => {
  const h = harness(["opening", "opening", "closing"], { paused: "opening" });
  const { end, steps } = await runAutopilotPass(h.deps);
  assert.deepEqual([end, steps.map((entry) => entry.step)], [{ kind: "done" }, ["opening", "closing"]], "the paused opening is not logged twice");
  const broken = harness(["opening", "closing"], { fail: "closing" });
  const failed = await runAutopilotPass(broken.deps);
  assert.equal(failed.end.kind, "failed");
  assert.match(autopilotJobEnd(failed.end, "caption")?.outcome ?? "", /closing step failed: closing broke/u);
  assert.equal(failed.steps.at(-1)?.status, "failed");
});

test("a step that comes up twice in a row blocks the job, a stop request stops it, a blocked decision is passed on, and a spent allowance stops it before the next step", async () => {
  const twice = harness(["opening", "opening"]);
  const repeated = await runAutopilotPass(twice.deps);
  assert.equal(repeated.end.kind, "blocked");
  assert.match((repeated.end as { reason: string }).reason, /did not advance/u);
  const stopped = harness(["opening"], { stopRequested: async () => true });
  assert.deepEqual((await runAutopilotPass(stopped.deps)).end, { kind: "stopped" });
  assert.equal(autopilotJobEnd({ kind: "stopped" }, "caption")?.status, "stopped");
  const blocked = harness([], { next: () => ({ blocked: "2 people wait for you in People and places." }) });
  assert.deepEqual((await runAutopilotPass(blocked.deps)).end, { kind: "blocked", reason: "2 people wait for you in People and places." });
  const costly = harness(["opening"], { loadSession: async () => session({ trace: [{ costMicros: 7_000_000 } as unknown as AutopilotSession["trace"][number]] }) });
  const spent = await runAutopilotPass(costly.deps);
  assert.deepEqual(spent.end, { kind: "spent", costMicros: 7_000_000 });
  assert.match(autopilotJobEnd(spent.end, "caption")?.outcome ?? "", /spent 7\.00 USD/u);
  const looping = harness(["opening"], { stepRuns: AUTOPILOT_MAX_STEP_RUNS });
  assert.equal((await runAutopilotPass(looping.deps)).end.kind, "failed", "a job that ran too many steps stops");
});

test("the decisions: no session runs the facts; facts being verified or refused block; a caption written for other images or accounts is written again", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  assert.deepEqual(nextAutopilotStep(null, now), { step: "facts" });
  assert.deepEqual(nextAutopilotStep(session({ step: "facts", status: "running", facts: [] }), now), { blocked: "The facts are still being verified." });
  assert.deepEqual(nextAutopilotStep(session({ step: "facts", status: "running", facts: [], updatedAt: new Date(now - 10 * 60_000) }), now), { step: "facts" }, "a run gone silent is started again");
  assert.deepEqual(nextAutopilotStep(session({ step: "facts", status: "needs-review", facts: [{ id: "f1" } as never] }), now).hasOwnProperty("blocked"), true);
  assert.deepEqual(runNeeds("caption", null, false, "caption"), { step: "caption" });
  assert.deepEqual(runNeeds("caption", { status: "paused" }, false, "caption"), { step: "caption", continuing: true });
  assert.deepEqual(runNeeds("caption", { status: "needs-review", winnerId: "c2" }, true, "caption"), { step: "caption", reason: "what it follows changed since" });
  assert.equal(runNeeds("caption", { status: "needs-review", winnerId: "c2" }, false, "caption"), undefined, "a caption with a best version stands");
  assert.deepEqual(runNeeds("caption", { status: "needs-review" }, false, "caption")?.hasOwnProperty("reason"), true, "no version that may win: written again");
  assert.equal(sessionCostMicros(session({ trace: [{ costMicros: 1_000 } as never, {} as never], images: { slides: [{ attempts: [{ costMicros: 500 }] }], masterPlate: { costMicros: 250 } } as never })), 1_750);
});

test("a fresh job starts over from the facts whatever the story's latest session says, then follows the new session (2026-10-23)", async () => {
  // The decision would say "done": the story's latest session is finished. Fresh: the facts run first, and only once.
  const h = harness(["facts", "inventory"], { fresh: true, next: () => ({ done: true }) });
  const { end, steps } = await runAutopilotPass(h.deps);
  assert.deepEqual([end, steps.map((entry) => entry.step)], [{ kind: "done" }, ["facts"]], "the facts open the new session; the scripted decision then ends the job");
  const continued = harness(["opening"], { fresh: true, steps: [{ step: "facts", status: "ready", ms: 1, startedAt: "2026-10-23T09:00:00.000Z" }], stepRuns: 1 });
  assert.deepEqual((await runAutopilotPass(continued.deps)).steps.map((entry) => entry.step), ["facts", "opening"], "a later pass of a fresh job goes on, it does not start over again");
});

test("a plan the program refuses is written again once from its findings before the job stops; refused again, it is the editor's (2026-10-23)", async () => {
  let spineRuns = 0;
  const findings = "Fix the spine first: The spine plans conditions instead of what the reader does or sees: middle 1 (\"billetterie\").";
  const h = harness([], { next: () => spineRuns ? { done: true } : { blocked: findings } });
  const notes: string[] = [];
  h.deps.runStep = async (step, options) => { if (step === "spine") { spineRuns++; notes.push(options.notes ?? ""); } return session(); };
  const { end, steps } = await runAutopilotPass(h.deps);
  assert.deepEqual([end, steps.map((entry) => [entry.step, entry.reason])], [{ kind: "done" }, [["spine", "the program's findings on it"]]]);
  assert.deepEqual(notes, ["The spine plans conditions instead of what the reader does or sees: middle 1 (\"billetterie\")."], "the findings are the planner's notes");
  const stubborn = harness([], { next: () => ({ blocked: findings }) });
  stubborn.deps.runStep = async () => session();
  const again = await runAutopilotPass(stubborn.deps);
  assert.deepEqual(again.end, { kind: "blocked", reason: findings }, "rewritten once; the second refusal stops the job");
  assert.equal(again.steps.length, 1);
  const other = harness([], { next: () => ({ blocked: "2 people wait for you in People and places." }) });
  assert.deepEqual((await runAutopilotPass(other.deps)).end, { kind: "blocked", reason: "2 people wait for you in People and places." }, "only a spine's findings are repaired");
});
