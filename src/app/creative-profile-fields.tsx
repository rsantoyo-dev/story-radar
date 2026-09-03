"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import {
  CREATIVE_BRAND_BACKDROP_MODES,
  CREATIVE_BRAND_PLACEMENTS,
  CREATIVE_BRAND_SCOPES,
  CREATIVE_CAROUSEL_CHROME_STYLES,
  type CreativeBrandPaletteColor,
  type CreativeProfile,
} from "./modules/stories/creative-content.types";
import styles from "./creative-draft-workspace.generated.module.css";

// Shared editing primitives for the topic creative profile. These live outside
// the draft workspace so the topic-level Creative profile panel can reuse them
// without importing the whole workspace.

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function topicUrl(path: string, topicId: string): string {
  const separator = path.includes("?") ? "&" : "?";

  return `${path}${separator}topicId=${encodeURIComponent(topicId)}`;
}

export function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className={styles.field}><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function TextAreaField({ label, value, onChange, rows }: { label: string; value: string; onChange: (value: string) => void; rows: number }) {
  return <label className={styles.field}><span>{label}</span><textarea value={value} rows={rows} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function parseList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,\n]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function ListField({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [text, setText] = useState(values.join(", "));

  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => onChange(parseList(text))}
      />
    </label>
  );
}

export function BrandPaletteAndCarouselChromeEditor({
  palette,
  chrome,
  disabled,
  onPaletteChange,
  onChromeChange,
}: {
  palette: CreativeBrandPaletteColor[];
  chrome: CreativeProfile["carouselChrome"];
  disabled: boolean;
  onPaletteChange: (palette: CreativeBrandPaletteColor[]) => void;
  onChromeChange: (values: Partial<CreativeProfile["carouselChrome"]>) => void;
}) {
  const updatePaletteColor = (index: number, color: string) =>
    onPaletteChange(
      palette.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, color: color.toUpperCase() } : entry,
      ),
    );
  const updatePaletteName = (index: number, name: string) =>
    onPaletteChange(
      palette.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, name } : entry,
      ),
    );

  return (
    <section className={styles.carouselChromePanel} aria-labelledby="brand-palette-title">
      <header className={styles.brandOverlayHeader}>
        <div>
          <strong id="brand-palette-title">Brand palette & carousel numbering</strong>
          <p>
            Define the colours available to this topic, then choose the optional
            deterministic counter rendered on carousel slides. The palette also
            becomes part of the visual campaign guide sent to image generation.
          </p>
        </div>
        <label className={styles.brandEnabledToggle}>
          <input
            type="checkbox"
            checked={chrome.enabled}
            disabled={disabled}
            onChange={(event) => onChromeChange({ enabled: event.target.checked })}
          />
          <span>Numbering enabled</span>
        </label>
      </header>

      <fieldset className={styles.carouselChromeControls} disabled={disabled}>
        <div className={styles.paletteGrid} aria-label="Brand palette">
          {palette.map((entry, index) => (
            <div className={styles.paletteColor} key={`${entry.color}-${index}`}>
              <input
                type="color"
                aria-label={`${entry.name} colour`}
                value={entry.color}
                onChange={(event) => updatePaletteColor(index, event.target.value)}
              />
              <input
                aria-label={`Name for ${entry.color}`}
                value={entry.name}
                maxLength={40}
                onChange={(event) => updatePaletteName(index, event.target.value)}
              />
              <code>{entry.color}</code>
              <button
                type="button"
                className={styles.paletteRemove}
                disabled={palette.length <= 3}
                onClick={() => onPaletteChange(palette.filter((_, item) => item !== index))}
              >
                Remove
              </button>
            </div>
          ))}
          {palette.length < 8 ? (
            <button
              type="button"
              className={styles.paletteAdd}
              onClick={() =>
                onPaletteChange([
                  ...palette,
                  {
                    name: `Brand colour ${palette.length + 1}`,
                    color: nextAvailablePaletteColor(palette),
                  },
                ])
              }
            >
              + Add colour
            </button>
          ) : null}
        </div>

        <div className={styles.carouselChromeOptions}>
          <div className={styles.brandControlGroup}>
            <span className={styles.brandControlLabel}>Counter style</span>
            <div className={styles.brandSegmented} role="group" aria-label="Carousel counter style">
              {CREATIVE_CAROUSEL_CHROME_STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  className={`${styles.brandOptionButton} ${
                    chrome.style === style ? styles.brandOptionSelected : ""
                  }`}
                  aria-pressed={chrome.style === style}
                  onClick={() => onChromeChange({ style })}
                >
                  {style === "pill" ? "Pill badge" : "Minimal"}
                </button>
              ))}
            </div>
          </div>
          <CarouselChromePaletteSelect
            label="Badge"
            value={chrome.backgroundColor}
            palette={palette}
            onChange={(backgroundColor) => onChromeChange({ backgroundColor })}
          />
          <CarouselChromePaletteSelect
            label="Counter text"
            value={chrome.textColor}
            palette={palette}
            onChange={(textColor) => onChromeChange({ textColor })}
          />
          <CarouselChromePaletteSelect
            label="Accent"
            value={chrome.accentColor}
            palette={palette}
            onChange={(accentColor) => onChromeChange({ accentColor })}
          />
        </div>

        <div className={styles.carouselChromePreview} aria-label="Carousel numbering preview">
          <span>Preview · slide 2 of 6</span>
          {chrome.enabled ? (
            <div
              className={`${styles.carouselChromePreviewBadge} ${
                chrome.style === "minimal" ? styles.carouselChromePreviewMinimal : ""
              }`}
              style={{
                backgroundColor: chrome.backgroundColor,
                borderColor: chrome.accentColor,
                color: chrome.textColor,
              }}
            >
              <b style={{ color: chrome.style === "minimal" ? chrome.textColor : chrome.accentColor }}>2/6</b>
              <span> · next idea </span>
              <b style={{ color: chrome.accentColor }}>→</b>
            </div>
          ) : (
            <p>Numbering is off for the next carousel batch.</p>
          )}
        </div>
      </fieldset>
    </section>
  );
}

