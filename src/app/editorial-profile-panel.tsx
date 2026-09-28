"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

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
import { ActionRow, Button } from "./ui/primitives";
import { useUnsavedBeforeUnload } from "./ui/use-unsaved-before-unload";

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
  const [invalidNumbers, setInvalidNumbers] = useState<Set<string>>(() => new Set());
  const [editVersion, setEditVersion] = useState(0);
  useUnsavedBeforeUnload(dirty);
  const panelRef = useRef<HTMLElement>(null);
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
        setInvalidNumbers(new Set());
        setEditVersion((current) => current + 1);
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

  function markNumberValidity(label: string, valid: boolean) {
    setInvalidNumbers((current) => {
      const next = new Set(current);
      if (valid) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function discardChanges() {
    if (!profile || busy) return;
    setDraft(toDraft(profile));
    setContentPillarsText(profile.contentPillars.join("\n"));
    setExclusionsText(profile.exclusions.join("\n"));
    setInvalidNumbers(new Set());
    setEditVersion((current) => current + 1);
    setDirty(false);
    setError(undefined);
    setNotice("Unsaved editorial profile changes discarded.");
  }

  async function save() {
    if (!draft || !authenticated || disabled || busy) return;

    if (invalidNumbers.size > 0) {
      setError("Correct the highlighted number before saving.");
      panelRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
      return;
    }

    if (weightTotal !== 100) {
      setError("The five priority weights must add up to 100.");
      panelRef.current?.querySelector<HTMLInputElement>("[data-weight-input]")?.focus();
      return;
    }
    if (listValidationError) {
      setError(listValidationError);
      panelRef.current?.querySelector<HTMLTextAreaElement>(listValidationError.startsWith("Content pillars") ? '[data-profile-list="pillars"]' : '[data-profile-list="exclusions"]')?.focus();
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
      setEditVersion((current) => current + 1);
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
    <section ref={panelRef} className={styles.panel}>
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
            data-profile-list="pillars"
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
            data-profile-list="exclusions"
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

      <div key={`policy-${editVersion}`} className={styles.policyGrid}>
        <NumberField
          label="News window"
          value={draft.freshness.newsMaxAgeHours}
          suffix="hours"
          min={1}
          max={8_760}
          disabled={disabled || busy}
          onValidityChange={markNumberValidity}
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
          onValidityChange={markNumberValidity}
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
          onValidityChange={markNumberValidity}
          onChange={(value) => updateDraft({ localCandidateMinScore: value })}
        />
        <NumberField
          label="AI research floor"
          value={draft.minResearchScore}
          suffix="/ 100"
          min={0}
          max={100}
          disabled={disabled || busy}
          onValidityChange={markNumberValidity}
          onChange={(value) => updateDraft({ minResearchScore: value })}
        />
      </div>
      <p className={styles.policyHint}>
        The research window applies to RSS sources tagged <code>research</code>,
        <code>academic</code>, or <code>journal</code>. Other sources use the
        news window. Lowering the AI candidate floor restores eligible automatic
        score rejections to New; human, hard, and duplicate rejections remain
        final. The AI research floor is the self-reported confidence the
        web-search collector must clear before a discovery becomes a Story at
        all &mdash; lowering it surfaces smaller, more routine local items;
        raising it keeps only strong, well-sourced matches.
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
      <div key={`weights-${editVersion}`} className={styles.weightsGrid}>
        <NumberField label="Topic fit" value={draft.weights.topicFit} min={0} max={100} disabled={disabled || busy} onValidityChange={markNumberValidity} onChange={(value) => updateWeights({ topicFit: value })} />
        <NumberField label="Evidence & depth" value={draft.weights.evidenceDepth} min={0} max={100} disabled={disabled || busy} onValidityChange={markNumberValidity} onChange={(value) => updateWeights({ evidenceDepth: value })} />
        <NumberField label="Novelty & trend" value={draft.weights.noveltyTimeliness} min={0} max={100} disabled={disabled || busy} onValidityChange={markNumberValidity} onChange={(value) => updateWeights({ noveltyTimeliness: value })} />
        <NumberField label="Audience value" value={draft.weights.audienceValue} min={0} max={100} disabled={disabled || busy} onValidityChange={markNumberValidity} onChange={(value) => updateWeights({ audienceValue: value })} />
        <NumberField label="Social potential" value={draft.weights.socialPotential} min={0} max={100} disabled={disabled || busy} onValidityChange={markNumberValidity} onChange={(value) => updateWeights({ socialPotential: value })} />
      </div>

      <div className={styles.footer}>
        <small>
          {invalidNumbers.size > 0
            ? "Correct the highlighted number before saving."
            : listValidationError
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
        <ActionRow>
          <Button variant="primary" onClick={save} disabled={!dirty || disabled || busy} busy={busy}>
            {busy ? "Saving…" : "Save editorial profile"}
          </Button>
          <Button variant="quiet" onClick={discardChanges} disabled={!dirty || busy}>Cancel changes</Button>
        </ActionRow>
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
  onValidityChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  disabled: boolean;
  onChange: (value: number) => void;
  onValidityChange: (label: string, valid: boolean) => void;
}) {
  const [text, setText] = useState(String(value));
  const hintId = useId();
  const parsed = /^\d+$/.test(text) ? Number(text) : NaN;
  const valid = Number.isInteger(parsed) && parsed >= min && parsed <= max;
  return (
    <label className={styles.numberField}>
      <span>{label}</span>
      <div>
        <input
          type="number"
          value={text}
          min={min}
          max={max}
          step="1"
          disabled={disabled}
          data-weight-input={suffix ? undefined : ""}
          aria-invalid={!valid || undefined}
          aria-describedby={!valid ? hintId : undefined}
          onChange={(event) => {
            const raw = event.target.value;
            const next = /^\d+$/.test(raw) ? Number(raw) : NaN;
            const nextValid = Number.isInteger(next) && next >= min && next <= max;
            setText(raw);
            onValidityChange(label, nextValid);
            if (nextValid) onChange(next);
          }}
        />
        {suffix ? <small>{suffix}</small> : null}
      </div>
      {!valid ? <small id={hintId} role="alert">Enter a whole number from {min} to {max}.</small> : null}
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
    minResearchScore: profile.minResearchScore,
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
