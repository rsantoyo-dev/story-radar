"use client";

import { useEffect, useRef } from "react";

import {
  hookOpeningForDraft,
  openingOnDraft,
  tournamentOwnsSecondSlide,
  type CreativeHookTournament,
  type HookMechanism,
} from "./modules/stories/creative-hook-tournament";
import styles from "./creative-draft-workspace.generated.module.css";

const MECHANISM_LABELS: Record<HookMechanism | "incumbent", string> = {
  recognition: "Recognition",
  place: "Known place",
  pride: "Local pride",
  "human-scale": "Human scale",
  consequence: "Consequence",
  curiosity: "Curiosity",
  contrast: "Contrast",
  incumbent: "Writer's cover",
};

type Candidate = CreativeHookTournament["candidates"][number];

function CoverOption({ candidate, index, chosen, onCover, disabled, onUse }: {
  candidate: Candidate;
  index: number;
  chosen: boolean;
  onCover: boolean;
  disabled: boolean;
  onUse: (index: number) => void;
}) {
  const score = candidate.score;
  return (
    <li className={`${styles.hookOption} ${chosen ? styles.hookOptionChosen : ""}`}>
      <div className={styles.hookOptionText}>
        <strong>{candidate.headline}</strong>
        {candidate.subheadline ? <span>{candidate.subheadline}</span> : null}
        {candidate.secondHeadline ? (
          <span className={styles.hookSecond}>
            Slide 2: {candidate.secondHeadline}{candidate.secondSubheadline ? ` — ${candidate.secondSubheadline}` : ""}
          </span>
        ) : candidate.secondDropped ? <span className={styles.hookSecond} title={candidate.secondDropped}>Slide 2: unchanged</span> : null}
      </div>
      <div className={styles.hookOptionAction}>
        {onCover
          ? <span className={styles.hookCurrent}>On the cover</span>
          : <button type="button" className={styles.secondaryButton} disabled={disabled || Boolean(candidate.rejected)} onClick={() => onUse(index)}>Use this cover</button>}
      </div>
      <div className={styles.hookOptionMeta}>
        <span>{MECHANISM_LABELS[candidate.mechanism]}</span>
        {candidate.segment ? <span>{candidate.segment}</span> : null}
        {candidate.round === 2 ? <span>Polished</span> : null}
      </div>
      {score ? (
        <p className={styles.hookScores} title={score.reason}>
          <b>{candidate.total}</b>
          Recognition {score.recognition} · Clarity {score.clarity} · Pull {score.pull} · Fidelity {score.fidelity} · Payoff {score.payoff} · Natural {score.naturalness}
          {score.slide2 !== undefined && candidate.secondHeadline ? ` · Slide 2 ${score.slide2}` : ""}
          {score.reason ? <em> — {score.reason}</em> : null}
        </p>
      ) : candidate.rejected ? <p className={styles.hookScores}>Rejected: {candidate.rejected}</p> : null}
    </li>
  );
}

type OpeningUnit = { headline: string; subheadline?: string };

/**
 * The script's cover tournament: the finalists with their scores, the opening
 * in use, and the editor's choice. Picking a cover saves it, with its slide 2
 * headline, as a new version and teaches the judge this publication's taste.
 */
export function CreativeHookTournamentPanel({ tournament, error, pendingKey, currentUnits, disabled, busy, onImprove, onUse }: {
  tournament?: CreativeHookTournament;
  error?: string;
  /**
   * Set when the run ran out of time before the tournament (draft id and
   * version): the panel starts it once, as soon as the studio is free.
   */
  pendingKey?: string;
  /** The draft's cover and slide 2 as they are now. */
  currentUnits: readonly OpeningUnit[];
  disabled: boolean;
  busy: boolean;
  onImprove: () => void;
  onUse: (index: number) => void;
}) {
  const started = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!pendingKey || tournament || disabled || started.current === pendingKey) return;
    started.current = pendingKey;
    onImprove();
  }, [pendingKey, tournament, disabled, onImprove]);

  const ranked = (tournament?.candidates ?? [])
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => !candidate.rejected && candidate.total !== undefined)
    .sort((a, b) => (b.candidate.total ?? 0) - (a.candidate.total ?? 0));
  const finalists = ranked.slice(0, 4);
  const selected = tournament ? ranked.find(({ index }) => index === tournament.selectedIndex) : undefined;
  if (selected && !finalists.includes(selected)) finalists.push(selected);
  const others = (tournament?.candidates ?? []).map((candidate, index) => ({ candidate, index }))
    .filter((entry) => !finalists.some((finalist) => finalist.index === entry.index));
  const onDraft = (candidate: Candidate) => Boolean(tournament) && openingOnDraft(currentUnits, hookOpeningForDraft(tournament!, currentUnits, candidate));
  // A slide 2 changed after the tournament is kept when a cover is chosen.
  const secondKept = Boolean(tournament?.candidates.some((candidate) => candidate.secondHeadline)) && !tournamentOwnsSecondSlide(tournament!, currentUnits);
  const summary = !tournament
    ? "GPT-6.1 Sol writes six covers for this audience, each with the slide 2 headline that pays it off; a blind judge ranks them, and the two best are polished and judged again. Facts and qualifiers never change."
    : tournament.replaced
    ? `Chosen from ${tournament.candidates.length} covers${tournament.editorChoice ? " by you" : ""}.`
    : `The writer's cover held up against ${tournament.candidates.length - 1} alternatives${tournament.editorChoice ? "; you kept it" : ""}.`;

  return (
    <section className={styles.hookPanel} aria-label="Cover tournament">
      <div className={styles.hookPanelHeader}>
        <div>
          <strong>Cover · GPT-6.1 Sol</strong>
          <p>{summary}</p>
        </div>
        <button type="button" className={styles.secondaryButton} disabled={disabled} onClick={onImprove}>
          {busy ? "Writing and judging covers… about 1–2 minutes" : tournament ? "Run the cover tournament again" : "Find a stronger cover"}
        </button>
      </div>
      {pendingKey && !tournament ? <p className={styles.hookPanelNote}>The script was written without time left to choose its cover, so the cover tournament runs now as its own step.</p> : null}
      {error && !tournament ? <p className={styles.hookPanelNote}>{error}</p> : null}
      {finalists.length ? (
        <ul className={styles.hookOptions}>
          {finalists.map(({ candidate, index }) => (
            <CoverOption key={index} candidate={candidate} index={index} chosen={index === tournament?.selectedIndex}
              onCover={onDraft(candidate)} disabled={disabled} onUse={onUse} />
          ))}
        </ul>
      ) : null}
      {others.length ? (
        <details className={styles.hookAll}>
          <summary>All {tournament?.candidates.length} covers</summary>
          <ul className={styles.hookOptions}>
            {others.map(({ candidate, index }) => (
              <CoverOption key={index} candidate={candidate} index={index} chosen={index === tournament?.selectedIndex}
                onCover={onDraft(candidate)} disabled={disabled} onUse={onUse} />
            ))}
          </ul>
        </details>
      ) : null}
      {tournament ? (
        <p className={styles.hookPanelNote}>
          Choosing a cover saves a new version to approve and teaches the judge your taste for this publication.
          {secondKept ? " Slide 2 changed after this tournament, so choosing a cover keeps the current slide 2." : ""}
        </p>
      ) : null}
    </section>
  );
}
