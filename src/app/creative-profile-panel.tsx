"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  BrandOverlayEditor,
  BrandPaletteEditor,
  CarouselNumberingEditor,
  ListField,
  TextAreaField,
  TextField,
  capitalize,
} from "./creative-profile-fields";
import {
  CREATIVE_CONVERSION_GOALS,
  CREATIVE_FRAMING_STRATEGIES,
  type CreativeBrandAsset,
  type CreativeBrandPaletteColor,
  type CreativeProfile,
} from "./modules/stories/creative-content.types";
import styles from "./creative-draft-workspace.generated.module.css";

const FRAMING_STRATEGY_LABELS = {
  auto: "Auto (brief decides)",
  "reader-consequence": "Reader consequence",
  explainer: "Explainer",
  authority: "Authority",
} as const satisfies Record<CreativeProfile["framingStrategy"], string>;

const DIMENSIONS = [
  "formality",
  "humor",
  "energy",
  "optimism",
  "provocation",
] as const;

type Busy = "save" | "brand" | undefined;

export function CreativeProfilePanel({
  topicId,
  secret,
  disabled,
  onProfileLoaded,
  onProfileSaved,
}: {
  topicId: string;
  secret: string;
  disabled: boolean;
  onProfileLoaded?: (profile: CreativeProfile) => void;
  onProfileSaved?: (profile: CreativeProfile) => void;
}) {
  const [draft, setDraft] = useState<CreativeProfile>();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<Busy>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const authenticated = secret.trim().length > 0;

  useEffect(() => {
    if (!authenticated || !topicId) return;
    const controller = new AbortController();

    requestJson<CreativeProfile>(profileUrl(topicId), secret, {
      signal: controller.signal,
    })
      .then((profile) => {
        if (controller.signal.aborted) return;
        setError(undefined);
        setNotice(undefined);
        setDraft(profile);
        setDirty(false);
        onProfileLoaded?.(profile);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(getErrorMessage(loadError));
      });

    return () => controller.abort();
  }, [authenticated, onProfileLoaded, secret, topicId]);

  function updateDraft(values: Partial<CreativeProfile>) {
    setDraft((current) => (current ? { ...current, ...values } : current));
    setDirty(true);
    setNotice(undefined);
  }

  function updateBrandOverlay(
    values: Partial<CreativeProfile["brandOverlay"]>,
  ) {
    setDraft((current) =>
      current
        ? {
            ...current,
            brandOverlay: { ...current.brandOverlay, ...values },
          }
        : current,
    );
    setDirty(true);
    setNotice(undefined);
  }

  function updateBrandPalette(brandPalette: CreativeBrandPaletteColor[]) {
    setDraft((current) => {
      if (!current) return current;
      const paletteColors = new Set(brandPalette.map((entry) => entry.color));
      const fallback = brandPalette[0]?.color ?? current.carouselChrome.backgroundColor;
      const keep = (color: string) =>
        paletteColors.has(color) ? color : fallback;
      return {
        ...current,
        brandPalette,
        carouselChrome: {
          ...current.carouselChrome,
          backgroundColor: keep(current.carouselChrome.backgroundColor),
          textColor: keep(current.carouselChrome.textColor),
          accentColor: keep(current.carouselChrome.accentColor),
        },
      };
    });
    setDirty(true);
    setNotice(undefined);
  }

  function updateCarouselChrome(
    values: Partial<CreativeProfile["carouselChrome"]>,
  ) {
    setDraft((current) =>
      current
        ? {
            ...current,
            carouselChrome: { ...current.carouselChrome, ...values },
          }
        : current,
    );
    setDirty(true);
    setNotice(undefined);
  }

  async function handleUploadBrandAsset(file: File) {
    if (!draft || busy) return;
    if (file.type !== "image/png" && !file.name.toLowerCase().endsWith(".png")) {
      setError("The brand logo must be a PNG image.");
      return;
    }
    setBusy("brand");
    setError(undefined);
    setNotice(undefined);
    try {
      const body = new FormData();
      body.append("image", file);
      const asset = await requestJson<CreativeBrandAsset>(
        `/api/radar/creative-profile/brand-assets?topicId=${encodeURIComponent(topicId)}`,
        secret,
        { method: "POST", body },
      );
      updateBrandOverlay({ assetId: asset.id, asset });
      setNotice(
        "Brand logo uploaded. Choose its placement, then save the creative profile.",
      );
    } catch (uploadError) {
      setError(getErrorMessage(uploadError));
    } finally {
      setBusy(undefined);
    }
  }

  async function save() {
    if (!draft || !authenticated || disabled || busy) return;
    setBusy("save");
    setError(undefined);
    setNotice(undefined);
    try {
      const saved = await requestJson<CreativeProfile>(
        profileUrl(topicId),
        secret,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      setDraft(saved);
      setDirty(false);
      onProfileSaved?.(saved);
      setNotice(
        "Creative profile saved. The topic UI now uses its brand palette; refresh existing creative briefs to apply the new settings to generated content.",
      );
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBusy(undefined);
    }
  }

  if (!authenticated) {
    return (
      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span>Topic voice</span>
            <h3>Creative profile</h3>
          </div>
        </div>
        <p className={styles.warning}>
          Enter the collector secret to manage this topic&rsquo;s creative
          profile.
        </p>
      </section>
    );
  }

  if (!draft) {
    return (
      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span>Topic voice</span>
            <h3>Creative profile</h3>
          </div>
        </div>
        {error ? (
          <div className={styles.error} role="alert">
            <strong>Creative profile error</strong>
            <p>{error}</p>
          </div>
        ) : (
          <p className={styles.loading}>Loading creative profile…</p>
        )}
      </section>
    );
  }

  const controlsDisabled = disabled || busy === "save";

  return (
    <section className={styles.section} id="creative-profile">
      <div className={styles.sectionHeading}>
        <div>
          <span>Topic voice</span>
          <h3>Creative profile</h3>
        </div>
        <div className={styles.budget}>
          {dirty ? "Unsaved changes" : "Saved"}
        </div>
      </div>

      <p className={styles.profileGuideHint}>
        These settings define how every meme and carousel for this topic is
        written and designed. Editing them here affects all future creations;
        historical drafts keep the snapshot they were generated with.
      </p>

      {error ? (
        <div className={styles.error} role="alert">
          <strong>Creative profile error</strong>
          <p>{error}</p>
        </div>
      ) : null}
      {notice ? (
        <div className={styles.notice} role="status" aria-live="polite">
          {notice}
        </div>
      ) : null}

      <fieldset className={styles.profileBodyPlain} disabled={controlsDisabled}>
        <Group title="Identity" defaultOpen>
          <div className={styles.fieldGrid}>
            <TextField label="Profile name" value={draft.name} onChange={(name) => updateDraft({ name })} />
            <TextField label="Platform" value={draft.platform} onChange={(platform) => updateDraft({ platform })} />
            <TextField label="Language" value={draft.language} onChange={(language) => updateDraft({ language })} />
            <TextField label="Region" value={draft.region} onChange={(region) => updateDraft({ region })} />
          </div>
          <TextAreaField label="Audience" value={draft.audience} onChange={(audience) => updateDraft({ audience })} rows={2} />
        </Group>

        <Group title="Strategy">
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span>Primary conversion goal</span>
              <select
                value={draft.conversionGoal}
                onChange={(event) =>
                  updateDraft({
                    conversionGoal: event.target
                      .value as CreativeProfile["conversionGoal"],
                  })
                }
              >
                {CREATIVE_CONVERSION_GOALS.map((goal) => (
                  <option key={goal} value={goal}>
                    {capitalize(goal)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Editorial framing</span>
              <select
                value={draft.framingStrategy ?? "auto"}
                onChange={(event) =>
                  updateDraft({
                    framingStrategy: event.target
                      .value as CreativeProfile["framingStrategy"],
                  })
                }
              >
                {CREATIVE_FRAMING_STRATEGIES.map((strategy) => (
                  <option key={strategy} value={strategy}>
                    {FRAMING_STRATEGY_LABELS[strategy]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className={styles.profileGuideHint}>
            Editorial framing fixes the lens for the hook.{" "}
            <strong>Reader consequence</strong> forces the opening onto what
            changes for the audience whenever the facts support it;{" "}
            <strong>Explainer</strong> and <strong>Authority</strong> allow a
            neutral or institutional opening; <strong>Auto</strong> lets the
            brief choose per story.
          </p>
          <TextAreaField
            label="CTA tone and wording"
            value={draft.callToActionStyle}
            onChange={(callToActionStyle) => updateDraft({ callToActionStyle })}
            rows={2}
          />
          <p className={styles.profileGuideHint}>
            The conversion goal defines the action; this field defines only its
            tone and wording.
          </p>
        </Group>

        <Group title="Voice">
          <ListField
            key={draft.brandPersonality.join("|")}
            label="Brand personality (comma-separated)"
            values={draft.brandPersonality}
            onChange={(brandPersonality) => updateDraft({ brandPersonality })}
          />
          <div className={styles.sliders}>
            {DIMENSIONS.map((dimension) => (
              <label key={dimension}>
                <span>
                  {capitalize(dimension)} <strong>{draft[dimension]}</strong>
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={draft[dimension]}
                  onChange={(event) =>
                    updateDraft({ [dimension]: Number(event.target.value) })
                  }
                />
              </label>
            ))}
          </div>
          <div className={styles.emojiRow}>
            <label>
              <input
                type="checkbox"
                checked={draft.allowEmojis}
                onChange={(event) => updateDraft({ allowEmojis: event.target.checked })}
              />
              Allow emojis
            </label>
            <label>
              Maximum
              <input
                type="number"
                min="0"
                max="10"
                value={draft.maxEmojis}
                onChange={(event) => updateDraft({ maxEmojis: Number(event.target.value) })}
              />
            </label>
          </div>
        </Group>

        <Group title="Brand & visual">
          <TextAreaField
            label="Visual campaign guide"
            value={draft.visualGuidance ?? ""}
            onChange={(visualGuidance) => updateDraft({ visualGuidance })}
            rows={8}
          />
          <p className={styles.profileGuideHint}>
            Add the complete visual direction for this topic: palette,
            typography, motifs, safe margins, and what to avoid. Logo settings
            apply directly to the next image batch and do not require
            regenerating the script.
          </p>
          <BrandPaletteEditor
            palette={draft.brandPalette}
            carouselChrome={draft.carouselChrome}
            disabled={controlsDisabled}
            onChange={updateBrandPalette}
          />
          <BrandOverlayEditor
            overlay={draft.brandOverlay}
            topicId={topicId}
            secret={secret}
            disabled={disabled || busy === "save"}
            uploading={busy === "brand"}
            onChange={updateBrandOverlay}
            onUpload={handleUploadBrandAsset}
          />
        </Group>

        <Group title="Carousel numbering">
          <CarouselNumberingEditor
            chrome={draft.carouselChrome}
            palette={draft.brandPalette}
            disabled={controlsDisabled}
            onChange={updateCarouselChrome}
          />
        </Group>

        <button
          className={styles.primaryButton}
          type="button"
          disabled={disabled || Boolean(busy) || !dirty}
          onClick={save}
        >
          {busy === "save" ? "Saving profile…" : "Save creative profile"}
        </button>
      </fieldset>
    </section>
  );
}

function Group({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  // Local state so a parent re-render (every keystroke sets dirty) does not
  // reconcile `open` back to its default and snap the section the user is
  // editing shut.
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className={styles.profilePanel}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>
          <strong>{title}</strong>
        </span>
        <span aria-hidden="true">▾</span>
      </summary>
      <div className={styles.profileBody}>{children}</div>
    </details>
  );
}

function profileUrl(topicId: string): string {
  return `/api/radar/creative-profile?topicId=${encodeURIComponent(topicId)}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred";
}

async function requestJson<T>(
  input: string,
  secret: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${secret.trim()}`);
  const response = await fetch(input, { ...init, cache: "no-store", headers });
  const payload = (await response.json().catch(() => undefined)) as
    | { error?: string }
    | undefined;

  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed (${response.status})`);
  }

  return payload as T;
}
