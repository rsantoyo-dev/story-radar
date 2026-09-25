"use client";

import { useState } from "react";

import type { CreativeBrandPaletteColor } from "./modules/stories/creative-content.types";

import styles from "./creative-draft-workspace.generated.module.css";

type Suggestion = {
  summary: string;
  palette: CreativeBrandPaletteColor[];
  model: string;
};

/**
 * "How do you imagine your palette?" — the editor describes the palette and
 * Luna fills the Brand palette of the creative profile. The proposal is
 * applied to the unsaved draft immediately, with an undo, so nothing reaches
 * the database until the editor saves the profile.
 */
export function BrandPaletteAssistant({
  topicId,
  secret,
  disabled,
  palette,
  onApply,
}: {
  topicId: string;
  secret: string;
  disabled: boolean;
  palette: CreativeBrandPaletteColor[];
  onApply: (palette: CreativeBrandPaletteColor[]) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [suggestion, setSuggestion] = useState<Suggestion>();
  const [previousPalette, setPreviousPalette] = useState<CreativeBrandPaletteColor[]>();
  const canSubmit = !disabled && !busy && prompt.trim().length >= 8;

  async function suggest() {
    if (!canSubmit) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(
        `/api/radar/creative-profile/palette-suggestion?topicId=${encodeURIComponent(topicId)}`,
        {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secret.trim()}`,
          },
          body: JSON.stringify({ prompt: prompt.trim() }),
        },
      );
      const payload = (await response.json().catch(() => undefined)) as
        | (Partial<Suggestion> & { error?: string })
        | undefined;
      if (!response.ok || !payload?.palette) {
        throw new Error(payload?.error ?? `Request failed (${response.status})`);
      }
      const next: Suggestion = {
        summary: payload.summary ?? "",
        palette: payload.palette,
        model: payload.model ?? "Luna",
      };
      setPreviousPalette(palette);
      setSuggestion(next);
      onApply(next.palette);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "The palette could not be suggested",
      );
    } finally {
      setBusy(false);
    }
  }

  function undo() {
    if (!previousPalette) return;
    onApply(previousPalette);
    setPreviousPalette(undefined);
    setSuggestion(undefined);
  }

  return (
    <section className={styles.paletteAssistant} aria-labelledby="palette-assistant-title">
      <header className={styles.brandOverlayHeader}>
        <div>
          <strong id="palette-assistant-title">How do you imagine your palette?</strong>
          <p>
            Describe it in your own words: a mood, a season, a place, colours
            you love or want to avoid. Luna proposes four to six brand colours
            with the Primary, Secondary and Surface roles, where each colour is
            used and its approximate share, and fills the Brand palette below.
            Review it there and save the profile to keep it.
          </p>
        </div>
      </header>

      <form
        className={styles.paletteAssistantForm}
        onSubmit={(event) => {
          event.preventDefault();
          void suggest();
        }}
      >
        <label className={styles.field}>
          <span>Your palette, in words</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            maxLength={1200}
            disabled={disabled || busy}
            placeholder="Warm and trustworthy, like a Canadian autumn morning: deep maple red, soft cream paper, a calm navy for text, one bright accent."
          />
        </label>
        <div className={styles.paletteAssistantActions}>
          <button type="submit" className={styles.secondaryButton} disabled={!canSubmit}>
            {busy ? "Asking Luna…" : "Suggest palette with Luna"}
          </button>
          {previousPalette ? (
            <button type="button" className={styles.paletteAdd} onClick={undo} disabled={busy}>
              Undo suggestion
            </button>
          ) : null}
        </div>
      </form>

      {error ? (
        <p className={styles.warning} role="alert">
          {error}
        </p>
      ) : null}

      {suggestion ? (
        <div className={styles.paletteAssistantResult} role="status">
          <ul className={styles.paletteAssistantSwatches} aria-label="Suggested palette">
            {suggestion.palette.map((entry) => (
              <li key={entry.color} className={styles.paletteAssistantSwatch}>
                <i style={{ background: entry.color }} aria-hidden="true" />
                <span>
                  <strong>{entry.name}</strong>
                  <small>
                    {entry.color}
                    {entry.role ? ` · ${entry.role}` : ""}
                    {entry.share !== undefined ? ` · ${entry.share}%` : ""}
                  </small>
                  {entry.usage ? <small>{entry.usage}</small> : null}
                </span>
              </li>
            ))}
          </ul>
          {suggestion.summary ? <p className={styles.brandAssetHint}>{suggestion.summary}</p> : null}
          <p className={styles.brandAssetHint}>
            Applied to the Brand palette in Brand &amp; visual. Adjust any colour there, then save the profile.
          </p>
        </div>
      ) : null}
    </section>
  );
}
