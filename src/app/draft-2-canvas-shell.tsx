"use client";

import { useEffect, useLayoutEffect, useRef, type AnchorHTMLAttributes, type ReactNode, type RefObject } from "react";
import { Button, StatusBadge, type StatusTone } from "@/app/ui/primitives";
import { DRAFT_2_PHASES, draft2StepForKey, draft2StepNumber, type Draft2RailState, type Draft2StepKey } from "./draft-2-canvas.core";
import styles from "./draft-2-canvas.generated.module.css";

/**
 * The frame of the Draft 2 canvas: the pipeline rail, each step's screen,
 * the pager between screens, the article beside them and the overview's
 * board. Every screen has its own URL; the canvas switches between them in
 * the browser (window.history.pushState, which the Next.js router follows),
 * so the page, its state and a run in progress stay where they are.
 */

/** One step as the rail, the board and the pager show it. */
export type ScreenStep = {
  key: Draft2StepKey;
  title: string;
  detail: string;
  state: Draft2RailState;
  status?: { label: string; tone: StatusTone };
  /** What the step produced, in a line (the overview's board). */
  summary?: string;
  /** Time and cost so far, in a line. */
  vitals?: string;
  /** Cost so far alone, for the rail's short line. */
  cost?: string;
  href: string;
};

/** The word a step without a status badge reads as. */
const STATE_LABEL: Record<Draft2RailState, string> = {
  done: "Done", running: "Running", attention: "Needs a look", failed: "Failed", idle: "Ready to start", blocked: "Waits on an earlier step",
};

export const screenStatusLabel = (step: ScreenStep) => step.status?.label ?? STATE_LABEL[step.state];

/**
 * A link to one screen of the canvas: a real link, so it opens in a new tab
 * or window as any link does, switched in place on a plain click.
 */
export function ScreenLink({ href, onNavigate, children, ...props }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick"> & {
  href: string;
  onNavigate: () => void;
  children: ReactNode;
}) {
  return <a {...props} href={href} onClick={(event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate();
  }}>{children}</a>;
}

/**
 * The pipeline rail: the overview with the story's progress, then the ten
 * steps in their four phases, each with its number in a ring that reads its
 * state and the line between rings filling as steps are done. A vertical
 * rail beside the screen on a wide window, a strip of steps above it on a
 * narrow one, the current step kept in view.
 */