function nextAvailablePaletteColor(palette: CreativeBrandPaletteColor[]): string {
  const candidates = ["#F4AF36", "#173F43", "#EF644B", "#2F777B", "#FAF5E6", "#6F8FAF"];
  return candidates.find((color) => !palette.some((entry) => entry.color === color)) ?? "#6F8FAF";
}

function CarouselChromePaletteSelect({
  label,
  value,
  palette,
  onChange,
}: {
  label: string;
  value: string;
  palette: CreativeBrandPaletteColor[];
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.carouselChromeSelect}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {palette.map((entry) => (
          <option key={entry.color} value={entry.color}>
            {entry.name} · {entry.color}
          </option>
        ))}
      </select>
    </label>
  );
}

export function BrandOverlayEditor({
  overlay,
  topicId,
  secret,
  disabled,
  uploading,
  onChange,
  onUpload,
}: {
  overlay: CreativeProfile["brandOverlay"];
  topicId: string;
  secret: string;
  disabled: boolean;
  uploading: boolean;
  onChange: (values: Partial<CreativeProfile["brandOverlay"]>) => void;
  onUpload: (file: File) => void;
}) {
  const hasAsset = Boolean(overlay.assetId);

  return (
    <section className={styles.brandOverlayPanel} aria-labelledby="brand-logo-title">
      <header className={styles.brandOverlayHeader}>
        <div>
          <strong id="brand-logo-title">Brand logo</strong>
          <p>
            Upload a transparent PNG and choose where it will be composited after
            image generation. The prompt reserves a slot calculated from the
            logo proportions, inset, backdrop, and safety buffer; text can use
            the open lane beside it and the full canvas beyond it. Save the
            profile before generating images.
          </p>
        </div>
        <label className={styles.brandEnabledToggle}>
          <input
            type="checkbox"
            checked={overlay.enabled}
            disabled={disabled || !hasAsset}
            onChange={(event) => onChange({ enabled: event.target.checked })}
          />
          <span>Enabled</span>
        </label>
      </header>

      <div className={styles.brandOverlayGrid}>
        <div className={styles.brandAssetCard}>
          <div className={styles.brandAssetPreview}>
            {overlay.assetId ? (
              <BrandAssetPreview
                key={overlay.assetId}
                topicId={topicId}
                secret={secret}
                assetId={overlay.assetId}
                fileName={overlay.asset?.fileName ?? "Brand logo"}
                width={overlay.asset?.width ?? 320}
                height={overlay.asset?.height ?? 160}
              />
            ) : (
              <div className={styles.brandAssetPlaceholder}>PNG logo</div>
            )}
          </div>
          {overlay.asset ? (
            <div className={styles.brandAssetMeta} title={overlay.asset.fileName}>
              <strong>{overlay.asset.fileName}</strong>
              <span>
                {overlay.asset.width}×{overlay.asset.height} · PNG
              </span>
            </div>
          ) : (
            <p className={styles.brandAssetHint}>
              A transparent background gives the cleanest result.
            </p>
          )}
          <label
            className={`${styles.brandUpload} ${
              disabled ? styles.brandUploadDisabled : ""
            }`}
          >
            <input
              type="file"
              accept="image/png,.png"
              disabled={disabled}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (file) onUpload(file);
              }}
            />
            {uploading
              ? "Uploading logo…"
              : overlay.assetId
                ? "Replace PNG"
                : "Upload PNG"}
          </label>
          {!hasAsset ? (
            <small className={styles.brandEnableHint}>
              Upload a logo before enabling the overlay.
            </small>
          ) : null}
        </div>

        <fieldset className={styles.brandControls} disabled={disabled}>
          <div className={styles.brandControlGroup}>
            <span className={styles.brandControlLabel}>Apply logo to</span>
            <div className={styles.brandSegmented} role="group" aria-label="Logo scope">
              {CREATIVE_BRAND_SCOPES.map((scope) => (
                <button
                  type="button"
                  key={scope}
                  className={`${styles.brandOptionButton} ${
                    overlay.scope === scope ? styles.brandOptionSelected : ""
                  }`}
                  aria-pressed={overlay.scope === scope}
                  onClick={() => onChange({ scope })}
                >
                  {scope === "first-unit" ? "First unit" : "All units"}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.brandControlGroup}>
            <span className={styles.brandControlLabel}>
              Placement · {capitalize(overlay.placement.replace("-", " "))}
            </span>
            <div
              className={styles.brandPlacementGrid}
              role="group"
              aria-label="Logo placement"
            >
              {CREATIVE_BRAND_PLACEMENTS.map((placement) => (
                <button
                  type="button"
                  key={placement}
                  data-placement={placement}
                  className={`${styles.brandPlacementButton} ${
                    overlay.placement === placement
                      ? styles.brandPlacementSelected
                      : ""
                  }`}
                  aria-label={capitalize(placement.replace("-", " "))}
                  aria-pressed={overlay.placement === placement}
                  title={capitalize(placement.replace("-", " "))}
                  onClick={() => onChange({ placement })}
                />
              ))}
            </div>
          </div>

          <div className={styles.brandRangeGrid}>
            <label className={styles.brandRange}>
              <span>
                Logo size <strong>{overlay.sizePercent}%</strong>
              </span>
              <input
                type="range"
                min="5"
                max="40"
                value={overlay.sizePercent}
                onChange={(event) =>
                  onChange({ sizePercent: Number(event.target.value) })
                }
              />
            </label>
            <label className={styles.brandRange}>
              <span>
                Edge inset <strong>{overlay.insetPercent}%</strong>
              </span>
              <input
                type="range"
                min="0"
                max="20"
                value={overlay.insetPercent}
                onChange={(event) =>
                  onChange({ insetPercent: Number(event.target.value) })
                }
              />
            </label>
          </div>

          <div className={styles.brandControlGroup}>
            <span className={styles.brandControlLabel}>Backdrop</span>
            <div
              className={styles.brandSegmented}
              role="group"
              aria-label="Logo backdrop"
            >
              {CREATIVE_BRAND_BACKDROP_MODES.map((backdropMode) => (
                <button
                  type="button"
                  key={backdropMode}
                  className={`${styles.brandOptionButton} ${
                    overlay.backdropMode === backdropMode
                      ? styles.brandOptionSelected
                      : ""
                  }`}
                  aria-pressed={overlay.backdropMode === backdropMode}
                  onClick={() => onChange({ backdropMode })}
                >
                  {capitalize(backdropMode)}
                </button>
              ))}
            </div>
          </div>

          {overlay.backdropMode === "solid" ? (
            <div className={styles.brandBackdropSettings}>
              <label className={styles.brandColorControl}>
                <span>Color</span>
                <span className={styles.brandColorPicker}>
                  <input
                    type="color"
                    value={overlay.backdropColor}
                    aria-label="Backdrop color"
                    onChange={(event) =>
                      onChange({ backdropColor: event.target.value.toUpperCase() })
                    }
                  />
                  <code>{overlay.backdropColor.toUpperCase()}</code>
                </span>
              </label>
              <label className={styles.brandRange}>
                <span>
                  Opacity <strong>{overlay.backdropOpacity}%</strong>
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={overlay.backdropOpacity}
                  onChange={(event) =>
                    onChange({ backdropOpacity: Number(event.target.value) })
                  }
                />
              </label>
            </div>
          ) : (
            <p className={styles.brandBackdropHint}>
              The logo will be placed without a background panel.
            </p>
          )}
        </fieldset>
      </div>
    </section>
  );
}

function BrandAssetPreview({
  topicId,
  secret,
  assetId,
  fileName,
  width,
  height,
}: {
  topicId: string;
  secret: string;
  assetId: string;
  fileName: string;
  width: number;
  height: number;
}) {
  const [source, setSource] = useState<string>();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;

    fetch(
      topicUrl(
        `/api/radar/creative-profile/brand-assets/${encodeURIComponent(assetId)}`,
        topicId,
      ),
      {
        cache: "no-store",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${secret.trim()}` },
      },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Brand logo preview unavailable");
        objectUrl = URL.createObjectURL(await response.blob());
        setSource(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setUnavailable(true);
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, secret, topicId]);

  return source ? (
    <Image
      src={source}
      alt={fileName}
      width={width}
      height={height}
      unoptimized
    />
  ) : (
    <div className={styles.brandAssetPlaceholder}>
      {unavailable ? "Preview unavailable" : "Loading preview…"}
    </div>
  );
}
