"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ActionRow, Button, EmptyState, FormField, InlineNotice, LoadingState, SectionHeader, StatusBadge, Surface, type StatusTone } from "@/app/ui/primitives";
import type { StoryContentResponse } from "@/app/radar-dashboard";
import type { Draft2Fact, Draft2FactsEvaluation, Draft2FactsRound, Draft2SessionStatus, Draft2TraceEntry } from "@/app/modules/draft2/draft2-facts.types";
import {
  FOCUS_AUDIENCE_MAX_CHARACTERS, FOCUS_CONSEQUENCE_MAX_CHARACTERS, FOCUS_DIRECTION_MAX_CHARACTERS, FOCUS_FRAMINGS, FOCUS_GOALS, FOCUS_GRAVITIES, FOCUS_STRUCTURES, focusFindings,
  type Draft2Focus, type Draft2FocusField, type Draft2FocusFinding, type Draft2FocusValues, type Draft2FocusVoice,
} from "@/app/modules/draft2/draft2-focus.types";
import { TONE_KEYS, toneWords, type ToneKey } from "@/app/modules/draft2/skills/tone";
import {
  OPENING_CRITERIA, OPENING_CRITERION_FLOOR, OPENING_MAX_ROUNDS, OPENING_STALL_MS, criterionScore, hasMaterialError, openingAcceptedWinner, openingResumeRound, openingScorePasses, openingVersions,
  type Draft2Opening, type Draft2OpeningCriterion, type Draft2OpeningIssue, type Draft2OpeningRegression, type Draft2OpeningRound, type Draft2OpeningScore, type Draft2OpeningVersion,
} from "@/app/modules/draft2/draft2-opening.types";
import { DRAFT2_OPENING_EARLIER_ROLES, DRAFT2_OPENING_ROLES, draft2ProviderName } from "@/app/modules/draft2/draft2-models";
import { contentStatusLabel, DRAFT_2_STEPS, paragraphs, sourceHost, storyHref, wordCount } from "./draft-2-canvas.core";
import styles from "./draft-2-canvas.generated.module.css";

/** The Draft 2 session as the API returns it. */
type Draft2SessionView = {
  id: string;
  status: Draft2SessionStatus;
  step: string;
  facts: Draft2Fact[] | null;
  evaluation: Draft2FactsEvaluation | null;
  rounds: Draft2FactsRound[];
  focus: Draft2Focus | null;
  opening: Draft2Opening | null;
  trace: Draft2TraceEntry[];
  error: string | null;
  updatedAt: string;
};

type Draft2RunStep = "facts" | "focus" | "opening";

/** Up to three rounds of two provider calls; the route itself allows 300 s. */
const STEP_REQUEST_TIMEOUT_MS = 540_000;
/** How often a run whose request was lost is checked, and how long the server may stay unreachable before the canvas stops waiting. */
const FOLLOW_POLL_MS = 10_000;
const FOLLOW_UNREACHABLE_MS = 3 * 60_000;

/** A request that ended without telling how the run went: the connection dropped, it timed out, or a gateway answered for the server. The run may go on. */
class Draft2LostRequest extends Error {}

const SESSION_STATUS: Record<Draft2SessionStatus, { label: string; tone: StatusTone }> = {
  running: { label: "Running", tone: "info" },
  ready: { label: "Verified", tone: "success" },
  "needs-review": { label: "Needs review", tone: "warning" },
  failed: { label: "Failed", tone: "error" },
};

const FOCUS_STATUS: Record<Draft2Focus["status"], { label: string; tone: StatusTone }> = {
  running: { label: "Deciding", tone: "info" },
  ready: { label: "Decided", tone: "success" },
  failed: { label: "Failed", tone: "error" },
};

const OPENING_STATUS: Record<Draft2Opening["status"], { label: string; tone: StatusTone }> = {
  running: { label: "Running", tone: "info" },
  paused: { label: "Paused", tone: "info" },
  ready: { label: "Ready", tone: "success" },
  "needs-review": { label: "Needs review", tone: "warning" },
  failed: { label: "Failed", tone: "error" },
};

const FACT_STATUS: Record<Draft2Fact["status"], { label: string; tone: StatusTone }> = {
  established: { label: "Established", tone: "success" },
  attributed: { label: "Attributed", tone: "info" },
  disputed: { label: "Disputed", tone: "warning" },
};

const CRITERION_LABEL: Record<Draft2OpeningCriterion, string> = { tension: "Tension", payoff: "Payoff", clarity: "Clarity", grounding: "Grounding", voice: "Voice", focus: "Focus" };

const FRAMING_LABEL: Record<Draft2FocusValues["framing"], string> = { "reader-consequence": "Reader consequence", explainer: "Explainer", authority: "Authority" };
const STRUCTURE_LABEL: Record<Draft2FocusValues["structure"]["kind"], string> = { arc: "Arc: one story, one tension", steps: "Steps: an ordered procedure", list: "List: “N things to…”" };
const GOAL_LABEL: Record<Draft2FocusValues["goal"], string> = { followers: "Followers", discussion: "Discussion", saves: "Saves", shares: "Shares" };
const GRAVITY_LABEL: Record<Draft2FocusVoice["gravity"], string> = { light: "Light", ordinary: "Ordinary", serious: "Serious", grave: "Grave" };
const TONE_LABEL: Record<ToneKey, string> = { formality: "Formality", humor: "Humor", energy: "Energy", optimism: "Optimism", provocation: "Provocation" };

const providerLabel = (provider: Draft2TraceEntry["provider"]) => provider === "openai" ? "Sol" : "Claude";
type RoleNames = { writer: string; judge: string };
/** Who writes and who judges a new run today. */
const TODAY: RoleNames = { writer: draft2ProviderName(DRAFT2_OPENING_ROLES.writer), judge: draft2ProviderName(DRAFT2_OPENING_ROLES.judge) };
/** Who wrote and who judged a run; one stored before the swap records no roles and had Sol writing and Claude judging. */
const roleNames = (opening: Pick<Draft2Opening, "writer" | "judge">): RoleNames => ({
  writer: draft2ProviderName(opening.writer?.provider ?? DRAFT2_OPENING_EARLIER_ROLES.writer),
  judge: draft2ProviderName(opening.judge?.provider ?? DRAFT2_OPENING_EARLIER_ROLES.judge),
});

