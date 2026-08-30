"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  EditorialProfileWeights,
  TopicEditorialProfile,
  UpdateTopicEditorialProfileInput,
} from "./modules/stories/editorial-profile.types";
import {
  MAX_EDITORIAL_PROFILE_LIST_ITEMS,
  MAX_EDITORIAL_PROFILE_LIST_ITEM_LENGTH,
} from "./modules/stories/editorial-profile.types";
import styles from "./editorial-profile-panel.generated.module.css";

type EditorialProfileDraft = UpdateTopicEditorialProfileInput;
type SaveEditorialProfileResponse = TopicEditorialProfile & {
  reactivatedStories?: number;
};

export function EditorialProfilePanel({
  topicId,
  secret,
  disabled,
  onProfileSaved,
}: {
  topicId: string;
  secret: string;
  disabled: boolean;
  onProfileSaved?: (
    profile: TopicEditorialProfile,
    reactivatedStories: number,
  ) => void;
}) {
  const [profile, setProfile] = useState<TopicEditorialProfile>();
  const [draft, setDraft] = useState<EditorialProfileDraft>();
  const [contentPillarsText, setContentPillarsText] = useState("");
  const [exclusionsText, setExclusionsText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const authenticated = secret.trim().length > 0;
  const weightTotal = useMemo(
    () => totalWeights(draft?.weights),
    [draft?.weights],
  );
  const listValidationError = useMemo(
    () => validateProfileLists(draft),
    [draft],
  );

  useEffect(() => {
    if (!authenticated || !topicId) {
      return;
    }

    const controller = new AbortController();

    requestJson<TopicEditorialProfile>(topicUrl(topicId), secret, {
      signal: controller.signal,
    })
      .then((nextProfile) => {
        if (controller.signal.aborted) return;
        setError(undefined);
        setNotice(undefined);
        setProfile(nextProfile);
        setDraft(toDraft(nextProfile));
        setContentPillarsText(nextProfile.contentPillars.join("\n"));
        setExclusionsText(nextProfile.exclusions.join("\n"));
        setDirty(false);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(getErrorMessage(loadError));
        }
      });

    return () => controller.abort();
  }, [authenticated, secret, topicId]);

  function updateDraft(update: Partial<EditorialProfileDraft>) {
    setDraft((current) => (current ? { ...current, ...update } : current));
    setDirty(true);
    setNotice(undefined);
  }

  function updateWeights(update: Partial<EditorialProfileWeights>) {
    setDraft((current) =>
      current
        ? { ...current, weights: { ...current.weights, ...update } }
        : current,
    );
    setDirty(true);
    setNotice(undefined);
  }

  async function save() {
    if (!draft || !authenticated || disabled || busy) return;

    if (weightTotal !== 100) {
      setError("The five priority weights must add up to 100.");
      return;
    }
    if (listValidationError) {
      setError(listValidationError);
      return;
    }

    setBusy(true);
    setError(undefined);
    setNotice(undefined);

    try {
      const result = await requestJson<SaveEditorialProfileResponse>(
        topicUrl(topicId),
        secret,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const saved = result;
      const reactivatedStories = result.reactivatedStories ?? 0;
      setProfile(saved);
      setDraft(toDraft(saved));
      setContentPillarsText(saved.contentPillars.join("\n"));
      setExclusionsText(saved.exclusions.join("\n"));
      setDirty(false);
      onProfileSaved?.(saved, reactivatedStories);
      setNotice(
        reactivatedStories > 0
          ? `${reactivatedStories} automatic low-score ${reactivatedStories === 1 ? "rejection was" : "rejections were"} restored to New and can now be evaluated by AI.`
          : "Editorial profile saved. Future AI runs will use this version and re-evaluate cached stories when needed.",
      );
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  }

  if (!authenticated) {
    return (
      <section className={styles.panel}>
        <div className={styles.heading}>
          <div>
            <p>Editorial AI</p>
            <h2>Topic editorial profile</h2>
          </div>
        </div>
        <p className={styles.locked}>
          Enter the collector secret to configure how AI ranks this topic.
        </p>
      </section>
    );
  }

  if (!draft || !profile) {
    return (
      <section className={styles.panel} aria-busy="true">
        <div className={styles.heading}>
          <div>
            <p>Editorial AI</p>
            <h2>Topic editorial profile</h2>
          </div>
        </div>
        <p className={styles.loading}>Loading this topic’s editorial profile…</p>
        {error ? <p className={styles.error}>{error}</p> : null}
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <div className={styles.heading}>
        <div>
          <p>Editorial AI</p>
          <h2>Topic editorial profile</h2>
          <small>
            One priority score is shown in the radar; the AI uses this profile
            to judge what “best” means for this topic.
          </small>
        </div>
        <span className={profile.isDefault ? styles.defaultBadge : styles.savedBadge}>
          {profile.isDefault ? "Compatible default" : `Profile v${profile.profileVersion}`}
        </span>
      </div>

      <div className={styles.copyGrid}>
        <label>
          <span>Audience</span>
          <input
            value={draft.audience}
            maxLength={500}
            onChange={(event) => updateDraft({ audience: event.target.value })}
            disabled={disabled || busy}
            placeholder="Who should this editorial stream serve?"
          />
        </label>
        <label>
          <span>Editorial mission</span>
          <textarea
            value={draft.mission}
            maxLength={1_000}
            onChange={(event) => updateDraft({ mission: event.target.value })}
            disabled={disabled || busy}
            placeholder="What makes a story worth selecting?"
            rows={3}
          />
        </label>
      </div>

      <div className={styles.copyGrid}>
        <label>
          <span>Content pillars</span>
          <textarea
            value={contentPillarsText}
            onChange={(event) => {
              setContentPillarsText(event.target.value);
              updateDraft({ contentPillars: parseLines(event.target.value) });
            }}
            disabled={disabled || busy}
            placeholder={"Evidence-informed parenting\nPerinatal mental health\nChild development"}
            rows={5}
          />
          <small>
            One theme per line. {draft.contentPillars.length} / {MAX_EDITORIAL_PROFILE_LIST_ITEMS} used.
            They guide relevance; they are not hard rules.
          </small>
        </label>
        <label>
          <span>Exclude or down-rank</span>
          <textarea
            value={exclusionsText}
            onChange={(event) => {
              setExclusionsText(event.target.value);
              updateDraft({ exclusions: parseLines(event.target.value) });
            }}
            disabled={disabled || busy}
            placeholder={"Sponsored content\nUnrelated drug discovery\nUnsupported claims"}
            rows={5}
          />
          <small>
            One exclusion per line. {draft.exclusions.length} / {MAX_EDITORIAL_PROFILE_LIST_ITEMS} used.
            AI treats these as editorial cautions.
          </small>
        </label>
      </div>

      <div className={styles.policyGrid}>
        <NumberField
          label="News window"
          value={draft.freshness.newsMaxAgeHours}
          suffix="hours"
          min={1}
          max={8_760}
          disabled={disabled || busy}
          onChange={(value) =>
            updateDraft({
              freshness: { ...draft.freshness, newsMaxAgeHours: value },
            })
          }
        />
        <NumberField
          label="Research window"
          value={draft.freshness.researchMaxAgeHours}
          suffix="hours"
          min={1}
          max={8_760}
          disabled={disabled || busy}
          onChange={(value) =>
            updateDraft({
              freshness: { ...draft.freshness, researchMaxAgeHours: value },
            })
          }
        />
        <NumberField
          label="AI candidate floor"
          value={draft.localCandidateMinScore}
          suffix="/ 100"
          min={0}
          max={100}
          disabled={disabled || busy}
          onChange={(value) => updateDraft({ localCandidateMinScore: value })}
        />
      </div>
      <p className={styles.policyHint}>
        The research window applies to RSS sources tagged <code>research</code>,
        <code>academic</code>, or <code>journal</code>. Other sources use the
        news window. Lowering the AI candidate floor restores eligible automatic
        score rejections to New; human, hard, and duplicate rejections remain
        final.
      </p>

      <div className={styles.weightsHeading}>
        <div>
          <h3>Priority formula</h3>
          <p>The server combines these signals into the single Editorial Priority score.</p>
        </div>
        <strong className={weightTotal === 100 ? styles.validTotal : styles.invalidTotal}>
          {weightTotal} / 100
        </strong>
      </div>
      <div className={styles.weightsGrid}>
        <NumberField label="Topic fit" value={draft.weights.topicFit} min={0} max={100} disabled={disabled || busy} onChange={(value) => updateWeights({ topicFit: value })} />
        <NumberField label="Evidence & depth" value={draft.weights.evidenceDepth} min={0} max={100} disabled={disabled || busy} onChange={(value) => updateWeights({ evidenceDepth: value })} />
        <NumberField label="Novelty & trend" value={draft.weights.noveltyTimeliness} min={0} max={100} disabled={disabled || busy} onChange={(value) => updateWeights({ noveltyTimeliness: value })} />
        <NumberField label="Audience value" value={draft.weights.audienceValue} min={0} max={100} disabled={disabled || busy} onChange={(value) => updateWeights({ audienceValue: value })} />
        <NumberField label="Social potential" value={draft.weights.socialPotential} min={0} max={100} disabled={disabled || busy} onChange={(value) => updateWeights({ socialPotential: value })} />
      </div>

      <div className={styles.footer}>
        <small>
          {listValidationError
            ? listValidationError
            : disabled
              ? "Finish the current dashboard operation before saving this profile."
              : weightTotal !== 100
                ? "The five priority weights must add up to 100 before saving."
                : !dirty
                  ? profile.isDefault
                    ? "Edit a field to customize this compatible default."
                    : `Last saved ${formatDate(profile.updatedAt)}.`
                  : "Changes are ready to save."}
        </small>
        <button
          type="button"
          onClick={save}
          disabled={
            !dirty ||
            disabled ||
            busy ||
            weightTotal !== 100 ||
            Boolean(listValidationError)
          }
          title={listValidationError}
        >
          {busy ? "Saving…" : "Save editorial profile"}
        </button>
      </div>

      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  suffix,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className={styles.numberField}>
      <span>{label}</span>
      <div>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step="1"
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isInteger(next)) onChange(next);
          }}
        />
        {suffix ? <small>{suffix}</small> : null}
      </div>
    </label>
  );
}

