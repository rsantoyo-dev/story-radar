"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Button, EmptyState, InlineNotice, LoadingState, SectionHeader, StatusBadge, Surface, type StatusTone } from "@/app/ui/primitives";
import type { StoryContentResponse } from "@/app/radar-dashboard";
import type { Draft2Fact, Draft2FactsEvaluation, Draft2FactsRound, Draft2SessionStatus, Draft2TraceEntry } from "@/app/modules/draft2/draft2-facts.types";
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
  trace: Draft2TraceEntry[];
  error: string | null;
  updatedAt: string;
};

/** Up to three extractions and three reviews; the route itself allows 300 s. */
const FACTS_REQUEST_TIMEOUT_MS = 540_000;

const SESSION_STATUS: Record<Draft2SessionStatus, { label: string; tone: StatusTone }> = {
  running: { label: "Running", tone: "info" },
  ready: { label: "Verified", tone: "success" },
  "needs-review": { label: "Needs review", tone: "warning" },
  failed: { label: "Failed", tone: "error" },
};

const FACT_STATUS: Record<Draft2Fact["status"], { label: string; tone: StatusTone }> = {
  established: { label: "Established", tone: "success" },
  attributed: { label: "Attributed", tone: "info" },
  disputed: { label: "Disputed", tone: "warning" },
};

const providerLabel = (provider: Draft2TraceEntry["provider"]) => provider === "openai" ? "Sol" : "Claude";

/**
 * Draft 2: the second creative pipeline, built one step at a time beside the
 * current studio, which it never touches. The canvas brings in the selected
 * story and runs each step on it; today, Facts.
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
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string>();
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
    const response = await fetch(`/api/radar/draft2/facts?topicId=${encodeURIComponent(topicId)}&storyId=${encodeURIComponent(storyId)}`, { cache: "no-store", signal, headers: { Authorization: `Bearer ${secret}` } });
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

  async function runFacts() {
    if (running) return;
    setRunning(true); setRunError(undefined);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FACTS_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`/api/radar/draft2/facts?topicId=${encodeURIComponent(topicId)}`, {
        method: "POST", cache: "no-store", signal: controller.signal, headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ storyId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The facts step failed.");
      setSession(body.session as Draft2SessionView);
    } catch (cause) {
      setRunError(cause instanceof Error && cause.name === "AbortError" ? "The request took too long. The server may still finish the step; reload to see it." : cause instanceof Error ? cause.message : "The facts step failed.");
      // A failed run keeps its trace on the session; show it.
      loadSession().then(setSession).catch(() => undefined);
    } finally {
      clearTimeout(timeout);
      setRunning(false);
    }
  }

  const host = content ? sourceHost(content.url) : "";
  const words = wordCount(content?.text);
  const text = paragraphs(content?.text);
  const contentReady = content?.contentStatus === "full" || content?.contentStatus === "likely-full";
  const factsStatus = running ? SESSION_STATUS.running : session ? SESSION_STATUS[session.status] : undefined;

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
          <SectionHeader level={3} eyebrow="Canvas" title={session ? "Facts first" : "Nothing built yet"} description="Each step is added separately. The current studio keeps working as it does today." />
          <ol className={styles.steps}>
            {DRAFT_2_STEPS.map((step, index) => <li key={step.key}>
              <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
              <div><strong>{step.title}</strong><p>{step.detail}</p></div>
              {step.key === "facts" && factsStatus
                ? <StatusBadge className={styles.stepStatus} tone={factsStatus.tone}>{factsStatus.label}</StatusBadge>
                : <StatusBadge className={styles.stepStatus}>Not started</StatusBadge>}
            </li>)}
          </ol>
          <section className={styles.factsPanel} aria-label="Facts step">
            <div className={styles.factsHeader}>
              <div>
                <p className={styles.eyebrow}>Step 1 · Facts</p>
                <p className={styles.factsIntro}>Sol extracts the facts; Claude checks them against the article; they loop on Claude’s suggestions, at most three extractions.</p>
              </div>
              <Button variant="primary" size="compact" busy={running} disabled={!text.length || session === undefined} onClick={() => { void runFacts(); }}>
                {running ? "Extracting and verifying…" : session ? "Run the facts again" : "Extract and verify facts"}
              </Button>
            </div>
            {running ? <LoadingState>Sol is extracting; Claude reviews each round. This can take a minute or two.</LoadingState> : null}
            {runError ? <InlineNotice tone="error" title="The facts step stopped">{runError}</InlineNotice> : null}
            {session?.error && !running ? <InlineNotice tone={session.status === "failed" ? "error" : "warning"}>{session.error}</InlineNotice> : null}
            {session && !running ? <FactsSessionView session={session} /> : null}
          </section>
        </Surface>
      </div>
    </div> : null}
  </main>;
}

function FactsSessionView({ session }: { session: Draft2SessionView }) {
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
      <SectionHeader level={3} title={`${session.facts.length} facts`} description={session.status === "ready" ? "Verified: the next steps build only on these." : "The latest list; not verified yet."} />
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
    {session.trace.length ? <details className={styles.trace}>
      <summary>{session.trace.length} provider {session.trace.length === 1 ? "call" : "calls"}</summary>
      <ol className={styles.traceList}>
        {session.trace.map((entry, index) => <li key={index} data-outcome={entry.outcome}>
          <span>{providerLabel(entry.provider)} · {entry.model} · {entry.operation} · round {entry.round}</span>
          <span>{entry.outcome === "ok" ? `${entry.usage?.promptTokens ?? 0} in · ${entry.usage?.outputTokens ?? 0} out${entry.cachedInputTokens ? ` · ${entry.cachedInputTokens} cached` : ""}` : entry.note ?? "failed"} · {(entry.durationMs / 1000).toFixed(1)} s</span>
        </li>)}
      </ol>
    </details> : null}
  </>;
}
