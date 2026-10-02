"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  BrandOverlayEditor,
  BrandPaletteEditor,
  BrandReferenceLibrary,
  CarouselNumberingEditor,
  ListField,
  SupportingCharactersEditor,
  TextAreaField,
  TextField,
  capitalize,
} from "./creative-profile-fields";
import {
  CREATIVE_CONVERSION_GOALS,
  CREATIVE_FRAMING_STRATEGIES,
  CREATIVE_VISUAL_GUIDANCE_MAX_LENGTH,
  VISUAL_FIDELITY_MODES,
  type CreativeBrandAsset,
  type CreativeBrandPaletteColor,
  type CreativeProfile,
} from "./modules/stories/creative-content.types";
import { BrandPaletteAssistant } from "./creative-palette-assistant";
import { CreativeIdentityEditor } from "./creative-identity-editor";
import styles from "./creative-draft-workspace.generated.module.css";
import { GoogleMapsPreviewPanel } from "./google-maps-preview-panel";
import { ActionRow, Button } from "./ui/primitives";
import { useUnsavedBeforeUnload } from "./ui/use-unsaved-before-unload";

const FRAMING_STRATEGY_LABELS = {
  auto: "Auto (brief decides)",
  "reader-consequence": "Reader consequence",
  explainer: "Explainer",
  authority: "Authority",
} as const satisfies Record<CreativeProfile["framingStrategy"], string>;

const VISUAL_FIDELITY_MODE_LABELS = {
  "illustration-editorial": "Editorial illustration",
  "verified-references": "Verified references",
  "photo-required": "Real photo required",
} as const satisfies Record<CreativeProfile["visualFidelityMode"], string>;

type ProfileSaveResponse = CreativeProfile & {
  visualPolicyChange?: {
    policyVersion: number;
    draftsRetired: number;
  };
};

const DIMENSIONS = [
  "formality",
  "humor",
  "energy",
  "optimism",
  "provocation",
] as const;

type Busy = "save" | "brand" | undefined;

export type CreativeProfileSection = "profile" | "voice" | "visual" | "assets";