/** Where a version comes from: its round, and the version it revises or the judge's proposal it is (as written) or edits. */
const versionOrigin = ({ round, candidate }: Draft2OpeningVersion, names: RoleNames) => {
  const proposal = candidate.proposalOf ? (candidate.asProposed ? ` · ${names.judge}’s ${candidate.proposalOf} as written` : ` · ${names.writer}’s edit of ${names.judge}’s ${candidate.proposalOf}`) : "";
  return `round ${round}${candidate.revisionOf ? ` · revises ${candidate.revisionOf}` : ""}${proposal}`;
};

/** Why a revision did not replace its version: a lower score, or the same or a higher one with a loss the score does not show. */
function regressionNote({ candidateId, previousId, from, to, worse }: Draft2OpeningRegression): string {
  const losses = worse.length ? ` (${worse.join(", ")})` : "";
  const lead = to < from ? `${candidateId} scored ${to}, below ${previousId}’s ${from}${losses}`
    : to === from ? `${candidateId} matched ${previousId}’s ${from} but did worse${losses}`
      : `${candidateId} scored ${to} to ${previousId}’s ${from} but did worse${losses}`;
  return `${lead}; ${previousId} stays the better version.`;
}

const listed = (items: readonly string[]) => items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items.join("");
const issueTarget = (issue: Draft2OpeningIssue) => issue.candidateId ? ` · ${issue.candidateId}${issue.part ? ` · ${issue.part === "slide2" ? "slide 2" : "cover"}` : ""}` : "";

/**
 * Draft 2: the second creative pipeline, built one step at a time beside the
 * current studio, which it never touches. The canvas brings in the selected
 * story and runs each step on it: Facts, the Focus, then the Opening.
 */
