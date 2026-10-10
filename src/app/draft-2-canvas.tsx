"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ActionRow, Button, EmptyState, InlineNotice, LoadingState, SectionHeader, StatusBadge, Surface, type StatusTone } from "@/app/ui/primitives";
import type { StoryContentResponse } from "@/app/radar-dashboard";
import type { Draft2Fact, Draft2FactsEvaluation, Draft2FactsRound, Draft2SessionStatus, Draft2TraceEntry } from "@/app/modules/draft2/draft2-facts.types";
import {
  OPENING_CRITERIA, OPENING_CRITERION_FLOOR, OPENING_MAX_ROUNDS, openingAcceptedWinner, openingScorePasses, openingVersions,
  type Draft2Opening, type Draft2OpeningCriterion, type Draft2OpeningIssue, type Draft2OpeningRegression, type Draft2OpeningRound, type Draft2OpeningScore, type Draft2OpeningVersion,
} from "@/app/modules/draft2/draft2-opening.types";
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
  opening: Draft2Opening | null;
  trace: Draft2TraceEntry[];
  error: string | null;
  updatedAt: string;
};

type Draft2RunStep = "facts" | "opening";

/** Up to three rounds of two provider calls; the route itself allows 300 s. */
const STEP_REQUEST_TIMEOUT_MS = 540_000;

