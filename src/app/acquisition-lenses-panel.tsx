"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  parseTopicAcquisitionLenses,
  AcquisitionLensError,
  type TopicAcquisitionLens,
  type TopicAcquisitionTaxonomy,
} from "./modules/stories/acquisition-lenses";
import styles from "./radar-dashboard.generated.module.css";

const HOOK_BIASES = ["", "capability", "stake", "contrast"] as const;

/**
 * Editor surface for a topic's acquisition vocabulary. Publishing is
 * append-only and version-checked server-side, so a stale editor is rejected
 * rather than silently overwriting someone else's vocabulary.
 */
export function AcquisitionLensesPanel({
  topicId,
  secret,
  disabled,
}: {
  topicId: string;
  secret: string;
  disabled: boolean;
}) {
  const [taxonomy, setTaxonomy] = useState<TopicAcquisitionTaxonomy>();
  const [lenses, setLenses] = useState<TopicAcquisitionLens[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const posting = useRef(false);

  const load = useCallback(async () => {
    if (!secret.trim() || !topicId) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/radar/topics/${encodeURIComponent(topicId)}/acquisition-lenses`,
        { headers: { Authorization: `Bearer ${secret.trim()}` }, cache: "no-store" },
      );
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setTaxonomy(value.taxonomy);
      setLenses(value.taxonomy.lenses);
      setStatus("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the acquisition vocabulary");
    } finally {
      setBusy(false);
    }
  }, [topicId, secret]);

  useEffect(() => {
    // Deferred so the first render never sets state synchronously.
    const initial = setTimeout(() => void load(), 0);
    return () => clearTimeout(initial);
  }, [load]);

  function update(index: number, patch: Partial<TopicAcquisitionLens>) {
    setLenses((current) => current.map((lens, i) => (i === index ? { ...lens, ...patch } : lens)));
    setStatus("");
  }

  function setFallback(index: number) {
    // Exactly one enabled lens is the fallback; selecting one clears the rest.
    setLenses((current) => current.map((lens, i) => ({ ...lens, isFallback: i === index })));
    setStatus("");
  }

  async function publish() {
    if (posting.current || !taxonomy) return;
    let validated: TopicAcquisitionLens[];
    try {
      // Same parser the route uses, so the editor reports a contract breach
      // before spending a request.
      validated = parseTopicAcquisitionLenses(lenses);
    } catch (cause) {
      setError(cause instanceof AcquisitionLensError ? cause.message : "Invalid vocabulary");
      return;
    }
    posting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/radar/topics/${encodeURIComponent(topicId)}/acquisition-lenses`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${secret.trim()}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedTaxonomyVersion: taxonomy.taxonomyVersion,
            lenses: validated,
          }),
        },
      );
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setTaxonomy(value.taxonomy);
      setLenses(value.taxonomy.lenses);
      setStatus(`Published version ${value.taxonomy.taxonomyVersion}. Existing briefs keep the version they were classified under.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to publish the acquisition vocabulary");
    } finally {
      posting.current = false;
      setBusy(false);
    }
  }

  const blocked = disabled || busy || !secret.trim();
  const enabled = lenses.filter((lens) => lens.enabled);
  const shares = enabled.filter((lens) => lens.targetShare !== undefined);
  const shareTotal = shares.reduce((sum, lens) => sum + (lens.targetShare ?? 0), 0);

  return (
    <section className={styles.acquisitionLenses} aria-label="Acquisition vocabulary">
      <header>
        <span className={styles.eyebrow}>Acquisition vocabulary</span>
        <h2>Why a story earns audience</h2>
        <p>
          The lenses this topic can classify a story under. The creative brief picks exactly one;
          the daily planner uses the spread only as a tie-breaker.
        </p>
        {taxonomy && <small>Version {taxonomy.taxonomyVersion} · publishing creates a new version and never rewrites past decisions.</small>}
      </header>

      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}

      <ol className={styles.acquisitionLensList}>
        {lenses.map((lens, index) => (
          <li key={lens.key} data-enabled={lens.enabled ? "yes" : "no"}>
            <div className={styles.acquisitionLensHead}>
              <code>{lens.key}</code>
              <label>
                <input
                  type="checkbox"
                  checked={lens.enabled}
                  disabled={blocked}
                  onChange={(event) => update(index, { enabled: event.target.checked })}
                />
                Enabled
              </label>
              <label>
                <input
                  type="radio"
                  name="acquisition-fallback"
                  checked={lens.isFallback}
                  disabled={blocked || !lens.enabled}
                  onChange={() => setFallback(index)}
                />
                Fallback
              </label>
            </div>
            <label>
              Label
              <input
                value={lens.label}
                disabled={blocked}
                onChange={(event) => update(index, { label: event.target.value })}
              />
            </label>
            <label>
              Definition
              <textarea
                value={lens.definition}
                rows={2}
                disabled={blocked}
                onChange={(event) => update(index, { definition: event.target.value })}
              />
            </label>
            <div className={styles.acquisitionLensMeta}>
              <label>
                Hook bias
                <select
                  value={lens.hookBias ?? ""}
                  disabled={blocked}
                  onChange={(event) =>
                    update(index, {
                      hookBias: (event.target.value || undefined) as TopicAcquisitionLens["hookBias"],
                    })
                  }
                >
                  {HOOK_BIASES.map((bias) => (
                    <option key={bias || "none"} value={bias}>{bias || "No steering"}</option>
                  ))}
                </select>
              </label>
              <label>
                Target share
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={lens.targetShare ?? ""}
                  disabled={blocked || !lens.enabled}
                  placeholder="optional"
                  onChange={(event) =>
                    update(index, {
                      targetShare: event.target.value === "" ? undefined : Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
          </li>
        ))}
      </ol>

      <p className={styles.acquisitionLensSummary}>
        {enabled.length} enabled ·{" "}
        {shares.length
          ? `target shares total ${shareTotal}% (must be 100%)`
          : "no target shares configured"}
      </p>

      <div className={styles.dailyPlannerActions}>
        <button type="button" className={styles.secondaryButton} disabled={blocked} onClick={() => void load()}>
          Discard changes
        </button>
        <button type="button" className={styles.primaryButton} disabled={blocked || !taxonomy} onClick={() => void publish()}>
          {busy ? "Publishing…" : "Publish new version"}
        </button>
      </div>
    </section>
  );
}