export function Draft2Canvas({ signedIn = false, topicId, topicName, themeStyle, storyId, from, returnContext }: {
  /** A signed-in session authorizes every request; the collector secret is not needed. */
  signedIn?: boolean;
  topicId: string;
  topicName: string;
  themeStyle: CSSProperties;
  storyId: string;
  from?: string;
  returnContext?: string;
}) {
  const [secret] = useState(() => {
    if (typeof window === "undefined" || signedIn) return "";
    try { return window.sessionStorage.getItem("story-radar:collector-secret") ?? ""; }
    catch { return ""; }
  });
  const [content, setContent] = useState<StoryContentResponse>();
  const [error, setError] = useState<string>();
  const [session, setSession] = useState<Draft2SessionView | null>();
  const [running, setRunning] = useState<Draft2RunStep>();
  const [runError, setRunError] = useState<{ step: Draft2RunStep; message: string }>();
  const [choosing, setChoosing] = useState<string>();
  const [choiceError, setChoiceError] = useState<string>();
  const [savingFocus, setSavingFocus] = useState<Draft2FocusField>();
  const [focusError, setFocusError] = useState<string>();
  const [following, setFollowing] = useState<string>();
  // The clock a run is measured against, to tell a run that went silent from one still working.
  const [now, setNow] = useState(0);
  const back = storyHref(topicId, storyId, { from, returnContext });
  const headers = { Authorization: `Bearer ${secret}` };

  useEffect(() => {
    if (!secret && !signedIn) {
      Promise.resolve().then(() => setError("Connect with the collector secret on the dashboard to open this story."));
      return;
    }
    const controller = new AbortController();
    fetch(`/api/radar/stories/${encodeURIComponent(storyId)}/content?topicId=${encodeURIComponent(topicId)}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${secret}` },
    }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not open the story.");
      return body as StoryContentResponse;
    }).then((result) => {
      if (!controller.signal.aborted) setContent(result);
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not open the story.");
    });
    return () => controller.abort();
  }, [secret, signedIn, storyId, topicId]);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    void Promise.resolve().then(tick);
    const clock = setInterval(tick, 30_000);
    return () => clearInterval(clock);
  }, []);

  const loadSession = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/radar/draft2/session?topicId=${encodeURIComponent(topicId)}&storyId=${encodeURIComponent(storyId)}`, { cache: "no-store", signal, headers: { Authorization: `Bearer ${secret}` } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Could not read the Draft 2 session.");
    return (body.session ?? null) as Draft2SessionView | null;
  }, [secret, storyId, topicId]);

  useEffect(() => {
    if (!content) return;
    const controller = new AbortController();
    loadSession(controller.signal).then((value) => { if (!controller.signal.aborted) setSession(value); }).catch(() => { if (!controller.signal.aborted) setSession(null); });
    return () => controller.abort();
  }, [content, loadSession]);

  /** Runs one step: Facts starts a new session, the Opening continues the current one. */
  /** One step request; each has its own timeout, since an opening continues in further requests. */
  async function postStep(step: Draft2RunStep, payload: Record<string, unknown>): Promise<Draft2SessionView> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STEP_REQUEST_TIMEOUT_MS);
    try {
      let response: Response;
      try {
        response = await fetch(`/api/radar/draft2/${step}?topicId=${encodeURIComponent(topicId)}`, {
          method: "POST", cache: "no-store", signal: controller.signal, headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
      } catch (cause) {
        throw new Draft2LostRequest(cause instanceof Error && cause.name === "AbortError" ? "The request took too long." : "The connection to the server dropped.");
      }
      const body = await response.json().catch(() => undefined) as { session?: Draft2SessionView; error?: string } | undefined;
      if (response.ok && body?.session) return body.session;
      // A gateway's page instead of the route's answer: the run may still be going.
      if (!body?.error) throw new Draft2LostRequest(`The server answered ${response.status} without a result.`);
      throw new Error(body.error);
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Follows a run whose request was lost until it finishes, pauses or goes silent; undefined when the server stays unreachable. */
  async function followRun(): Promise<Draft2SessionView | undefined> {
    let unreachableSince: number | undefined;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, FOLLOW_POLL_MS));
      let current: Draft2SessionView | null;
      try {
        current = await loadSession();
        unreachableSince = undefined;
      } catch {
        unreachableSince ??= Date.now();
        if (Date.now() - unreachableSince > FOLLOW_UNREACHABLE_MS) return undefined;
        continue;
      }
      if (!current?.opening) return current ?? undefined;
      setSession(current);
      if (current.opening.status !== "running" || Date.now() - Date.parse(current.updatedAt) > OPENING_STALL_MS) return current;
    }
  }

  /**
   * Runs one step: Facts starts a new session, the Focus and the Opening
   * continue the current one; `continuing` picks a paused or stopped opening
   * up. A run that pauses, or whose request is lost, goes on from its last
   * checkpoint in a new request until it finishes.
   */
  async function runStep(step: Draft2RunStep, { continuing = false } = {}) {
    if (running || (step !== "facts" && !session)) return;
    setRunning(step); setRunError(undefined); setChoiceError(undefined); setFocusError(undefined);
    try {
      if (step === "facts") {
        setSession(await postStep("facts", { storyId }));
        return;
      }
      if (step === "focus") {
        setSession(await postStep("focus", { storyId, sessionId: session?.id }));
        return;
      }
      let payload: Record<string, unknown> = { storyId, sessionId: session?.id, ...(continuing ? { continue: true } : {}) };
      // Each request advances at least one round or judgment; a round can pause once before its writer and once before its judge.
      for (let request = 0; request <= OPENING_MAX_ROUNDS * 2; request++) {
        let next: Draft2SessionView | undefined;
        try {
          next = await postStep("opening", payload);
        } catch (cause) {
          if (!(cause instanceof Draft2LostRequest)) throw cause;
          setFollowing(cause.message);
          next = await followRun();
          setFollowing(undefined);
          if (!next) throw new Error(`${cause.message} The server has not answered since; when it is back, reload and continue the run from where it stopped.`);
        }
        setSession(next);
        // Paused, or silent since its request was lost: pick it up again.
        if (next.opening?.status !== "paused" && next.opening?.status !== "running") return;
        payload = { storyId, sessionId: next.id, continue: true };
      }
    } catch (cause) {
      const failure = step === "facts" ? "The facts step failed." : step === "focus" ? "The focus step failed." : "The opening step failed.";
      const message = cause instanceof Draft2LostRequest ? `${cause.message} The server may still finish the step; reload to see it.` : cause instanceof Error ? cause.message : failure;
      setRunError({ step, message });
      // A failed run keeps its trace on the session; show it.
      loadSession().then(setSession).catch(() => undefined);
    } finally {
      setFollowing(undefined);
      setRunning(undefined);
    }
  }

  /** Saves one focus field the editor changed, or gives it back to Claude's value; one change at a time. */
  async function saveFocus(field: Draft2FocusField, change: { value: unknown } | { reset: true }) {
    if (!session || running || savingFocus) return;
    setSavingFocus(field); setFocusError(undefined);
    try {
      const response = await fetch(`/api/radar/draft2/focus?topicId=${encodeURIComponent(topicId)}`, {
        method: "PATCH", cache: "no-store", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, field, ...change }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save the focus.");
      setSession(body.session as Draft2SessionView);
    } catch (cause) {
      setFocusError(cause instanceof Error ? cause.message : "Could not save the focus.");
    } finally {
      setSavingFocus(undefined);
    }
  }

  async function chooseOpening(candidateId: string) {
    if (!session || choosing || running) return;
    setChoosing(candidateId); setChoiceError(undefined);
    try {
      const response = await fetch(`/api/radar/draft2/opening?topicId=${encodeURIComponent(topicId)}`, {
        method: "PATCH", cache: "no-store", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, candidateId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not record your choice.");
      setSession(body.session as Draft2SessionView);
    } catch (cause) {
      setChoiceError(cause instanceof Error ? cause.message : "Could not record your choice.");
    } finally {
      setChoosing(undefined);
    }
  }

  const host = content ? sourceHost(content.url) : "";
  const words = wordCount(content?.text);
  const text = paragraphs(content?.text);
  const contentReady = content?.contentStatus === "full" || content?.contentStatus === "likely-full";
  // Later steps only start on verified facts, so a session past Facts has them.
  const factsVerified = Boolean(session?.facts) && (session?.step !== "facts" || session?.status === "ready");
  const factsStatus = running === "facts" ? SESSION_STATUS.running : session ? (factsVerified ? SESSION_STATUS.ready : SESSION_STATUS[session.status]) : undefined;
  // A run still marked running whose heartbeat stopped: its request or the server ended, and it can be continued.
  const stalled = !running && session?.opening?.status === "running" && now > 0 && now - Date.parse(session.updatedAt) > OPENING_STALL_MS;
  const openingStatus = running === "opening" ? OPENING_STATUS.running : stalled ? { label: "Stopped", tone: "warning" as const } : session?.opening ? OPENING_STATUS[session.opening.status] : undefined;
  // The focus the opening would follow: decided, not being decided, and free of program findings.
  const focus = session?.focus ?? undefined;
  const focusProblems = focus?.values ? focusFindings(focus.values) : [];
  const focusStalled = !running && focus?.status === "running" && now > 0 && now - Date.parse(session?.updatedAt ?? "") > OPENING_STALL_MS;
  const focusReady = Boolean(focus?.values) && focus?.status !== "running" && focusProblems.length === 0;
  const focusStatus = running === "focus" ? FOCUS_STATUS.running : focusStalled ? { label: "Stopped", tone: "warning" as const }
    : focus?.values && focusProblems.length && focus.status !== "running" ? { label: "Needs a fix", tone: "warning" as const } : focus ? FOCUS_STATUS[focus.status] : undefined;
  // An opening written with another version of the focus, or before the Focus step.
  const openingFocusVersion = session?.opening?.focus?.version;
  const focusChanged = Boolean(session?.opening && focus?.values) && openingFocusVersion !== focus?.version;
  const stepStatus: Partial<Record<string, { label: string; tone: StatusTone }>> = { facts: factsStatus, focus: focusStatus, opening: openingStatus };
  const resumable = session?.opening && (session.opening.status === "paused" || stalled) && openingResumeRound(session.opening) <= OPENING_MAX_ROUNDS;
  const resumeRound = resumable && session?.opening ? openingResumeRound(session.opening) : undefined;
  const pausedRound = session?.opening?.status === "paused" ? openingResumeRound(session.opening) : undefined;

  return <main className={styles.shell} style={themeStyle}>
    <div className={styles.topbar}>
      <Link href={back} aria-label="Back to the story">← <span>Story</span></Link>
      <span className={styles.breadcrumb}>{topicName} <span aria-hidden="true">/</span> Production <span aria-hidden="true">/</span> Story <span aria-hidden="true">/</span> Draft 2</span>
    </div>
    {error ? <InlineNotice tone="error" title="Could not open the canvas" className={styles.notice}>{error} <Link href={back}>Back to the story</Link></InlineNotice> : null}
    {!content && !error ? <LoadingState className={styles.notice}>Loading the story…</LoadingState> : null}
    {content ? <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Draft 2 · a new pipeline, built one step at a time</p>
        <h1>{content.title}</h1>
        <p className={styles.meta}>
          {host ? <span>{host}</span> : null}
          <StatusBadge tone={contentReady ? "success" : "warning"}>{contentStatusLabel(content.contentStatus)}</StatusBadge>
          <span>{words.toLocaleString("en-CA")} words</span>
          {content.enrichment?.byline ? <span>{content.enrichment.byline}</span> : null}
          <a href={content.url} target="_blank" rel="noreferrer">Open the original ↗</a>
        </p>
      </header>
      <div className={styles.columns}>
        <Surface className={styles.column} aria-label="Source material">
          <SectionHeader level={3} eyebrow="Source material" title="What the story says" description="The stored text, exactly as every step will read it." />
          {text.length
            ? <div className={styles.reading}>{text.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
            : <EmptyState title="No article text yet">Prepare the content in the studio first; the canvas reads the same stored text.</EmptyState>}
        </Surface>
        <Surface className={styles.column} aria-label="Canvas">
          <SectionHeader level={3} eyebrow="Canvas" title={session?.opening ? "Facts, focus, then the opening" : session?.focus ? "Facts, then the focus" : session ? "Facts first" : "Nothing built yet"} description="Each step is added separately. The current studio keeps working as it does today." />
          <ol className={styles.steps}>
            {DRAFT_2_STEPS.map((step, index) => {
              const status = stepStatus[step.key];
              return <li key={step.key}>
                <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
                <div><strong>{step.title}</strong><p>{step.detail}</p></div>
                {status
                  ? <StatusBadge className={styles.stepStatus} tone={status.tone}>{status.label}</StatusBadge>
                  : <StatusBadge className={styles.stepStatus}>Not started</StatusBadge>}
              </li>;
            })}
          </ol>
          <section className={styles.factsPanel} aria-label="Facts step">
            <div className={styles.factsHeader}>
              <div>
                <p className={styles.eyebrow}>Step 1 · Facts</p>
                <p className={styles.factsIntro}>Sol extracts the facts; Claude checks them against the article; they loop on Claude’s suggestions, at most three extractions.</p>
              </div>
              <Button variant="primary" size="compact" busy={running === "facts"} disabled={!text.length || session === undefined || running !== undefined} onClick={() => { void runStep("facts"); }}>
                {running === "facts" ? "Extracting and verifying…" : session ? "Run the facts again" : "Extract and verify facts"}
              </Button>
            </div>
            {running === "facts" ? <LoadingState>Sol is extracting; Claude reviews each round. This can take a minute or two.</LoadingState> : null}
            {runError?.step === "facts" ? <InlineNotice tone="error" title="The facts step stopped">{runError.message}</InlineNotice> : null}
            {session?.step === "facts" && session.error && running !== "facts" ? <InlineNotice tone={session.status === "failed" ? "error" : "warning"}>{session.error}</InlineNotice> : null}
            {session && running !== "facts" ? <FactsSessionView session={session} verified={factsVerified} /> : null}
          </section>
          <section className={styles.factsPanel} aria-label="Focus step">
            <div className={styles.factsHeader}>
              <div>
                <p className={styles.eyebrow}>Step 2 · Focus</p>
                <p className={styles.factsIntro}>Claude reads the verified facts, the Topic’s creative profile and its editorial lines, and decides what the story is for: the line it serves, its audience, framing, reader consequence, structure, goal, voice and direction. Change any field; your changes stay yours when Claude decides again, and the opening follows the result.</p>
              </div>
              <Button variant="primary" size="compact" busy={running === "focus"} disabled={!factsVerified || running !== undefined || savingFocus !== undefined} onClick={() => { void runStep("focus"); }}>
                {running === "focus" ? "Deciding…" : focus?.values ? "Decide again" : "Decide the focus"}
              </Button>
            </div>
            {!factsVerified && !running ? <p className={styles.factMeta}>The focus builds only on verified facts; verify them first.</p> : null}
            {running === "focus" ? <LoadingState>Claude is deciding the focus{focus?.edited.length ? `, keeping your ${focus.edited.length === 1 ? "change" : `${focus.edited.length} changes`}` : ""}. This can take a minute.</LoadingState> : null}
            {focusStalled ? <InlineNotice tone="warning" title="This decision stopped">Its request or the server ended before Claude answered. Decide the focus again.</InlineNotice> : null}
            {runError?.step === "focus" ? <InlineNotice tone="error" title="The focus step stopped">{runError.message}</InlineNotice> : null}
            {focus?.status === "failed" && focus.error && running !== "focus" ? <InlineNotice tone="error" title="The last decision failed">{focus.error}{focus.values ? " The focus below is the one from before it." : ""}</InlineNotice> : null}
            {focusError ? <InlineNotice tone="error" title="Your change was not saved">{focusError}</InlineNotice> : null}
            {focus?.values && running !== "focus" ? <FocusView
              focus={focus}
              findings={focusProblems}
              saving={savingFocus}
              locked={running !== undefined || savingFocus !== undefined}
              onSave={(field, value) => { void saveFocus(field, { value }); }}
              onReset={(field) => { void saveFocus(field, { reset: true }); }}
            /> : null}
          </section>
          <section className={styles.factsPanel} aria-label="Opening step">
            <div className={styles.factsHeader}>
              <div>
                <p className={styles.eyebrow}>Step 3 · Opening</p>
                <p className={styles.factsIntro}>{TODAY.writer} writes fifteen openings (cover and slide 2) from the verified facts, following the focus; {TODAY.judge} scores them and proposes three of its own. {TODAY.writer} revises the three best and edits {TODAY.judge}’s proposals, which also compete as {TODAY.judge} wrote them; {TODAY.judge} scores all nine without knowing which are its own, and proposes one more, which competes the same way beside {TODAY.writer}’s two best for {TODAY.judge}’s final pick. The better version always stays, and an opening that says what the facts do not never wins. Accepted at 95/100 with no criterion below 85, how well it follows the focus included.</p>
              </div>
              <ActionRow>
                {resumeRound && !running ? <Button variant="secondary" size="compact" onClick={() => { void runStep("opening", { continuing: true }); }}>Continue from round {resumeRound}</Button> : null}
                <Button variant="primary" size="compact" busy={running === "opening"} disabled={!factsVerified || !focusReady || running !== undefined || savingFocus !== undefined} onClick={() => { void runStep("opening"); }}>
                  {running === "opening" ? "Writing and judging…" : session?.opening ? "Write the opening again" : "Write the opening"}
                </Button>
              </ActionRow>
            </div>
            {!factsVerified && !running ? <p className={styles.factMeta}>The opening builds only on verified facts; verify them first.</p> : null}
            {factsVerified && !focusReady && !running ? <p className={styles.factMeta}>{focus?.values && focus.status !== "running" ? "The opening waits until the focus is fixed (see the notes above)." : "The opening follows the story’s focus; decide it first."}</p> : null}
            {focusChanged && running !== "opening" && focus ? <InlineNotice tone="info" title="The focus changed">{openingFocusVersion ? `This opening followed focus v${openingFocusVersion}; the focus is now v${focus.version}.` : "This opening was written before the Focus step."} Write it again to follow the focus as it stands.</InlineNotice> : null}
            {running === "opening" ? <LoadingState>{following ? `${following} Following the run on the server…` : pausedRound ? `Continuing with round ${pausedRound} in a new request…` : `${TODAY.writer} writes fifteen openings; ${TODAY.judge} judges each round. This can take a few minutes.`}</LoadingState> : null}
            {stalled && session ? <InlineNotice tone="warning" title="This run stopped">It has not answered since {new Date(session.updatedAt).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })}: its request or the server ended. Continue from round {resumeRound} picks it up at its last checkpoint; a round already written is judged, not written again.</InlineNotice> : null}
            {runError?.step === "opening" ? <InlineNotice tone="error" title="The opening step stopped">{runError.message}</InlineNotice> : null}
            {session?.step === "opening" && session.error && running !== "opening" ? <InlineNotice tone={session.status === "failed" ? "error" : "warning"}>{session.error}</InlineNotice> : null}
            {choiceError ? <InlineNotice tone="error" title="Your choice was not saved">{choiceError}</InlineNotice> : null}
            {session?.opening && running !== "opening" ? <OpeningView opening={session.opening} choosing={choosing} locked={running !== undefined || session.opening.status === "running"} onChoose={(candidateId) => { void chooseOpening(candidateId); }} /> : null}
          </section>
          {session?.trace.length && !running ? <details className={styles.trace}>
            <summary>{session.trace.length} provider {session.trace.length === 1 ? "call" : "calls"}</summary>
            <ol className={styles.traceList}>
              {session.trace.map((entry, index) => <li key={index} data-outcome={entry.outcome}>
                <span>{providerLabel(entry.provider)} · {entry.model} · {entry.operation} · {entry.step} round {entry.round}</span>
                <span>{entry.outcome === "ok" ? `${entry.usage?.promptTokens ?? 0} in · ${entry.usage?.outputTokens ?? 0} out${entry.cachedInputTokens ? ` · ${entry.cachedInputTokens} cached` : ""}${entry.cacheWriteTokens ? ` · ${entry.cacheWriteTokens} written to cache` : ""}` : entry.note ?? "failed"} · {(entry.durationMs / 1000).toFixed(1)} s</span>
              </li>)}
            </ol>
          </details> : null}
        </Surface>
      </div>
    </div> : null}
  </main>;
}

function FactsSessionView({ session, verified }: { session: Draft2SessionView; verified: boolean }) {
  return <>
    {session.rounds.length ? <ol className={styles.roundList} aria-label="Rounds">
      {session.rounds.map((round) => <li key={round.round} className={styles.roundCard}>
        <div className={styles.factHead}>
          <strong>Round {round.round}</strong>
          <span>Sol extracted {round.facts.length} {round.facts.length === 1 ? "fact" : "facts"}</span>
          {round.evaluation
            ? <StatusBadge tone={round.evaluation.verdict === "valid" && round.mechanical.length === 0 ? "success" : "warning"}>Claude: {round.evaluation.verdict} · {round.evaluation.score}/100</StatusBadge>
            : <StatusBadge tone="neutral">Claude did not answer</StatusBadge>}
        </div>
        {round.restored?.length ? <p className={styles.factMeta}>Sol dropped {round.restored.length} valid {round.restored.length === 1 ? "fact" : "facts"} without a reason ({round.restored.join(", ")}); the program put them back before the review.</p> : null}
        {round.evaluation ? <p className={styles.factMeta}>{round.evaluation.summary}</p> : null}
        {round.mechanical.length || round.evaluation?.issues.length ? <ul className={styles.issueList}>
          {round.mechanical.map((issue, index) => <li key={`m${index}`}><strong>Program · {issue.code}</strong>{issue.factId ? ` · ${issue.factId}` : ""}: {issue.detail}</li>)}
          {(round.evaluation?.issues ?? []).map((issue, index) => <li key={`r${index}`}><strong>{issue.code}</strong>{issue.factId ? ` · ${issue.factId}` : ""}: {issue.detail}</li>)}
        </ul> : null}
        {round.evaluation?.suggestions.length ? <details><summary>{round.evaluation.suggestions.length} {round.evaluation.suggestions.length === 1 ? "suggestion" : "suggestions"} for the next pass</summary>
          <ul className={styles.issueList}>{round.evaluation.suggestions.map((suggestion, index) => <li key={index}>{suggestion}</li>)}</ul>
        </details> : null}
      </li>)}
    </ol> : null}
    {session.facts?.length ? <div>
      <SectionHeader level={3} title={`${session.facts.length} facts`} description={verified ? "Verified: the next steps build only on these." : "The latest list; not verified yet."} />
      <ol className={styles.factList}>
        {session.facts.map((fact) => <li key={fact.id} className={styles.factItem}>
          <div className={styles.factHead}>
            <span className={styles.factId}>{fact.id}</span>
            <StatusBadge tone={FACT_STATUS[fact.status].tone}>{FACT_STATUS[fact.status].label}</StatusBadge>
            <span className={styles.factMeta}>{fact.kind} · importance {fact.importance}</span>
          </div>
          <p className={styles.factClaim}>{fact.claim}</p>
          {fact.qualifier || fact.attribution ? <p className={styles.factMeta}>{[
            fact.qualifier,
            // "according to X" already names the source; do not say it twice.
            fact.attribution && !fact.qualifier?.toLowerCase().includes(fact.attribution.toLowerCase()) ? `attributed to ${fact.attribution}` : undefined,
          ].filter(Boolean).join(" · ")}</p> : null}
          <details><summary>Evidence</summary><blockquote>{fact.evidence}</blockquote></details>
        </li>)}
      </ol>
    </div> : null}
  </>;
}

/** The Opening step: every round's verdict, the opening the next steps build on, and every other version to choose from. */
function OpeningView({ opening, choosing, locked, onChoose }: { opening: Draft2Opening; choosing?: string; locked: boolean; onChoose: (candidateId: string) => void }) {
  const names = roleNames(opening);
  const versions = openingVersions(opening.rounds);
  const chosen = versions.find((version) => version.candidate.id === (opening.editorChoiceId ?? opening.winnerId));
  const others = versions.filter((version) => version !== chosen).sort((a, b) => (b.score?.overall ?? 0) - (a.score?.overall ?? 0));
  const winnerLabel = opening.status === "ready" ? "Accepted" : "Best so far";
  return <>
    {opening.rounds.length ? <ol className={styles.roundList} aria-label="Opening rounds">
      {opening.rounds.map((round) => <OpeningRoundView key={round.round} round={round} names={names} />)}
    </ol> : null}
    {chosen ? <ChosenOpening
      version={chosen}
      names={names}
      label={opening.editorChoiceId ? "Your choice" : winnerLabel}
      tone={opening.editorChoiceId || opening.status === "ready" ? "success" : "warning"}
    /> : null}
    {others.length ? <div className={styles.openingGroup}>
      <SectionHeader level={3} title={chosen ? "Every other version" : "Every version"} description={`All the openings of this run, as ${names.judge} scored them. The one you choose is what the next steps build on.`} />
      <ol className={styles.factList}>
        {others.map((version) => <li key={version.candidate.id} className={styles.factItem}>
          <div className={styles.factHead}>
            <span className={styles.factId}>{version.candidate.id}</span>
            {version.score ? <StatusBadge tone={openingScorePasses(version.score) ? "success" : "neutral"}>{version.score.overall}/100</StatusBadge> : null}
            {version.findings.length ? <StatusBadge tone="warning">{version.findings.length} program {version.findings.length === 1 ? "finding" : "findings"}</StatusBadge> : null}
            {hasMaterialError(version) ? <StatusBadge tone="error">Factual error</StatusBadge> : null}
            {version.candidate.id === opening.winnerId ? <StatusBadge tone="info">{winnerLabel}</StatusBadge> : null}
            <span className={styles.factMeta}>{versionOrigin(version, names)}</span>
          </div>
          <p className={styles.factClaim}>{version.candidate.cover.headline}</p>
          <p className={styles.factMeta}>{version.candidate.cover.subheadline}</p>
          <p className={styles.factMeta}>Slide 2 · {version.candidate.slide2.headline}</p>
          <div>
            <Button variant="quiet" size="compact" busy={choosing === version.candidate.id} disabled={locked || choosing !== undefined} onClick={() => onChoose(version.candidate.id)}>Choose this opening</Button>
          </div>
        </li>)}
      </ol>
    </div> : null}
  </>;
}

function OpeningRoundView({ round, names }: { round: Draft2OpeningRound; names: RoleNames }) {
  const evaluation = round.evaluation;
  const programWinner = evaluation ? openingAcceptedWinner(round.mechanical, evaluation) : undefined;
  const winnerId = programWinner ?? evaluation?.winnerId;
  const winner = evaluation?.scores.find((score) => score.candidateId === winnerId);
  const revised = round.candidates.flatMap((candidate) => candidate.revisionOf ? [candidate.revisionOf] : []);
  const edited = round.candidates.filter((candidate) => candidate.proposalOf && !candidate.asProposed).map((candidate) => candidate.id);
  const originals = round.candidates.filter((candidate) => candidate.asProposed);
  const fresh = round.candidates.filter((candidate) => !candidate.revisionOf && !candidate.proposalOf).map((candidate) => candidate.id);
  const wrote = listed([
    revised.length ? `revised ${listed(revised)}` : "",
    edited.length ? `edited ${edited.length} of ${names.judge}’s proposals (${edited.join(", ")})` : "",
    fresh.length ? (revised.length || edited.length || originals.length ? `tried ${fresh.length} new ${fresh.length === 1 ? "angle" : "angles"} (${fresh.join(", ")})` : `wrote ${fresh.length} ${fresh.length === 1 ? "opening" : "openings"}`) : "",
  ].filter(Boolean));
  const proposals = evaluation?.proposals ?? [];
  // Each proposal as the judge wrote it against the writer's edit: whose version scored higher.
  const scoreOf = (id?: string) => evaluation?.scores.find((score) => score.candidateId === id)?.overall;
  const duels = originals.map((original) => {
    const edit = round.candidates.find((candidate) => candidate.proposalOf === original.proposalOf && !candidate.asProposed);
    return `${original.proposalOf} ${scoreOf(original.id) ?? "–"} as written / ${edit ? `${scoreOf(edit.id) ?? "–"} edited` : "not edited"}`;
  });
  return <li className={styles.roundCard}>
    <div className={styles.factHead}>
      <strong>Round {round.round}</strong>
      <span>{wrote ? `${names.writer} ${wrote}` : ""}{originals.length ? `${wrote ? "; " : ""}${names.judge}’s ${originals.length === 1 ? "proposal competes" : "proposals compete"} as written too (${originals.map((original) => original.id).join(", ")})` : ""}</span>
      {evaluation
        ? <StatusBadge tone={programWinner ? "success" : "warning"}>{names.judge}: {evaluation.verdict} · {winnerId} {winner?.overall}/100</StatusBadge>
        : <StatusBadge tone="neutral">{names.judge} did not answer</StatusBadge>}
    </div>
    {duels.length ? <p className={styles.factMeta}>{names.judge}’s proposals, as written against {names.writer}’s edits: {duels.join(" · ")}.</p> : null}
    {(round.regressions ?? []).map((regression) => <p key={regression.candidateId} className={styles.factMeta}>{regressionNote(regression)}</p>)}
    {evaluation && programWinner && programWinner !== evaluation.winnerId ? <p className={styles.factMeta}>{names.judge} picked {evaluation.winnerId}, which has a program finding; {programWinner}, the best clean candidate, meets the thresholds and wins.</p> : null}
    {evaluation ? <p className={styles.factMeta}>{evaluation.summary}</p> : null}
    {winner ? <ScoreRow score={winner} /> : null}
    {round.mechanical.length || evaluation?.issues.length ? <ul className={styles.issueList}>
      {round.mechanical.map((issue, index) => <li key={`m${index}`}><strong>Program · {issue.code}</strong>{issueTarget(issue)}: {issue.detail}</li>)}
      {(evaluation?.issues ?? []).map((issue, index) => <li key={`j${index}`}><strong>{issue.material ? `Material · ${issue.code}` : issue.code}</strong>{issueTarget(issue)}: {issue.detail}</li>)}
    </ul> : null}
    {evaluation?.suggestions.length ? <details><summary>{evaluation.suggestions.length} {evaluation.suggestions.length === 1 ? "suggestion" : "suggestions"} for the next round</summary>
      <ul className={styles.issueList}>{evaluation.suggestions.map((suggestion, index) => <li key={index}>{suggestion}</li>)}</ul>
    </details> : null}
    {proposals.length ? <details><summary>{names.judge} proposed {proposals.length} {proposals.length === 1 ? "opening" : "openings"} for the next round</summary>
      <ul className={styles.issueList}>{proposals.map((proposal) => <li key={proposal.id}><strong>{proposal.id}</strong>: {proposal.cover.headline} · slide 2: {proposal.slide2.headline}</li>)}</ul>
    </details> : null}
  </li>;
}

/** The opening the next steps build on, as two 4:5 cards: the cover and slide 2. */
function ChosenOpening({ version, names, label, tone }: { version: Draft2OpeningVersion; names: RoleNames; label: string; tone: StatusTone }) {
  const { candidate, score } = version;
  return <div className={styles.openingGroup}>
    <div className={styles.factHead}>
      <span className={styles.factId}>{candidate.id}</span>
      <StatusBadge tone={tone}>{label}</StatusBadge>
      {score ? <strong>{score.overall}/100</strong> : null}
      {candidate.angle ? <span>{candidate.angle}</span> : null}
      <span className={styles.factMeta}>{versionOrigin(version, names)}</span>
    </div>
    {score ? <ScoreRow score={score} /> : null}
    {score?.note ? <p className={styles.factMeta}>{score.note}</p> : null}
    <div className={styles.openingCards}>
      <article className={styles.openingCard} aria-label="Cover">
        <p className={styles.eyebrow}>Cover</p>
        <p className={styles.openingHeadline}>{candidate.cover.headline}</p>
        <p className={styles.openingText}>{candidate.cover.subheadline}</p>
        <p className={styles.openingFacts}>Facts · {candidate.cover.factIds.join(", ")}</p>
      </article>
      <article className={styles.openingCard} aria-label="Slide 2">
        <p className={styles.eyebrow}>Slide 2</p>
        <p className={styles.openingHeadline}>{candidate.slide2.headline}</p>
        <p className={styles.openingText}>{candidate.slide2.body}</p>
        <p className={styles.openingFacts}>Facts · {candidate.slide2.factIds.join(", ")}</p>
      </article>
    </div>
  </div>;
}

function ScoreRow({ score }: { score: Draft2OpeningScore }) {
  return <p className={styles.scoreRow}>
    {OPENING_CRITERIA.map((criterion) => {
      // A score stored before the Focus step has no focus criterion.
      const value = criterionScore(score, criterion);
      return value === undefined ? null : <span key={criterion} data-low={value < OPENING_CRITERION_FLOOR ? "" : undefined}>{CRITERION_LABEL[criterion]} <strong>{value}</strong></span>;
    })}
    <span>Overall <strong>{score.overall}</strong></span>
  </p>;
}

const clip = (value: string, max = 140) => value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;

/** A field's value in a few words, for Claude's value beside the editor's choice. */
function focusValueText(field: Draft2FocusField, values: Draft2FocusValues): string {
  switch (field) {
    case "line": return values.line?.name ?? "no line";
    case "audience": return values.audience;
    case "framing": return FRAMING_LABEL[values.framing];
    case "readerConsequence": return values.readerConsequence?.text ?? "none";
    case "structure": return STRUCTURE_LABEL[values.structure.kind];
    case "goal": return GOAL_LABEL[values.goal];
    case "voice": return `${GRAVITY_LABEL[values.voice.gravity]} · ${TONE_KEYS.map((key) => `${key} ${values.voice[key]}`).join(" · ")}`;
    case "direction": return values.direction;
  }
}

/**
 * The Focus step: every field with Claude's reason, or the editor's choice
 * beside Claude's value. Selects save when they change, text when it loses
 * focus; the controls wait while a change is saved or a step runs.
 */
function FocusView({ focus, findings, saving, locked, onSave, onReset }: {
  focus: Draft2Focus;
  findings: readonly Draft2FocusFinding[];
  saving?: Draft2FocusField;
  locked: boolean;
  onSave: (field: Draft2FocusField, value: unknown) => void;
  onReset: (field: Draft2FocusField) => void;
}) {
  const values = focus.values!;
  const decided = focus.decidedAt ? new Date(focus.decidedAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : undefined;
  const edited = (field: Draft2FocusField) => focus.edited.includes(field);
  /** Claude's reason, or, for the editor's field, Claude's value beside it. */
  const about = (field: Draft2FocusField, detail?: string) => [
    edited(field) ? `Your choice. Claude’s: ${focus.ai ? clip(focusValueText(field, focus.ai)) : "none"}.` : focus.reasons?.[field],
    detail,
  ].filter(Boolean).join(" ") || undefined;
  const reset = (field: Draft2FocusField) => edited(field)
    ? <div><Button variant="quiet" size="compact" busy={saving === field} disabled={locked} onClick={() => onReset(field)}>Use Claude’s</Button></div>
    : null;
  const consequence = values.readerConsequence;
  const items = values.structure.itemFactIds;
  // Text fields start again from the saved value whenever the focus changes.
  const key = (field: Draft2FocusField) => `${field}-${focus.version}`;
  return <div className={styles.focusBody}>
    <p className={styles.factMeta}>Focus v{focus.version}{decided ? ` · decided by Claude, ${decided}` : ""}{focus.edited.length ? ` · ${focus.edited.length} of your ${focus.edited.length === 1 ? "change" : "changes"} kept` : ""}. The opening follows this version.</p>
    {findings.length ? <InlineNotice tone="warning" title="The opening waits for this">{findings.map((finding) => finding.detail).join(" ")}</InlineNotice> : null}
    <div className={styles.focusGrid}>
      <div className={styles.focusField}>
        <FormField label="Editorial line" description={about("line", values.line?.objective ? `The line: ${clip(values.line.objective, 220)}` : undefined)}>
          <select value={values.line?.id ?? ""} disabled={locked || !focus.lineOptions.length} onChange={(event) => onSave("line", event.target.value)}>
            {focus.lineOptions.length
              ? focus.lineOptions.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)
              : <option value="">The Topic has no editorial line</option>}
          </select>
        </FormField>
        {reset("line")}
      </div>
      <div className={styles.focusField}>
        <FocusText key={key("audience")} label="Audience" description={about("audience")} value={values.audience} max={FOCUS_AUDIENCE_MAX_CHARACTERS} disabled={locked} onCommit={(value) => onSave("audience", value)} />
        {reset("audience")}
      </div>
      <div className={styles.focusField}>
        <FormField label="Framing" description={about("framing")}>
          <select value={values.framing} disabled={locked} onChange={(event) => onSave("framing", event.target.value)}>
            {FOCUS_FRAMINGS.map((framing) => <option key={framing} value={framing}>{FRAMING_LABEL[framing]}</option>)}
          </select>
        </FormField>
        {reset("framing")}
      </div>
      <div className={styles.focusField}>
        <FocusText
          key={key("readerConsequence")}
          label="Reader consequence"
          description={about("readerConsequence", consequence?.factIds.length ? `Facts · ${consequence.factIds.join(", ")}` : consequence ? "Your words: guidance, not a fact." : "None: no fact establishes one.")}
          value={consequence?.text ?? ""}
          max={FOCUS_CONSEQUENCE_MAX_CHARACTERS}
          allowEmpty
          disabled={locked}
          onCommit={(value) => onSave("readerConsequence", value)}
        />
        {reset("readerConsequence")}
      </div>
      <div className={styles.focusField}>
        <FormField label="Structure" description={about("structure", values.structure.kind === "arc" ? undefined : items.length ? `${items.length} ${values.structure.kind === "list" ? "items" : "steps"} · ${items.join(", ")}` : "No items yet: decide again for Claude to find them.")}>
          <select value={values.structure.kind} disabled={locked} onChange={(event) => onSave("structure", event.target.value)}>
            {FOCUS_STRUCTURES.map((kind) => <option key={kind} value={kind}>{STRUCTURE_LABEL[kind]}</option>)}
          </select>
        </FormField>
        {reset("structure")}
      </div>
      <div className={styles.focusField}>
        <FormField label="Goal" description={about("goal")}>
          <select value={values.goal} disabled={locked} onChange={(event) => onSave("goal", event.target.value)}>
            {FOCUS_GOALS.map((goal) => <option key={goal} value={goal}>{GOAL_LABEL[goal]}</option>)}
          </select>
        </FormField>
        {reset("goal")}
      </div>
      <div className={`${styles.focusField} ${styles.focusWide}`}>
        <FocusVoice key={key("voice")} voice={values.voice} description={about("voice")} disabled={locked} onCommit={(voice) => onSave("voice", voice)} />
        {reset("voice")}
      </div>
      <div className={`${styles.focusField} ${styles.focusWide}`}>
        <FocusText key={key("direction")} label="Direction" description={about("direction")} value={values.direction} max={FOCUS_DIRECTION_MAX_CHARACTERS} rows={5} disabled={locked} onCommit={(value) => onSave("direction", value)} />
        {reset("direction")}
      </div>
    </div>
  </div>;
}

/** A text field that saves when it loses focus and changed; an emptied required field goes back to the saved value. */
function FocusText({ label, description, value, max, rows = 2, allowEmpty = false, disabled, onCommit }: {
  label: string; description?: string; value: string; max: number; rows?: number; allowEmpty?: boolean; disabled: boolean; onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return <FormField label={label} description={description}>
    <textarea
      value={draft}
      rows={rows}
      maxLength={max}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft.trim() === value.trim()) return;
        if (!draft.trim() && !allowEmpty) { setDraft(value); return; }
        onCommit(draft);
      }}
    />
  </FormField>;
}

/** The story's gravity and its five tone dials, saved together: the gravity when it changes, a dial when it loses focus. */
function FocusVoice({ voice, description, disabled, onCommit }: { voice: Draft2FocusVoice; description?: string; disabled: boolean; onCommit: (voice: Draft2FocusVoice) => void }) {
  const [draft, setDraft] = useState(voice);
  const commit = (next: Draft2FocusVoice) => { if (JSON.stringify(next) !== JSON.stringify(voice)) onCommit(next); };
  return <fieldset className={styles.focusVoice}>
    <legend className={styles.focusLegend}>Voice</legend>
    <div className={styles.voiceDials}>
      <FormField label="Gravity">
        <select value={draft.gravity} disabled={disabled} onChange={(event) => {
          const next = { ...draft, gravity: event.target.value as Draft2FocusVoice["gravity"] };
          setDraft(next);
          commit(next);
        }}>
          {FOCUS_GRAVITIES.map((gravity) => <option key={gravity} value={gravity}>{GRAVITY_LABEL[gravity]}</option>)}
        </select>
      </FormField>
      {TONE_KEYS.map((key) => <FormField key={key} label={TONE_LABEL[key]} description={toneWords(key, draft[key])}>
        <input
          type="number"
          min={1}
          max={100}
          step={1}
          value={Number.isFinite(draft[key]) ? draft[key] : ""}
          disabled={disabled}
          onChange={(event) => setDraft({ ...draft, [key]: event.target.valueAsNumber })}
          onBlur={() => {
            const value = Math.round(draft[key]);
            if (Number.isInteger(value) && value >= 1 && value <= 100) commit({ ...draft, [key]: value });
            else setDraft(voice);
          }}
        />
      </FormField>)}
    </div>
    {description ? <p className={styles.factMeta}>{description}</p> : null}
  </fieldset>;
}
