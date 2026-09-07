"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import {
  BRAND_CONTRIBUTION_ASPECTS,
  CREATIVE_BRAND_BACKDROP_MODES,
  CREATIVE_BRAND_PLACEMENTS,
  CREATIVE_BRAND_REFERENCE_KINDS,
  CREATIVE_BRAND_SCOPES,
  CREATIVE_BRAND_UI_ROLES,
  CREATIVE_CAROUSEL_CHROME_STYLES,
  type BrandContributionAspect,
  type CreativeBrandContribution,
  type CreativeBrandPaletteColor,
  type CreativeBrandReference,
  type CreativeBrandReferenceKind,
  type CreativeProfile,
} from "./modules/stories/creative-content.types";
import { contrastRatio } from "@/design/color/oklch";
import { deriveBrandUiPalette } from "@/design/topic-themes";
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

export function TextAreaField({
  label,
  value,
  onChange,
  rows,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  maxLength?: number;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <textarea
        value={value}
        rows={rows}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
      />
      {maxLength !== undefined ? (
        <small className={styles.profileGuideHint}>
          {value.length.toLocaleString()} / {maxLength.toLocaleString()}
        </small>
      ) : null}
    </label>
  );
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

export function BrandPaletteEditor({
  palette,
  carouselChrome,
  disabled,
  onChange,
}: {
  palette: CreativeBrandPaletteColor[];
  carouselChrome: CreativeProfile["carouselChrome"];
  disabled: boolean;
  onChange: (palette: CreativeBrandPaletteColor[]) => void;
}) {
  const updatePaletteColor = (index: number, color: string) =>
    onChange(
      palette.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, color: color.toUpperCase() } : entry,
      ),
    );
  const updatePaletteName = (index: number, name: string) =>
    onChange(
      palette.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, name } : entry,
      ),
    );
  const updatePaletteRole = (
    index: number,
    role: CreativeBrandPaletteColor["role"],
  ) =>
    onChange(
      palette.map((entry, entryIndex) => {
        if (entryIndex === index) {
          return role ? { ...entry, role } : { ...entry, role: undefined };
        }
        return role !== undefined && entry.role === role
          ? { ...entry, role: undefined }
          : entry;
      }),
    );

  return (
    <section className={styles.carouselChromePanel} aria-labelledby="brand-palette-title">
      <header className={styles.brandOverlayHeader}>
        <div>
          <strong id="brand-palette-title">Brand palette</strong>
          <p>
            Define the colours available to this topic. The palette becomes part
            of the visual campaign guide sent to image generation. Assign
            Primary, Secondary, and Surface to theme this topic&rsquo;s UI;
            readable shades and text contrast are generated automatically.
          </p>
        </div>
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
              <select
                className={styles.paletteRoleSelect}
                aria-label={`UI role for ${entry.name}`}
                value={entry.role ?? ""}
                onChange={(event) =>
                  updatePaletteRole(
                    index,
                    event.target.value
                      ? (event.target.value as CreativeBrandPaletteColor["role"])
                      : undefined,
                  )
                }
              >
                <option value="">Supporting colour</option>
                {CREATIVE_BRAND_UI_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {capitalize(role)}
                  </option>
                ))}
              </select>
              <code>{entry.color}</code>
              <button
                type="button"
                className={styles.paletteRemove}
                disabled={palette.length <= 3}
                onClick={() => onChange(palette.filter((_, item) => item !== index))}
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
                onChange([
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
      </fieldset>

      <BrandUiPreview palette={palette} carouselChrome={carouselChrome} />
    </section>
  );
}

const BRAND_UI_CHECKS = [
  ["Body text", "surface", "contrast", "surface", "main", 7],
  ["Primary button", "primary", "contrast", "primary", "main", 4.5],
  ["Secondary badge", "secondary", "contrast", "secondary", "main", 4.5],
  ["Sidebar text", "dark", "contrast", "dark", "main", 4.5],
  ["Muted caption", "tertiary", "dark", "surface", "main", 4.5],
] as const;