export function Draft2Rail({ current, overviewHref, steps, onNavigate }: {
  current: Draft2StepKey | undefined;
  overviewHref: string;
  steps: readonly ScreenStep[];
  onNavigate: (screen: Draft2StepKey | undefined) => void;
}) {
  const rail = useRef<HTMLElement>(null);
  const done = steps.filter((step) => step.state === "done").length;
  useEffect(() => {
    rail.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [current]);
  return <nav ref={rail} className={styles.rail} aria-label="Draft 2 steps">
    <ScreenLink href={overviewHref} onNavigate={() => onNavigate(undefined)} className={styles.railOverview} aria-current={current ? undefined : "page"}>
      <span className={styles.railOverviewTitle}>Overview</span>
      <span className={styles.railOverviewMeta}>{done} of {steps.length} steps done</span>
      <span className={styles.railProgress} aria-hidden="true"><span style={{ width: `${Math.round((done / Math.max(steps.length, 1)) * 100)}%` }} /></span>
    </ScreenLink>
    {DRAFT_2_PHASES.map((phase) => <section key={phase.key} className={styles.railPhase} aria-labelledby={`draft2-rail-${phase.key}`}>
      <p id={`draft2-rail-${phase.key}`} className={styles.railPhaseTitle}>{phase.title}</p>
      <ol className={styles.railList}>
        {phase.steps.map((key) => {
          const step = steps.find((entry) => entry.key === key);
          if (!step) return null;
          return <li key={key} data-state={step.state}>
            <ScreenLink href={step.href} onNavigate={() => onNavigate(key)} className={styles.railLink} aria-current={current === key ? "page" : undefined}>
              <span className={styles.railRing} aria-hidden="true">{draft2StepNumber(key)}</span>
              <span className={styles.railText}>
                <span className={styles.railTitle}>{step.title}</span>
                <span className={styles.railMeta}>{[screenStatusLabel(step), step.cost].filter(Boolean).join(" · ")}</span>
              </span>
            </ScreenLink>
          </li>;
        })}
      </ol>
    </section>)}
  </nav>;
}

/**
 * One step's screen: where it sits in the pipeline, its name and status,
 * what it does in a line, its time and cost, its actions, how it works on
 * demand, then its content, its own provider calls and the way to the
 * screens before and after it.
 */
export function StepScreen({ step, phase, total, headingRef, actions, how, trace, pager, children }: {
  step: ScreenStep;
  phase: string;
  total: number;
  headingRef: RefObject<HTMLHeadingElement | null>;
  actions?: ReactNode;
  how?: ReactNode;
  trace?: ReactNode;
  pager: ReactNode;
  children: ReactNode;
}) {
  return <article className={styles.screen} aria-labelledby="draft2-screen-title" data-state={step.state}>
    <header className={styles.screenHead}>
      <p className={styles.screenKicker}>Step {draft2StepNumber(step.key)} of {total} · {phase}</p>
      <div className={styles.screenTitleRow}>
        <span className={styles.railRing} aria-hidden="true">{draft2StepNumber(step.key)}</span>
        <h1 id="draft2-screen-title" ref={headingRef} tabIndex={-1} className={styles.screenTitle}>{step.title}</h1>
        <StatusBadge tone={step.status?.tone ?? "neutral"}>{screenStatusLabel(step)}</StatusBadge>
      </div>
      <p className={styles.screenLead}>{step.detail}</p>
      {step.vitals ? <p className={styles.screenVitals}>{step.vitals}</p> : null}
      {actions ? <div className={styles.screenActions}>{actions}</div> : null}
      {how ? <details className={styles.screenHow}>
        <summary>How this step works</summary>
        <div className={styles.screenHowBody}>{how}</div>
      </details> : null}
    </header>
    <div className={styles.screenBody}>{children}</div>
    {trace}
    {pager}
  </article>;
}

/** What a step needs before it can run, with the way to the step that provides it. */
export function Prerequisite({ to, title, href, onNavigate, children }: { to: Draft2StepKey; title: string; href: string; onNavigate: (screen: Draft2StepKey) => void; children: ReactNode }) {
  return <div className={styles.prereq} role="note">
    <p>{children}</p>
    <ScreenLink href={href} onNavigate={() => onNavigate(to)}>Go to {draft2StepNumber(to)} · {title} →</ScreenLink>
  </div>;
}

type PagerTarget = { screen: Draft2StepKey | undefined; title: string; href: string; status?: string };

/** The screens before and after the current one, as two cards; the arrow keys move between them too. */
export function StepPager({ previous, next, onNavigate }: { previous?: PagerTarget; next?: PagerTarget; onNavigate: (screen: Draft2StepKey | undefined) => void }) {
  return <nav className={styles.pager} aria-label="Previous and next screen">
    {previous ? <ScreenLink href={previous.href} onNavigate={() => onNavigate(previous.screen)} className={styles.pagerLink} data-direction="previous" rel="prev">
      <span className={styles.pagerHint}>← Previous</span>
      <span className={styles.pagerTitle}>{previous.screen ? `${draft2StepNumber(previous.screen)} · ` : ""}{previous.title}</span>
      {previous.status ? <span className={styles.pagerMeta}>{previous.status}</span> : null}
    </ScreenLink> : null}
    {next ? <ScreenLink href={next.href} onNavigate={() => onNavigate(next.screen)} className={styles.pagerLink} data-direction="next" rel="next">
      <span className={styles.pagerHint}>Next →</span>
      <span className={styles.pagerTitle}>{next.screen ? `${draft2StepNumber(next.screen)} · ` : ""}{next.title}</span>
      {next.status ? <span className={styles.pagerMeta}>{next.status}</span> : null}
    </ScreenLink> : null}
    <p className={styles.pagerKeys}>← and → move between screens · 1 to 9 and 0 open a step</p>
  </nav>;
}

/** The pipeline at a glance: every step's state as one segment, in order. */
export function PipelineStrip({ steps }: { steps: readonly ScreenStep[] }) {
  return <ol className={styles.strip} aria-hidden="true">
    {steps.map((step) => <li key={step.key} data-state={step.state} title={`${draft2StepNumber(step.key)} · ${step.title}: ${screenStatusLabel(step)}`} />)}
  </ol>;
}

/** The overview's board: each phase's steps as cards with their status, what they produced and what they took. */
export function OverviewBoard({ steps, onNavigate }: { steps: readonly ScreenStep[]; onNavigate: (screen: Draft2StepKey) => void }) {
  return <div className={styles.board}>
    {DRAFT_2_PHASES.map((phase) => <section key={phase.key} className={styles.boardPhase} aria-labelledby={`draft2-board-${phase.key}`}>
      <h2 id={`draft2-board-${phase.key}`} className={styles.boardPhaseTitle}>{phase.title}</h2>
      <ol className={styles.boardList}>
        {phase.steps.map((key) => {
          const step = steps.find((entry) => entry.key === key);
          if (!step) return null;
          return <li key={key}>
            <ScreenLink href={step.href} onNavigate={() => onNavigate(key)} className={styles.boardCard} data-state={step.state}>
              <span className={styles.boardHead}>
                <span className={styles.railRing} aria-hidden="true">{draft2StepNumber(key)}</span>
                <span className={styles.boardTitle}>{step.title}</span>
              </span>
              <span className={styles.boardSummary}>{step.summary ?? step.detail}</span>
              <span className={styles.boardFoot}>
                <StatusBadge tone={step.status?.tone ?? "neutral"}>{screenStatusLabel(step)}</StatusBadge>
                {step.vitals ? <span className={styles.boardMeta}>{step.vitals}</span> : null}
              </span>
            </ScreenLink>
          </li>;
        })}
      </ol>
    </section>)}
  </div>;
}

/** The article beside the screens: docked as a third column on a wide window, over the screen on a narrower one; Escape closes it. */
export function SourcePanel({ id, open, title, meta, children, onClose }: { id: string; open: boolean; title: string; meta?: ReactNode; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, onClose]);
  return <aside id={id} className={styles.source} hidden={!open} aria-label="The article">
    <div className={styles.sourceHead}>
      <div>
        <p className={styles.screenKicker}>The article</p>
        <p className={styles.sourceTitle}>{title}</p>
        {meta ? <p className={styles.sourceMeta}>{meta}</p> : null}
      </div>
      <Button variant="quiet" size="compact" onClick={onClose}>Close</Button>
    </div>
    <div className={styles.sourceBody}>{children}</div>
  </aside>;
}

