"use client";

import type { CreativeHookTournament, HookMechanism } from "./modules/stories/creative-hook-tournament";
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
          {score.reason ? <em> — {score.reason}</em> : null}
        </p>
      ) : candidate.rejected ? <p className={styles.hookScores}>Rejected: {candidate.rejected}</p> : null}
    </li>
  );
}

/**
 * The script's cover tournament: the finalists with their scores, the cover in
 * use, and the editor's choice. Picking a cover saves it as a new version and
 * teaches the judge this publication's taste.
 */
export function CreativeHookTournamentPanel({ tournament, error, currentHeadline, disabled, busy, onImprove, onUse }: {
  tournament?: CreativeHookTournament;
  error?: string;
  currentHeadline: string;
  disabled: boolean;
  busy: boolean;
  onImprove: () => void;
  onUse: (index: number) => void;
}) {
  const ranked = (tournament?.candidates ?? [])
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => !candidate.rejected && candidate.total !== undefined)
    .sort((a, b) => (b.candidate.total ?? 0) - (a.candidate.total ?? 0));
  const finalists = ranked.slice(0, 4);
  const selected = tournament ? ranked.find(({ index }) => index === tournament.selectedIndex) : undefined;
  if (selected && !finalists.includes(selected)) finalists.push(selected);
  const others = (tournament?.candidates ?? []).map((candidate, index) => ({ candidate, index }))
    .filter((entry) => !finalists.some((finalist) => finalist.index === entry.index));
  const summary = !tournament
    ? "GPT-6.1 Sol writes about ten covers for this audience, a blind judge ranks them, the best are polished and judged again. Facts and qualifiers never change."
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
          {busy ? "Writing and judging covers… about 2–3 minutes" : tournament ? "Run the cover tournament again" : "Find a stronger cover"}
        </button>
      </div>
      {error && !tournament ? <p className={styles.hookPanelNote}>{error}</p> : null}
      {finalists.length ? (
        <ul className={styles.hookOptions}>
          {finalists.map(({ candidate, index }) => (
            <CoverOption key={index} candidate={candidate} index={index} chosen={index === tournament?.selectedIndex}
              onCover={candidate.headline === currentHeadline} disabled={disabled} onUse={onUse} />
          ))}
        </ul>
      ) : null}
      {others.length ? (
        <details className={styles.hookAll}>
          <summary>All {tournament?.candidates.length} covers</summary>
          <ul className={styles.hookOptions}>
            {others.map(({ candidate, index }) => (
              <CoverOption key={index} candidate={candidate} index={index} chosen={index === tournament?.selectedIndex}
                onCover={candidate.headline === currentHeadline} disabled={disabled} onUse={onUse} />
            ))}
          </ul>
        </details>
      ) : null}
      {tournament ? <p className={styles.hookPanelNote}>Choosing a cover saves a new version to approve and teaches the judge your taste for this publication.</p> : null}
    </section>
  );
}