/**
 * Live mock of the topic app chrome painted from the *derived* palette, plus a
 * contrast report and any adjustments the engine made. This is the guardrail:
 * you see the working UI — not a carousel badge — before saving the palette.
 */
function BrandUiPreview({
  palette,
  carouselChrome,
}: {
  palette: CreativeBrandPaletteColor[];
  carouselChrome: CreativeProfile["carouselChrome"];
}) {
  const { palette: ui, warnings } = useMemo(
    () => deriveBrandUiPalette({ brandPalette: palette, carouselChrome }),
    [palette, carouselChrome],
  );

  const checks = BRAND_UI_CHECKS.map(
    ([label, fgRole, fgTone, bgRole, bgTone, floor]) => ({
      label,
      floor,
      ratio: contrastRatio(ui[fgRole][fgTone], ui[bgRole][bgTone]),
    }),
  );

  return (
    <div className={styles.brandUiPreview}>
      <span className={styles.brandUiPreviewLabel}>App preview · this topic</span>
      <div
        className={styles.brandUiFrame}
        style={{ background: ui.surface.main, borderColor: ui.surface.dark }}
      >
        <div
          className={styles.brandUiNav}
          style={{ background: ui.dark.main, color: ui.dark.contrast }}
        >
          <strong>Topic</strong>
          <span style={{ color: ui.primary.light }}>Story review</span>
          <span style={{ opacity: 0.68 }}>Editorial</span>
          <span style={{ opacity: 0.68 }}>Creative</span>
        </div>
        <div className={styles.brandUiMain}>
          <div
            className={styles.brandUiCard}
            style={{ background: ui.light.main, borderColor: ui.surface.dark }}
          >
            <strong style={{ color: ui.primary.dark }}>Selected stories</strong>
            <p style={{ color: ui.surface.contrast }}>
              Human-approved stories ranked for the next stage.
            </p>
            <p style={{ color: ui.tertiary.dark }}>12 shown · updated just now</p>
            <div className={styles.brandUiRow}>
              <span
                className={styles.brandUiButton}
                style={{
                  background: ui.primary.main,
                  color: ui.primary.contrast,
                  borderColor: ui.primary.main,
                }}
              >
                Prepare content
              </span>
              <span
                className={styles.brandUiButton}
                style={{
                  background: "transparent",
                  color: ui.primary.dark,
                  borderColor: ui.neutral.main,
                }}
              >
                View
              </span>
              <span
                className={styles.brandUiBadge}
                style={{
                  background: ui.secondary.main,
                  color: ui.secondary.contrast,
                }}
              >
                3 new
              </span>
            </div>
            <span
              className={styles.brandUiInput}
              style={{
                borderColor: ui.neutral.main,
                color: ui.tertiary.dark,
                background: ui.surface.main,
              }}
            >
              Search stories…
            </span>
          </div>
        </div>
      </div>

      <ul className={styles.brandUiChecks}>
        {checks.map((check) => (
          <li
            key={check.label}
            className={styles.brandUiCheck}
            data-pass={check.ratio >= check.floor}
          >
            <span aria-hidden>{check.ratio >= check.floor ? "✓" : "⚠"}</span>
            <span>{check.label}</span>
            <code>{check.ratio.toFixed(1)}:1</code>
          </li>
        ))}
      </ul>

      {warnings.length > 0 ? (
        <ul className={styles.brandUiWarnings}>
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function CarouselNumberingEditor({
  chrome,
  palette,
  disabled,
  onChange,
}: {
  chrome: CreativeProfile["carouselChrome"];
  palette: CreativeBrandPaletteColor[];
  disabled: boolean;
  onChange: (values: Partial<CreativeProfile["carouselChrome"]>) => void;
}) {
  return (
    <section
      className={styles.carouselChromePanel}
      aria-labelledby="carousel-numbering-title"
    >
      <header className={styles.brandOverlayHeader}>
        <div>
          <strong id="carousel-numbering-title">Carousel numbering</strong>
          <p>
            The optional deterministic counter rendered on carousel slides. Its
            colours are picked from the brand palette above.
          </p>
        </div>
        <label className={styles.brandEnabledToggle}>
          <input
            type="checkbox"
            checked={chrome.enabled}
            disabled={disabled}
            onChange={(event) => onChange({ enabled: event.target.checked })}
          />
          <span>Numbering enabled</span>
        </label>
      </header>

      <fieldset className={styles.carouselChromeControls} disabled={disabled}>
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
                  onClick={() => onChange({ style })}
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
            onChange={(backgroundColor) => onChange({ backgroundColor })}
          />
          <CarouselChromePaletteSelect
            label="Counter text"
            value={chrome.textColor}
            palette={palette}
            onChange={(textColor) => onChange({ textColor })}
          />
          <CarouselChromePaletteSelect
            label="Accent"
            value={chrome.accentColor}
            palette={palette}
            onChange={(accentColor) => onChange({ accentColor })}
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

const BRAND_REFERENCE_KIND_LABEL: Record<CreativeBrandReferenceKind, string> = {
  "finished-post": "Finished post",
  poster: "Poster",
  "sticker-sheet": "Sticker sheet",
  signage: "Signage",
  other: "Other",
};

const BRAND_REFERENCES_PATH = "/api/radar/creative/brand-references";
const MAX_BRAND_REFERENCE_UPLOAD_BYTES = 15 * 1024 * 1024;
const BRAND_REFERENCE_ACCEPT = "image/png,image/jpeg,image/webp";

async function brandReferenceRequest<T>(
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

/**
 * BRAND-01 — the per-topic private library of brand visual references. Manages
 * its own fetch/upload cycle (like the brand-logo upload), independent of the
 * creative-profile save.
 */
export function BrandReferenceLibrary({
  topicId,
  secret,
  disabled,
}: {
  topicId: string;
  secret: string;
  disabled: boolean;
}) {
  const [references, setReferences] = useState<CreativeBrandReference[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [pendingFile, setPendingFile] = useState<File>();
  const [formName, setFormName] = useState("");
  const [formKind, setFormKind] = useState<CreativeBrandReferenceKind>("other");
  const [formProvenance, setFormProvenance] = useState("");
  const [formUsageNote, setFormUsageNote] = useState("");
  const [formTransmit, setFormTransmit] = useState(false);

  const authenticated = secret.trim().length > 0;

  useEffect(() => {
    if (!authenticated || !topicId) return;
    const controller = new AbortController();
    brandReferenceRequest<CreativeBrandReference[]>(
      topicUrl(BRAND_REFERENCES_PATH, topicId),
      secret,
      { signal: controller.signal },
    )
      .then((list) => {
        if (controller.signal.aborted) return;
        setReferences(list);
        setError(undefined);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "The brand references could not be loaded",
          );
        }
      });
    return () => controller.abort();
  }, [authenticated, topicId, secret]);

  const loading = !references && !error;
  const list = references ?? [];

  const resetForm = () => {
    setPendingFile(undefined);
    setFormName("");
    setFormKind("other");
    setFormProvenance("");
    setFormUsageNote("");
    setFormTransmit(false);
  };

  const pickFile = (file: File | undefined) => {
    setError(undefined);
    if (!file) {
      setPendingFile(undefined);
      return;
    }
    if (!BRAND_REFERENCE_ACCEPT.split(",").includes(file.type)) {
      setError("Brand references must be PNG, JPEG or WebP.");
      setPendingFile(undefined);
      return;
    }
    if (file.size > MAX_BRAND_REFERENCE_UPLOAD_BYTES) {
      setError("The file must be 15 MB or smaller.");
      setPendingFile(undefined);
      return;
    }
    setPendingFile(file);
    if (!formName.trim()) setFormName(file.name.replace(/\.[^.]+$/, ""));
  };

  const upload = () => {
    if (!pendingFile || !formName.trim() || busy) return;
    setBusy("upload");
    setError(undefined);
    const body = new FormData();
    body.append("image", pendingFile);
    body.append("name", formName);
    body.append("kind", formKind);
    if (formProvenance.trim()) body.append("provenance", formProvenance);
    if (formUsageNote.trim()) body.append("usageNote", formUsageNote);
    body.append("providerTransmissionAllowed", String(formTransmit));
    brandReferenceRequest<CreativeBrandReference>(
      topicUrl(BRAND_REFERENCES_PATH, topicId),
      secret,
      { method: "POST", body },
    )
      .then((created) => {
        setReferences((prev) => [created, ...(prev ?? [])]);
        resetForm();
      })
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "The upload failed",
        );
      })
      .finally(() => setBusy(undefined));
  };

  const patch = (
    reference: CreativeBrandReference,
    changes: Record<string, unknown>,
  ) => {
    if (busy) return;
    setBusy(reference.id);
    setError(undefined);
    brandReferenceRequest<CreativeBrandReference>(
      topicUrl(
        `${BRAND_REFERENCES_PATH}/${encodeURIComponent(reference.id)}`,
        topicId,
      ),
      secret,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...changes, expectedConfigVersion: reference.configVersion, expectedVersion: reference.version }),
      },
    )
      .then((updated) => {
        setReferences((prev) =>
          (prev ?? []).map((entry) =>
            entry.id === updated.id ? updated : entry,
          ),
        );
      })
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "The change could not be saved",
        );
      })
      .finally(() => setBusy(undefined));
  };

  const replaceImage = async (reference: CreativeBrandReference, image: File) => {
    if (busy) return;
    if (image.size > MAX_BRAND_REFERENCE_UPLOAD_BYTES) { setError("The reference must be 15 MB or smaller"); return; }
    setBusy(reference.id); setError(undefined);
    try {
      const form = new FormData(); form.set("image", image); form.set("version", String(reference.version)); form.set("configVersion", String(reference.configVersion));
      const updated = await brandReferenceRequest<CreativeBrandReference>(topicUrl(`${BRAND_REFERENCES_PATH}/${reference.id}`, topicId), secret, { method: "PUT", body: form });
      setReferences(previous => previous?.map(entry => entry.id === updated.id ? updated : entry));
    } catch (error) { setError(error instanceof Error ? error.message : "Replacement failed"); }
    finally { setBusy(undefined); }
  };
  const downloadOriginal = async (reference: CreativeBrandReference) => {
    try {
      const response = await fetch(topicUrl(`${BRAND_REFERENCES_PATH}/${reference.id}?original=true`, topicId), { headers: { Authorization: `Bearer ${secret.trim()}` }, cache: "no-store" });
      if (!response.ok) throw new Error("Original unavailable");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `reference-original.${reference.originalContentType.split("/")[1]}`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setError(error instanceof Error ? error.message : "Download failed"); }
  };

  const analyze = (reference: CreativeBrandReference) => {
    if (busy) return;
    setBusy(`analysis:${reference.id}`);
    setError(undefined);
    brandReferenceRequest<CreativeBrandReference>(
      topicUrl(
        `${BRAND_REFERENCES_PATH}/${encodeURIComponent(reference.id)}/analysis`,
        topicId,
      ),
      secret,
      { method: "POST" },
    )
      .then((updated) => {
        setReferences((prev) =>
          (prev ?? []).map((entry) =>
            entry.id === updated.id ? updated : entry,
          ),
        );
      })
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "The analysis failed",
        );
      })
      .finally(() => setBusy(undefined));
  };

  return (
    <section
      className={styles.brandReferenceLibrary}
      aria-labelledby="brand-references-title"
    >
      <div className={styles.brandOverlayHeader}>
        <div>
          <strong id="brand-references-title">Brand references</strong>
          <p className={styles.brandAssetHint}>
            {list.length}/60 · Post, poster, sticker and signage examples the
            generator can look at for composition, density, colour and graphic
            language.
          </p>
        </div>
      </div>

      <fieldset
        className={styles.brandReferenceForm}
        disabled={disabled || busy === "upload"}
      >
        <div className={styles.brandReferenceFormGrid}>
          <label className={styles.field}>
            <span>Name</span>
            <input
              value={formName}
              onChange={(event) => setFormName(event.target.value)}
              maxLength={120}
            />
          </label>
          <label className={styles.field}>
            <span>Kind</span>
            <select
              value={formKind}
              onChange={(event) =>
                setFormKind(event.target.value as CreativeBrandReferenceKind)
              }
            >
              {CREATIVE_BRAND_REFERENCE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {BRAND_REFERENCE_KIND_LABEL[kind]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Provenance</span>
            <input
              value={formProvenance}
              onChange={(event) => setFormProvenance(event.target.value)}
              maxLength={500}
            />
          </label>
          <label className={styles.field}>
            <span>Usage note</span>
            <textarea
              rows={2}
              value={formUsageNote}
              onChange={(event) => setFormUsageNote(event.target.value)}
              maxLength={1000}
            />
          </label>
        </div>
        <label className={styles.brandEnabledToggle}>
          <input
            type="checkbox"
            checked={formTransmit}
            onChange={(event) => setFormTransmit(event.target.checked)}
          />
          <span>May be sent to the image provider</span>
        </label>
        <div className={styles.brandReferenceForm}>
          <label
            className={`${styles.brandUpload} ${
              disabled ? styles.brandUploadDisabled : ""
            }`}
          >
            <input
              type="file"
              accept={BRAND_REFERENCE_ACCEPT}
              onChange={(event) => {
                pickFile(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
            {pendingFile ? `Selected: ${pendingFile.name}` : "Choose a file"}
          </label>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={
              disabled ||
              busy === "upload" ||
              !pendingFile ||
              !formName.trim()
            }
            onClick={upload}
          >
            {busy === "upload" ? "Uploading…" : "Add to library"}
          </button>
        </div>
      </fieldset>

      {error ? <p className={styles.brandAssetHint}>{error}</p> : null}

      {loading ? (
        <p className={styles.brandAssetHint}>Loading brand references…</p>
      ) : list.length === 0 ? (
        <p className={styles.brandAssetHint}>
          No brand references yet. Upload one above.
        </p>
      ) : (
        <div className={styles.brandReferenceGrid}>
          {list.map((reference) => (
            <BrandReferenceCard
              key={reference.id}
              reference={reference}
              topicId={topicId}
              secret={secret}
              disabled={disabled}
              busy={busy}
              onPatch={patch}
              onAnalyze={analyze}
              onReplace={replaceImage}
              onDownloadOriginal={downloadOriginal}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function BrandReferenceCard({
  onReplace, onDownloadOriginal,
  reference,
  topicId,
  secret,
  disabled,
  busy,
  onPatch,
  onAnalyze,
}: {
  reference: CreativeBrandReference;
  topicId: string;
  secret: string;
  disabled: boolean;
  busy: string | undefined;
  onPatch: (
    reference: CreativeBrandReference,
    changes: Record<string, unknown>,
  ) => void;
  onAnalyze: (reference: CreativeBrandReference) => void;
  onReplace: (reference: CreativeBrandReference, image: File) => void;
  onDownloadOriginal: (reference: CreativeBrandReference) => void;
}) {
  const locked = disabled || Boolean(busy);
  const contribution: CreativeBrandContribution = reference.contribution ?? {
    aspects: [],
    guidance: null,
    avoid: null,
  };
  const contributionSet =
    contribution.aspects.length > 0 || contribution.guidance || contribution.avoid;

  const commitContribution = (next: CreativeBrandContribution) => {
    onPatch(reference, { contribution: next });
  };
  const toggleAspect = (aspect: BrandContributionAspect) => {
    const has = contribution.aspects.includes(aspect);
    commitContribution({
      ...contribution,
      aspects: has
        ? contribution.aspects.filter((entry) => entry !== aspect)
        : [...contribution.aspects, aspect],
    });
  };
  const addAnalysisAspect = (
    aspect: BrandContributionAspect,
    observed: string,
  ) => {
    const guidance = [contribution.guidance, `${aspect}: ${observed}`]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2000);
    commitContribution({
      ...contribution,
      aspects: contribution.aspects.includes(aspect)
        ? contribution.aspects
        : [...contribution.aspects, aspect],
      guidance,
    });
  };

  const analysis = reference.analysis;

  return (
    <details
      className={`${styles.profilePanel} ${
        reference.isActive ? "" : styles.brandReferenceInactive
      }`}
    >
      <summary>
        <span>
          <strong>{reference.name}</strong>
          <small>
            {BRAND_REFERENCE_KIND_LABEL[reference.kind]} ·{" "}
            {reference.width}×{reference.height}
            {reference.activatedForJourney ? " · in the journey" : ""}
          </small>
        </span>
        <span>Edit</span>
      </summary>
      <div className={styles.profileBody}>
        <label>Replace image (keeps earlier versions)<input type="file" accept={BRAND_REFERENCE_ACCEPT} disabled={locked} onChange={event => { const file = event.target.files?.[0]; if (file) onReplace(reference, file); event.target.value = ""; }} /></label>
        {reference.originalAvailable ? <button type="button" className={styles.secondaryButton} onClick={() => onDownloadOriginal(reference)}>Download original</button> : <small>Legacy upload: original bytes were not retained. Replace the image to preserve its original.</small>}
        <BrandReferencePreview key={`${reference.id}:${reference.version}`}
          topicId={topicId}
          secret={secret}
          referenceId={reference.id}
          fileName={reference.fileName}
        />

        <label className={styles.field}>
          <span>Name</span>
          <input
            defaultValue={reference.name}
            disabled={locked}
            maxLength={120}
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value && value !== reference.name) {
                onPatch(reference, { name: value });
              }
            }}
          />
        </label>
        <label className={styles.field}>
          <span>Kind</span>
          <select
            value={reference.kind}
            disabled={locked}
            onChange={(event) =>
              onPatch(reference, { kind: event.target.value })
            }
          >
            {CREATIVE_BRAND_REFERENCE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {BRAND_REFERENCE_KIND_LABEL[kind]}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.field}>
          <span>What the generator should take from this</span>
          <div className={styles.brandContributionChips}>
            {BRAND_CONTRIBUTION_ASPECTS.map((aspect) => {
              const on = contribution.aspects.includes(aspect);
              return (
                <button
                  key={aspect}
                  type="button"
                  className={`${styles.brandContributionChip} ${
                    on ? styles.brandContributionChipOn : ""
                  }`}
                  disabled={locked}
                  onClick={() => toggleAspect(aspect)}
                >
                  {aspect}
                </button>
              );
            })}
          </div>
        </div>
        <label className={styles.field}>
          <span>Guidance</span>
          <textarea
            rows={3}
            defaultValue={contribution.guidance ?? ""}
            disabled={locked}
            maxLength={2000}
            onBlur={(event) => {
              const value = event.target.value.trim() || null;
              if (value !== contribution.guidance) {
                commitContribution({ ...contribution, guidance: value });
              }
            }}
          />
        </label>
        <label className={styles.field}>
          <span>Avoid copying</span>
          <textarea
            rows={2}
            defaultValue={contribution.avoid ?? ""}
            disabled={locked}
            maxLength={2000}
            onBlur={(event) => {
              const value = event.target.value.trim() || null;
              if (value !== contribution.avoid) {
                commitContribution({ ...contribution, avoid: value });
              }
            }}
          />
        </label>

        <label
          className={`${styles.brandReferencePill} ${
            reference.providerTransmissionAllowed
              ? styles.brandReferencePillOn
              : ""
          }`}
        >
          <input
            type="checkbox"
            checked={reference.providerTransmissionAllowed}
            disabled={locked}
            onChange={(event) =>
              onPatch(reference, {
                providerTransmissionAllowed: event.target.checked,
              })
            }
          />
          <span>May be sent to the image provider</span>
        </label>
        <label className={styles.brandReferencePill}>
          <input
            type="checkbox"
            checked={reference.activatedForJourney}
            disabled={
              locked ||
              (!reference.activatedForJourney &&
                (!reference.providerTransmissionAllowed || !contributionSet))
            }
            onChange={(event) =>
              onPatch(reference, { activatedForJourney: event.target.checked })
            }
          />
          <span>Use in the creative journey</span>
        </label>
        {!reference.activatedForJourney &&
        (!reference.providerTransmissionAllowed || !contributionSet) ? (
          <p className={styles.brandAssetHint}>
            Allow provider transmission and set a contribution first.
          </p>
        ) : null}

        <div className={styles.brandReferenceForm}>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={locked || !reference.isActive || !reference.providerTransmissionAllowed}
            onClick={() => onAnalyze(reference)}
          >
            {busy === `analysis:${reference.id}`
              ? "Analyzing…"
              : analysis
                ? "Re-analyze image"
                : "Analyze image"}
          </button>
          {reference.isActive ? (
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={locked}
              onClick={() => {
                if (
                  window.confirm(
                    `Deactivate "${reference.name}"? It stays on file for historical versions.`,
                  )
                ) {
                  onPatch(reference, { isActive: false });
                }
              }}
            >
              Deactivate
            </button>
          ) : (
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={locked}
              onClick={() => onPatch(reference, { isActive: true })}
            >
              Reactivate
            </button>
          )}
        </div>

        {analysis ? (
          <div className={styles.brandAnalysis}>
            <p className={styles.brandAssetHint}>{analysis.note}</p>
            {reference.analysisIsStale ? (
              <p className={styles.brandAssetHint}>
                This analysis is for an older image — re-analyze.
              </p>
            ) : null}
            {BRAND_CONTRIBUTION_ASPECTS.map((aspect) => {
              const entry = analysis.aspects[aspect];
              return (
                <div key={aspect} className={styles.brandAnalysisRow}>
                  <span className={styles.brandReferenceBadge}>{aspect}</span>
                  <span>
                    {entry.present ? (
                      <>
                        {entry.observed}
                        <br />
                        <span className={styles.brandAssetHint}>
                          {entry.evidence}
                        </span>
                      </>
                    ) : (
                      <span className={styles.brandAssetHint}>
                        not determined
                      </span>
                    )}
                  </span>
                  {entry.present ? (
                    <button
                      type="button"
                      className={`${styles.brandAnalysisBadge} ${
                        entry.confidence === "high"
                          ? styles.brandAnalysisBadgeHigh
                          : entry.confidence === "medium"
                            ? styles.brandAnalysisBadgeMedium
                            : styles.brandAnalysisBadgeLow
                      }`}
                      disabled={locked}
                      onClick={() => addAnalysisAspect(aspect, entry.observed)}
                    >
                      + add ({entry.confidence})
                    </button>
                  ) : null}
                </div>
              );
            })}
            {analysis.detectedText.length ? (
              <p className={styles.brandAssetHint}>
                Text seen: {analysis.detectedText.join(" · ")}
              </p>
            ) : null}
            {analysis.avoid.length ? (
              <p className={styles.brandAssetHint}>
                Do not carry over: {analysis.avoid.join(" · ")}
              </p>
            ) : null}
            {analysis.unknowns.length ? (
              <p className={styles.brandAssetHint}>
                Could not determine: {analysis.unknowns.join(" · ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}

export function BrandReferencePreview({
  topicId,
  secret,
  referenceId,
  fileName,
  version,
}: {
  topicId: string;
  secret: string;
  referenceId: string;
  fileName: string;
  version?: number;
}) {
  const [source, setSource] = useState<string>();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;

    fetch(
      topicUrl(
        `/api/radar/creative/brand-references/${encodeURIComponent(referenceId)}${version ? `?version=${version}` : ""}`,
        topicId,
      ),
      {
        cache: "no-store",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${secret.trim()}` },
      },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Preview unavailable");
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
  }, [referenceId, secret, topicId, version]);

  return source ? (
    <Image src={source} alt={fileName} width={320} height={400} unoptimized />
  ) : (
    <div className={styles.referencePreviewPlaceholder}>
      {unavailable ? "Preview unavailable" : "Loading…"}
    </div>
  );
}