function toDraft(profile: TopicEditorialProfile): EditorialProfileDraft {
  return {
    audience: profile.audience,
    mission: profile.mission,
    contentPillars: [...profile.contentPillars],
    exclusions: [...profile.exclusions],
    freshness: { ...profile.freshness },
    weights: { ...profile.weights },
    localCandidateMinScore: profile.localCandidateMinScore,
  };
}

function parseLines(value: string): string[] {
  return [...new Set(value.split("\n").map((line) => line.trim()).filter(Boolean))];
}

function validateProfileLists(
  draft: EditorialProfileDraft | undefined,
): string | undefined {
  if (!draft) return undefined;
  const lists = [
    ["Content pillars", draft.contentPillars],
    ["Exclusions", draft.exclusions],
  ] as const;
  for (const [label, items] of lists) {
    if (items.length > MAX_EDITORIAL_PROFILE_LIST_ITEMS) {
      return `${label} supports at most ${MAX_EDITORIAL_PROFILE_LIST_ITEMS} lines; remove ${items.length - MAX_EDITORIAL_PROFILE_LIST_ITEMS}.`;
    }
    if (items.some((item) => item.length > MAX_EDITORIAL_PROFILE_LIST_ITEM_LENGTH)) {
      return `${label} entries support at most ${MAX_EDITORIAL_PROFILE_LIST_ITEM_LENGTH} characters per line.`;
    }
  }
  return undefined;
}

function totalWeights(weights?: EditorialProfileWeights): number {
  if (!weights) return 0;

  return (
    weights.topicFit +
    weights.evidenceDepth +
    weights.noveltyTimeliness +
    weights.audienceValue +
    weights.socialPotential
  );
}

function topicUrl(topicId: string): string {
  return `/api/radar/editorial-profile?${new URLSearchParams({ topicId }).toString()}`;
}

async function requestJson<T>(
  input: string,
  secret: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${secret}`);
  const response = await fetch(input, { ...init, headers });
  const payload = (await response.json().catch(() => undefined)) as unknown;

  if (!response.ok) {
    throw new Error(
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `Request failed (${response.status})`,
    );
  }

  return payload as T;
}

function formatDate(value: Date | string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "just now" : date.toLocaleString();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