export function CreativeProfilePanel({
  topicId,
  secret,
  disabled,
  onProfileLoaded,
  onProfileSaved,
  section = "profile",
}: {
  topicId: string;
  secret: string;
  disabled: boolean;
  /** The Profile / Voice / Visual / Assets tab; only that tab's groups are shown. */
  section?: CreativeProfileSection;
  onProfileLoaded?: (profile: CreativeProfile) => void;
  onProfileSaved?: (profile: CreativeProfile) => void;
}) {
  const [draft, setDraft] = useState<CreativeProfile>();
  const [savedProfile, setSavedProfile] = useState<CreativeProfile>();
  const [editVersion, setEditVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<Busy>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [restoredAt, setRestoredAt] = useState<number>();
  const authenticated = secret.trim().length > 0;
  useUnsavedBeforeUnload(dirty);

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
        const unsaved = readUnsavedDraft(topicId, String(profile.updatedAt));
        setDraft(unsaved?.draft ?? profile);
        setSavedProfile(profile);
        setEditVersion((current) => current + 1);
        setDirty(Boolean(unsaved));
        setRestoredAt(unsaved?.savedAt);
        onProfileLoaded?.(profile);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(getErrorMessage(loadError));
      });

    return () => controller.abort();
  }, [authenticated, onProfileLoaded, secret, topicId]);

  // Leaving the page through an in-app link does not fire beforeunload, so an
  // unsaved draft is kept in this browser and restored on the next visit.
  useEffect(() => {
    if (!dirty || !draft || !savedProfile) return;
    const timer = window.setTimeout(() => writeUnsavedDraft(topicId, String(savedProfile.updatedAt), draft), 400);
    return () => window.clearTimeout(timer);
  }, [dirty, draft, savedProfile, topicId]);

  function updateDraft(values: Partial<CreativeProfile>) {
    setDraft((current) => (current ? { ...current, ...values } : current));
    setDirty(true);
    setNotice(undefined);
  }

  function updateGeoScope(values: Partial<CreativeProfile["geoScope"]>) {
    setDraft((current) =>
      current
        ? { ...current, geoScope: { ...current.geoScope, ...values } }
        : current,
    );
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
      const { visualPolicyChange, ...saved } =
        await requestJson<ProfileSaveResponse>(profileUrl(topicId), secret, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
      clearUnsavedDraft(topicId);
      setRestoredAt(undefined);
      setDraft(saved);
      setSavedProfile(saved);
      setEditVersion((current) => current + 1);
      setDirty(false);
      onProfileSaved?.(saved);
      setNotice(
        visualPolicyChange
          ? `Creative profile saved. Place fidelity policy v${visualPolicyChange.policyVersion}: ` +
            `${visualPolicyChange.draftsRetired} draft(s) on the previous policy moved to a new version; ` +
            "their earlier image batches are retired. Refresh those briefs to regenerate under the new policy."
          : "Creative profile saved. The topic UI now uses its brand palette; refresh existing creative briefs to apply the new settings to generated content.",
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

  function discardChanges() {
    if (!savedProfile || busy) return;
    clearUnsavedDraft(topicId);
    setRestoredAt(undefined);
    setDraft(savedProfile);
    setEditVersion((current) => current + 1);
    setDirty(false);
    setError(undefined);
    setNotice("Unsaved creative profile changes discarded. Separately saved assets remain in the library.");
  }

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
      {restoredAt && dirty ? (
        <div className={styles.notice} role="status" aria-live="polite">
          Restored your unsaved changes from {new Date(restoredAt).toLocaleString()}. Save the profile to keep them, or cancel changes to discard them.
        </div>
      ) : null}
      {notice ? (
        <div className={styles.notice} role="status" aria-live="polite">
          {notice}
        </div>
      ) : null}

      <fieldset key={editVersion} className={styles.profileBodyPlain} disabled={controlsDisabled}>
        <Group section={section} tab="profile" title="Identity" id="creative-profile-identity" defaultOpen>
          <div className={styles.fieldGrid}>
            <TextField label="Profile name" value={draft.name} onChange={(name) => updateDraft({ name })} />
            <TextField label="Platform" value={draft.platform} onChange={(platform) => updateDraft({ platform })} />
            <TextField label="Language" value={draft.language} onChange={(language) => updateDraft({ language })} />
            <TextField label="Region" value={draft.region} onChange={(region) => updateDraft({ region })} />
          </div>
          <TextAreaField label="Audience" value={draft.audience} onChange={(audience) => updateDraft({ audience })} rows={2} />
        </Group>

        <Group section={section} tab="profile" title="Strategy" id="creative-profile-strategy">
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
              <span>Story structure</span>
              <select value={draft.storyStructure ?? "auto"} onChange={event => updateDraft({ storyStructure: event.target.value as CreativeProfile["storyStructure"] })}>
                <option value="auto">Automatic — choose from the source</option>
                <option value="hook-steps">Hook + steps — recipes, guides and tutorials</option>
                <option value="hook-list">Hook + list — “N things to…” with one item per slide</option>
              </select>
              <small>Steps prefer an ordered sequence when the source provides them; a list gives each enumerated item its own slide. Missing steps or items are never invented. A single brief can override this in Creative Studio.</small>
            </label>
            <label className={styles.field}>
              <span>Show content name on cover</span>
              <input type="checkbox" checked={draft.requireCoverTitle ?? false} onChange={event => updateDraft({ requireCoverTitle: event.target.checked })} />
              <small>Keep the recipe, guide or project name visible alongside the hook. Editable in the cover subtitle.</small>
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

        <Group section={section} tab="profile" title="Place fidelity" id="creative-profile-place-fidelity">
          <label className={styles.field}>
            <span>How real places are represented</span>
            <select
              value={draft.visualFidelityMode}
              onChange={(event) =>
                updateDraft({
                  visualFidelityMode: event.target
                    .value as CreativeProfile["visualFidelityMode"],
                })
              }
            >
              {VISUAL_FIDELITY_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {VISUAL_FIDELITY_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>
          <p className={styles.profileGuideHint}>
            <strong>Editorial illustration</strong> allows a conceptual image
            labelled as an illustration — never a reconstruction shown as a
            photo. <strong>Verified references</strong> generates from approved
            reference material; it is still an illustration that can alter
            details. <strong>Real photo required</strong> composes on an
            approved photo with no generation, replacement, or artificial
            expansion of the place. Changing this policy sends drafts and images
            approved under the old one back to review.
          </p>
          <div className={styles.fieldGrid}>
            <TextField
              label="Municipality"
              value={draft.geoScope.municipality}
              onChange={(municipality) => updateGeoScope({ municipality })}
            />
            <TextField
              label="Region / province"
              value={draft.geoScope.region}
              onChange={(region) => updateGeoScope({ region })}
            />
            <TextField
              label="Country"
              value={draft.geoScope.country}
              onChange={(country) => updateGeoScope({ country })}
            />
          </div>
          <p className={styles.profileGuideHint}>
            Confirm the covered place. The brand name alone is not enough to
            infer these. A validated location is linked later, from place
            identification.
          </p>
          <label className={styles.field}>
            <span>Geographic provider contact email</span>
            <input type="email" maxLength={254} autoComplete="email"
              value={draft.geoProviderContact ?? ""}
              onChange={(event) => setDraft(current => current ? { ...current, geoProviderContact: event.target.value } : current)}
              aria-describedby="geo-contact-help" />
          </label>
          <p id="geo-contact-help" className={styles.profileGuideHint}>
            Identifies this brand’s requests to geographic providers. It is not printed
            on publications. Leave empty to use the server contact, if configured.
            Changing it does not revoke editorial approvals.
          </p>
          <GoogleMapsPreviewPanel key={topicId} topicId={topicId} secret={secret} profile={draft} disabled={disabled} />
        </Group>

        <Group section={section} tab="voice" title="Voice" id="creative-profile-voice" defaultOpen>
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

        <Group section={section} tab="visual" title="Brand & visual" id="creative-profile-brand" defaultOpen>
          <TextAreaField
            label="Visual campaign guide"
            value={draft.visualGuidance ?? ""}
            onChange={(visualGuidance) => updateDraft({ visualGuidance })}
            rows={8}
            maxLength={CREATIVE_VISUAL_GUIDANCE_MAX_LENGTH}
          />
          <p className={styles.profileGuideHint}>
            Write the complete visual direction for this topic (up to 20,000
            characters): palette, typography, motifs, safe margins, and what to
            avoid. Then organize it into the creative identity below. Visual
            changes and logo settings apply to the next image version without
            rewriting the script.
          </p>
          <CreativeIdentityEditor
            topicId={topicId}
            secret={secret}
            disabled={controlsDisabled}
            guide={draft.visualGuidance ?? ""}
            identity={draft.creativeIdentity ?? null}
            palette={draft.brandPalette}
            onIdentity={(creativeIdentity) => updateDraft({ creativeIdentity })}
            onPalette={updateBrandPalette}
          />
          <BrandPaletteAssistant
            topicId={topicId}
            secret={secret}
            disabled={controlsDisabled}
            palette={draft.brandPalette}
            onApply={updateBrandPalette}
          />
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
          <BrandReferenceLibrary
            topicId={topicId}
            secret={secret}
            disabled={disabled || busy === "save"}
          />
        </Group>

        <Group section={section} tab="assets" title="Supporting characters" id="creative-profile-characters" defaultOpen>
          <SupportingCharactersEditor
            topicId={topicId}
            secret={secret}
            disabled={controlsDisabled}
          />
        </Group>

        <Group section={section} tab="visual" title="Carousel numbering" id="creative-profile-carousel">
          <CarouselNumberingEditor
            chrome={draft.carouselChrome}
            palette={draft.brandPalette}
            disabled={controlsDisabled}
            onChange={updateCarouselChrome}
          />
        </Group>

        <ActionRow className={styles.profileSaveBar}>
          <Button variant="primary" disabled={disabled || Boolean(busy) || !dirty} busy={busy === "save"} onClick={save}>
            {busy === "save" ? "Saving profile…" : "Save creative profile"}
          </Button>
          <Button variant="quiet" disabled={!dirty || Boolean(busy)} onClick={discardChanges}>Cancel changes</Button>
          <span className={styles.profileGuideHint} role="status">
            {disabled ? "Finish the current dashboard operation before saving." : dirty ? "Unsaved profile changes" : `Saved ${new Date(draft.updatedAt).toLocaleString()}`}
          </span>
        </ActionRow>
      </fieldset>
    </section>
  );
}

function Group({
  title,
  id,
  defaultOpen = false,
  section,
  tab,
  children,
}: {
  title: string;
  id?: string;
  defaultOpen?: boolean;
  /** The active tab and the tab this group belongs to; other tabs' groups stay mounted but hidden, keeping unsaved edits. */
  section?: CreativeProfileSection;
  tab?: CreativeProfileSection;
  children: ReactNode;
}) {
  // Local state so a parent re-render (every keystroke sets dirty) does not
  // reconcile `open` back to its default and snap the section the user is
  // editing shut.
  const [open, setOpen] = useState(defaultOpen);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // A sidebar link to this group's id should open it even when collapsed,
  // not just scroll to its (possibly hidden) content.
  useEffect(() => {
    if (!id) return;
    const openIfTargeted = () => {
      if (window.location.hash !== `#${id}`) return;
      setOpen(true);
      // The browser's native anchor jump may have already run against the
      // collapsed height; re-scroll once the section's real height lands.
      requestAnimationFrame(() => {
        detailsRef.current?.scrollIntoView({ block: "start" });
      });
    };
    openIfTargeted();
    window.addEventListener("hashchange", openIfTargeted);
    return () => window.removeEventListener("hashchange", openIfTargeted);
  }, [id]);

  return (
    <details
      ref={detailsRef}
      id={id}
      hidden={Boolean(section && tab && section !== tab)}
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

type UnsavedDraft = { base: string; savedAt: number; draft: CreativeProfile };

function unsavedDraftKey(topicId: string): string {
  return `press-craftor:creative-profile-draft:${topicId}`;
}

/** The stored draft only applies to the profile version it was edited from. */
function readUnsavedDraft(topicId: string, base: string): UnsavedDraft | undefined {
  try {
    const raw = window.localStorage.getItem(unsavedDraftKey(topicId));
    if (!raw) return undefined;
    const stored = JSON.parse(raw) as UnsavedDraft;
    if (stored?.base === base && stored.draft) return stored;
    window.localStorage.removeItem(unsavedDraftKey(topicId));
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
  return undefined;
}

function writeUnsavedDraft(topicId: string, base: string, draft: CreativeProfile) {
  try {
    window.localStorage.setItem(unsavedDraftKey(topicId), JSON.stringify({ base, savedAt: Date.now(), draft }));
  } catch {
    // Best effort; the beforeunload warning still applies.
  }
}

function clearUnsavedDraft(topicId: string) {
  try {
    window.localStorage.removeItem(unsavedDraftKey(topicId));
  } catch {
    // Nothing to clear.
  }
}