/** Whether a key press belongs to a text field, a list or a dialog rather than to the canvas. */
function typingInto(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName) || Boolean(target.closest("[role=dialog]"));
}

/** The canvas's keys, outside text fields and dialogs: ← and → (or [ and ]) to the screens around this one, 1 to 9 and 0 to a step. */
export function useScreenShortcuts(current: Draft2StepKey | undefined, onNavigate: (screen: Draft2StepKey | undefined) => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || (event.altKey && event.key.startsWith("Arrow")) || typingInto(event.target)) return;
      const screen = draft2StepForKey(event.key, current);
      if (!screen) return;
      event.preventDefault();
      onNavigate(screen === "overview" ? undefined : screen);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, onNavigate, enabled]);
}

/** The tab and history entry name the screen open: "Opening · Draft 2 · <story>", so the browser's back menu reads as the pipeline. */
export function useScreenTitle(screen: string | undefined, story: string | undefined) {
  useEffect(() => {
    if (!story) return;
    const previous = document.title;
    document.title = `${screen ? `${screen} · ` : ""}Draft 2 · ${story}`;
    return () => { document.title = previous; };
  }, [screen, story]);
}

/**
 * Each screen keeps its own scroll position: coming back to a step returns
 * to where the editor left it, a screen seen for the first time opens at the
 * top. The browser's own restoration is off while the canvas is open, since
 * the screen it would restore for is drawn only after it acts. A screen
 * reached from another takes the focus on its title, so a screen reader
 * announces it.
 */
export function useScreenMemory(screen: string, headingRef: RefObject<HTMLHeadingElement | null>) {
  const memory = useRef(new Map<string, number>());
  const active = useRef(screen);
  const restoring = useRef(false);
  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const remember = () => { if (!restoring.current) memory.current.set(active.current, window.scrollY); };
    window.addEventListener("scroll", remember, { passive: true });
    return () => {
      window.removeEventListener("scroll", remember);
      window.history.scrollRestoration = previous;
    };
  }, []);
  useLayoutEffect(() => {
    if (active.current === screen) return;
    restoring.current = true;
    active.current = screen;
    window.scrollTo({ top: memory.current.get(screen) ?? 0, behavior: "instant" });
    headingRef.current?.focus({ preventScroll: true });
    const frame = requestAnimationFrame(() => { restoring.current = false; });
    return () => cancelAnimationFrame(frame);
  }, [screen, headingRef]);
}