const SESSION_STATUS: Record<Draft2SessionStatus, { label: string; tone: StatusTone }> = {
  running: { label: "Running", tone: "info" },
  ready: { label: "Verified", tone: "success" },
  "needs-review": { label: "Needs review", tone: "warning" },
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

const CRITERION_LABEL: Record<Draft2OpeningCriterion, string> = { tension: "Tension", payoff: "Payoff", clarity: "Clarity", grounding: "Grounding", voice: "Voice" };

const providerLabel = (provider: Draft2TraceEntry["provider"]) => provider === "openai" ? "Sol" : "Claude";
/** Where a version comes from: its round, and the version it revises or the proposal of Claude's it develops. */
const versionOrigin = ({ round, candidate }: Draft2OpeningVersion) =>
  `round ${round}${candidate.revisionOf ? ` · revises ${candidate.revisionOf}` : ""}${candidate.proposalOf ? ` · develops Claude’s ${candidate.proposalOf}` : ""}`;

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
 * story and runs each step on it: Facts, then the Opening.
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
  /** One step request; each has its own timeout, since a paused opening continues in further requests. */
  async function postStep(step: Draft2RunStep, payload: Record<string, unknown>): Promise<Draft2SessionView> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STEP_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`/api/radar/draft2/${step}?topicId=${encodeURIComponent(topicId)}`, {
        method: "POST", cache: "no-store", signal: controller.signal, headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? (step === "facts" ? "The facts step failed." : "The opening step failed."));
      return body.session as Draft2SessionView;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Runs one step: Facts starts a new session, the Opening continues the current one; `continuing` runs a paused opening on. */
  async function runStep(step: Draft2RunStep, { continuing = false } = {}) {
    if (running || (step === "opening" && !session)) return;
    setRunning(step); setRunError(undefined); setChoiceError(undefined);
    try {
      let next = await postStep(step, step === "facts" ? { storyId } : { storyId, sessionId: session?.id, ...(continuing ? { continue: true } : {}) });
      // A run that paused for time goes on in a new request, one round at least each time, until it finishes.
      for (let request = 0; step === "opening" && next.opening?.status === "paused" && request < OPENING_MAX_ROUNDS; request++) {
        setSession(next);
        next = await postStep("opening", { storyId, sessionId: next.id, continue: true });
      }
      setSession(next);
    } catch (cause) {
      const failure = step === "facts" ? "The facts step failed." : "The opening step failed.";
      setRunError({ step, message: cause instanceof Error && cause.name === "AbortError" ? "The request took too long. The server may still finish the step; reload to see it." : cause instanceof Error ? cause.message : failure });
      // A failed run keeps its trace on the session; show it.
      loadSession().then(setSession).catch(() => undefined);
    } finally {
      setRunning(undefined);
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
  const openingStatus = running === "opening" ? OPENING_STATUS.running : session?.opening ? OPENING_STATUS[session.opening.status] : undefined;
  const stepStatus: Partial<Record<string, { label: string; tone: StatusTone }>> = { facts: factsStatus, opening: openingStatus };
  const resumeRound = session?.opening?.status === "paused" ? session.opening.resumeRound : undefined;

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
          <SectionHeader level={3} eyebrow="Canvas" title={session?.opening ? "Facts, then the opening" : session ? "Facts first" : "Nothing built yet"} description="Each step is added separately. The current studio keeps working as it does today." />
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
          <section className={styles.factsPanel} aria-label="Opening step">
            <div className={styles.factsHeader}>
              <div>
                <p className={styles.eyebrow}>Step 2 · Opening</p>
                <p className={styles.factsIntro}>Sol writes fifteen openings (cover and slide 2) from the verified facts; Claude scores them and proposes three of its own. Sol revises the three best, develops Claude’s proposals and tries three new angles; Claude scores them without knowing which grew from its proposals, and proposes one more. Sol refines the two best and develops it for Claude’s final pick. The better version always stays. Accepted at 95/100 with no criterion below 85.</p>
              </div>
              <ActionRow>
                {resumeRound && !running ? <Button variant="secondary" size="compact" onClick={() => { void runStep("opening", { continuing: true }); }}>Continue from round {resumeRound}</Button> : null}
                <Button variant="primary" size="compact" busy={running === "opening"} disabled={!factsVerified || running !== undefined} onClick={() => { void runStep("opening"); }}>
                  {running === "opening" ? "Writing and judging…" : session?.opening ? "Write the opening again" : "Write the opening"}
                </Button>
              </ActionRow>
            </div>
            {!factsVerified && !running ? <p className={styles.factMeta}>The opening builds only on verified facts; verify them first.</p> : null}
            {running === "opening" ? <LoadingState>{resumeRound ? `Continuing with round ${resumeRound} in a new request…` : "Sol writes fifteen openings; Claude judges each round. This can take a few minutes."}</LoadingState> : null}
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
  const versions = openingVersions(opening.rounds);
  const chosen = versions.find((version) => version.candidate.id === (opening.editorChoiceId ?? opening.winnerId));
  const others = versions.filter((version) => version !== chosen).sort((a, b) => (b.score?.overall ?? 0) - (a.score?.overall ?? 0));
  const winnerLabel = opening.status === "ready" ? "Accepted" : "Best so far";
  return <>
    {opening.rounds.length ? <ol className={styles.roundList} aria-label="Opening rounds">
      {opening.rounds.map((round) => <OpeningRoundView key={round.round} round={round} />)}
    </ol> : null}
    {chosen ? <ChosenOpening
      version={chosen}
      label={opening.editorChoiceId ? "Your choice" : winnerLabel}
      tone={opening.editorChoiceId || opening.status === "ready" ? "success" : "warning"}
    /> : null}
    {others.length ? <div className={styles.openingGroup}>
      <SectionHeader level={3} title={chosen ? "Every other version" : "Every version"} description="All the openings of this run, as Claude scored them. The one you choose is what the next steps build on." />
      <ol className={styles.factList}>
        {others.map((version) => <li key={version.candidate.id} className={styles.factItem}>
          <div className={styles.factHead}>
            <span className={styles.factId}>{version.candidate.id}</span>
            {version.score ? <StatusBadge tone={openingScorePasses(version.score) ? "success" : "neutral"}>{version.score.overall}/100</StatusBadge> : null}
            {version.findings.length ? <StatusBadge tone="warning">{version.findings.length} program {version.findings.length === 1 ? "finding" : "findings"}</StatusBadge> : null}
            {version.candidate.id === opening.winnerId ? <StatusBadge tone="info">{winnerLabel}</StatusBadge> : null}
            <span className={styles.factMeta}>{versionOrigin(version)}</span>
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

function OpeningRoundView({ round }: { round: Draft2OpeningRound }) {
  const evaluation = round.evaluation;
  const programWinner = evaluation ? openingAcceptedWinner(round.mechanical, evaluation) : undefined;
  const winnerId = programWinner ?? evaluation?.winnerId;
  const winner = evaluation?.scores.find((score) => score.candidateId === winnerId);
  const revised = round.candidates.flatMap((candidate) => candidate.revisionOf ? [candidate.revisionOf] : []);
  const developed = round.candidates.filter((candidate) => candidate.proposalOf).map((candidate) => candidate.id);
  const fresh = round.candidates.filter((candidate) => !candidate.revisionOf && !candidate.proposalOf).map((candidate) => candidate.id);
  const wrote = listed([
    revised.length ? `revised ${listed(revised)}` : "",
    developed.length ? `developed ${developed.length} of Claude’s proposals (${developed.join(", ")})` : "",
    fresh.length ? (revised.length || developed.length ? `tried ${fresh.length} new ${fresh.length === 1 ? "angle" : "angles"} (${fresh.join(", ")})` : `wrote ${fresh.length} ${fresh.length === 1 ? "opening" : "openings"}`) : "",
  ].filter(Boolean));
  const proposals = evaluation?.proposals ?? [];
  return <li className={styles.roundCard}>
    <div className={styles.factHead}>
      <strong>Round {round.round}</strong>
      <span>Sol {wrote}</span>
      {evaluation
        ? <StatusBadge tone={programWinner ? "success" : "warning"}>Claude: {evaluation.verdict} · {winnerId} {winner?.overall}/100</StatusBadge>
        : <StatusBadge tone="neutral">Claude did not answer</StatusBadge>}
    </div>
    {(round.regressions ?? []).map((regression) => <p key={regression.candidateId} className={styles.factMeta}>{regressionNote(regression)}</p>)}
    {evaluation && programWinner && programWinner !== evaluation.winnerId ? <p className={styles.factMeta}>Claude picked {evaluation.winnerId}, which has a program finding; {programWinner}, the best clean candidate, meets the thresholds and wins.</p> : null}
    {evaluation ? <p className={styles.factMeta}>{evaluation.summary}</p> : null}
    {winner ? <ScoreRow score={winner} /> : null}
    {round.mechanical.length || evaluation?.issues.length ? <ul className={styles.issueList}>
      {round.mechanical.map((issue, index) => <li key={`m${index}`}><strong>Program · {issue.code}</strong>{issueTarget(issue)}: {issue.detail}</li>)}
      {(evaluation?.issues ?? []).map((issue, index) => <li key={`j${index}`}><strong>{issue.code}</strong>{issueTarget(issue)}: {issue.detail}</li>)}
    </ul> : null}
    {evaluation?.suggestions.length ? <details><summary>{evaluation.suggestions.length} {evaluation.suggestions.length === 1 ? "suggestion" : "suggestions"} for the next round</summary>
      <ul className={styles.issueList}>{evaluation.suggestions.map((suggestion, index) => <li key={index}>{suggestion}</li>)}</ul>
    </details> : null}
    {proposals.length ? <details><summary>Claude proposed {proposals.length} {proposals.length === 1 ? "opening" : "openings"} for the next round</summary>
      <ul className={styles.issueList}>{proposals.map((proposal) => <li key={proposal.id}><strong>{proposal.id}</strong>: {proposal.cover.headline} · slide 2: {proposal.slide2.headline}</li>)}</ul>
    </details> : null}
  </li>;
}

/** The opening the next steps build on, as two 4:5 cards: the cover and slide 2. */
function ChosenOpening({ version, label, tone }: { version: Draft2OpeningVersion; label: string; tone: StatusTone }) {
  const { candidate, score } = version;
  return <div className={styles.openingGroup}>
    <div className={styles.factHead}>
      <span className={styles.factId}>{candidate.id}</span>
      <StatusBadge tone={tone}>{label}</StatusBadge>
      {score ? <strong>{score.overall}/100</strong> : null}
      {candidate.angle ? <span>{candidate.angle}</span> : null}
      <span className={styles.factMeta}>{versionOrigin(version)}</span>
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
    {OPENING_CRITERIA.map((criterion) => <span key={criterion} data-low={score[criterion] < OPENING_CRITERION_FLOOR ? "" : undefined}>{CRITERION_LABEL[criterion]} <strong>{score[criterion]}</strong></span>)}
    <span>Overall <strong>{score.overall}</strong></span>
  </p>;
}
