"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import type {
  CreativeAssetBatchResponse,
  CreativeAspectRatio,
  CreativeDraft,
  CreativeFormat,
  CreativeGeneratedAsset,
  CreativeImageQuality,
  CreativeProfile,
  CreativeUnit,
  CreativeWorkspaceState,
  EditableCreativeDraft,
} from "./modules/stories/creative-content.types";
import styles from "./creative-draft-workspace.module.css";

type WorkspaceProps = {
  topicId: string;
  storyId: string;
  storyTitle: string;
  secret: string;
  onClose: () => void;
};

type BusyAction =
  | "profile"
  | "brief"
  | "draft"
  | "save"
  | "approve"
  | "unapprove"
  | "images";

type LoadedAssets = CreativeAssetBatchResponse & { draftId: string };
type ImageQualityChoice = CreativeImageQuality;
type AssetQualityRequest = {
  draftId: string;
  quality: ImageQualityChoice;
};

const DEFAULT_OUTPUT_ASPECT_RATIO: CreativeAspectRatio = "4:5";
const DEFAULT_IMAGE_QUALITY: ImageQualityChoice = "low";

const OUTPUT_ASPECT_RATIO_OPTIONS = [
  {
    value: "4:5",
    label: "4:5 · Portrait",
    detail: "A vertical feed post or carousel.",
  },
  {
    value: "1:1",
    label: "1:1 · Square",
    detail: "A balanced square post.",
  },
  {
    value: "16:9",
    label: "16:9 · Landscape",
    detail: "A wide presentation or video frame.",
  },
] as const satisfies ReadonlyArray<{
  value: CreativeAspectRatio;
  label: string;
  detail: string;
}>;

const IMAGE_QUALITY_OPTIONS = [
  {
    value: "auto",
    label: "Auto · Model decides",
    detail: "Let GPT Image choose the appropriate quality for this batch.",
  },
  {
    value: "low",
    label: "Low · Default",
    detail: "Fastest and lowest-cost option for first-pass concepts.",
  },
  {
    value: "medium",
    label: "Medium",
    detail: "A balanced option for review-ready graphics.",
  },
  {
    value: "high",
    label: "High",
    detail: "Highest-detail option for final-quality graphics.",
  },
] as const satisfies ReadonlyArray<{
  value: ImageQualityChoice;
  label: string;
  detail: string;
}>;

export function CreativeDraftWorkspace({
  topicId,
  storyId,
  storyTitle,
  secret,
  onClose,
}: WorkspaceProps) {
  const [workspace, setWorkspace] = useState<CreativeWorkspaceState>();
  const [profile, setProfile] = useState<CreativeProfile>();
  const [profileDirty, setProfileDirty] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<CreativeFormat>("meme");
  const [selectedAspectRatio, setSelectedAspectRatio] =
    useState<CreativeAspectRatio>(DEFAULT_OUTPUT_ASPECT_RATIO);
  const [selectedImageQuality, setSelectedImageQuality] =
    useState<ImageQualityChoice>(DEFAULT_IMAGE_QUALITY);
  const [assetQualityRequest, setAssetQualityRequest] =
    useState<AssetQualityRequest>();
  const [editableDraft, setEditableDraft] = useState<EditableCreativeDraft>();
  const [activeDraftId, setActiveDraftId] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<BusyAction>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [loadedAssets, setLoadedAssets] = useState<LoadedAssets>();
  const [assetBusy, setAssetBusy] = useState<string>();
  const requestedImageQuality =
    assetQualityRequest && assetQualityRequest.draftId === activeDraftId
      ? assetQualityRequest.quality
      : undefined;

  useEffect(() => {
    const controller = new AbortController();

    requestJson<CreativeWorkspaceState>(
      topicUrl(
        `/api/radar/stories/${encodeURIComponent(storyId)}/creative`,
        topicId,
      ),
      secret,
      { signal: controller.signal },
    )
      .then((next) => {
        setWorkspace(next);
        setProfile(next.profile);
        setProfileDirty(false);
        const format = next.brief?.recommendedFormat ?? "meme";
        const aspectRatio = resolveDraftAspectRatio(next, format);
        setSelectedFormat(format);
        setSelectedAspectRatio(aspectRatio);
        selectDraft(
          next,
          format,
          aspectRatio,
          setActiveDraftId,
          setEditableDraft,
        );
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(getErrorMessage(loadError));
        }
      });

    return () => controller.abort();
  }, [secret, storyId, topicId]);

  useEffect(() => {
    if (!activeDraftId) return;
    const controller = new AbortController();

    requestJson<CreativeAssetBatchResponse>(
      creativeAssetBatchUrl(
        activeDraftId,
        topicId,
        requestedImageQuality,
      ),
      secret,
      { signal: controller.signal },
    )
      .then((response) => {
        setLoadedAssets({ ...response, draftId: activeDraftId });
        if (!requestedImageQuality) {
          setSelectedImageQuality(imageQualityFromResponse(response));
        }
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(getErrorMessage(loadError));
      });

    return () => controller.abort();
  }, [activeDraftId, requestedImageQuality, secret, topicId]);

  const visibleAssets =
    loadedAssets?.draftId === activeDraftId ? loadedAssets : undefined;
  const returnedAssetBatch = visibleAssets?.batch;
  const returnedImageQuality = returnedAssetBatch
    ? returnedAssetBatch.imageQuality ?? "high"
    : undefined;
  const assetBatch =
    returnedAssetBatch &&
    (!requestedImageQuality ||
      returnedImageQuality === requestedImageQuality)
      ? returnedAssetBatch
      : undefined;
  const hasMismatchedAssetBatch = Boolean(
    returnedAssetBatch &&
      requestedImageQuality &&
      returnedImageQuality !== requestedImageQuality,
  );
  const activeDraft = workspace?.drafts.find(
    (draft) => draft.id === activeDraftId,
  );
  const activeOutputAspectRatio = activeDraft
    ? outputAspectRatioForDraft(activeDraft)
    : selectedAspectRatio;
  const assetsPending = assetBatch?.assets.some(
    (asset) => asset.status === "queued" || asset.status === "generating",
  );
  const assetDimensions = visibleAssets
    ? formatImageDimensions(
        visibleAssets.configuration.width,
        visibleAssets.configuration.height,
      )
    : outputAspectRatioLabel(activeOutputAspectRatio);

  useEffect(() => {
    if (!activeDraftId || !assetsPending) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const response = await requestJson<CreativeAssetBatchResponse>(
          creativeAssetBatchUrl(
            activeDraftId,
            topicId,
            requestedImageQuality,
          ),
          secret,
        );
        if (!cancelled) {
          setLoadedAssets({ ...response, draftId: activeDraftId });
        }
      } catch (pollError) {
        if (!cancelled) setError(getErrorMessage(pollError));
      }
    };

    const timer = window.setInterval(poll, 2_500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    activeDraftId,
    assetsPending,
    requestedImageQuality,
    secret,
    topicId,
  ]);

  async function reloadWorkspace(
    preferredFormat = selectedFormat,
    preferredAspectRatio = selectedAspectRatio,
  ) {
    const next = await requestJson<CreativeWorkspaceState>(
      topicUrl(
        `/api/radar/stories/${encodeURIComponent(storyId)}/creative`,
        topicId,
      ),
      secret,
    );
    setWorkspace(next);
    setProfile(next.profile);
    setProfileDirty(false);
    const aspectRatio = resolveDraftAspectRatio(
      next,
      preferredFormat,
      preferredAspectRatio,
    );
    setSelectedAspectRatio(aspectRatio);
    selectDraft(
      next,
      preferredFormat,
      aspectRatio,
      setActiveDraftId,
      setEditableDraft,
    );
    setDirty(false);
    return next;
  }

  async function handleSaveProfile() {
    if (!profile || busy) return;
    await run("profile", async () => {
      await requestJson(topicUrl("/api/radar/creative-profile", topicId), secret, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      await reloadWorkspace();
      setNotice(
        "Creative profile saved. Refresh the brief if its current inputs changed.",
      );
    });
  }

  async function handleCreateBrief() {
    if (busy) return;
    if (profileDirty) {
      setError("Save the creative profile before creating or refreshing a brief.");
      return;
    }
    await run("brief", async () => {
      const result = await requestJson<{
        outcome: "generated" | "cached";
        state: CreativeWorkspaceState;
      }>(
        topicUrl(
          `/api/radar/stories/${encodeURIComponent(storyId)}/creative`,
          topicId,
        ),
        secret,
        { method: "POST" },
      );
      setWorkspace(result.state);
      setProfile(result.state.profile);
      setProfileDirty(false);
      const format = result.state.brief?.recommendedFormat ?? "meme";
      const aspectRatio = resolveDraftAspectRatio(result.state, format);
      setSelectedFormat(format);
      setSelectedAspectRatio(aspectRatio);
      selectDraft(
        result.state,
        format,
        aspectRatio,
        setActiveDraftId,
        setEditableDraft,
      );
      setDirty(false);
      setNotice(
        result.outcome === "cached"
          ? "The current creative brief was already cached; no AI call was used."
          : "Creative brief generated. Review the recommendation before creating a draft.",
      );
    });
  }

  async function handleGenerateDraft() {
    if (!workspace?.brief || busy) return;
    await run("draft", async () => {
      const result = await requestJson<{
        outcome: "generated" | "cached";
        state: CreativeWorkspaceState;
      }>(
        topicUrl(
          `/api/radar/creative/briefs/${encodeURIComponent(workspace.brief!.id)}/drafts`,
          topicId,
        ),
        secret,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            format: selectedFormat,
            aspectRatio: selectedAspectRatio,
          }),
        },
      );
      setWorkspace(result.state);
      selectDraft(
        result.state,
        selectedFormat,
        selectedAspectRatio,
        setActiveDraftId,
        setEditableDraft,
      );
      setDirty(false);
      setNotice(
        result.outcome === "cached"
          ? `The existing ${selectedFormat} ${outputAspectRatioLabel(selectedAspectRatio)} draft was loaded without an AI call.`
          : `${capitalize(selectedFormat)} ${outputAspectRatioLabel(selectedAspectRatio)} draft generated. Edit and save it before approval.`,
      );
    });
  }

  async function handleSaveDraft() {
    if (!activeDraftId || !editableDraft || busy) return;
    await run("save", async () => {
      await requestJson(
        topicUrl(
          `/api/radar/creative/drafts/${encodeURIComponent(activeDraftId)}`,
          topicId,
        ),
        secret,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editableDraft),
        },
      );
      await reloadWorkspace(selectedFormat);
      setNotice("Draft saved. It is ready for final human approval.");
    });
  }

  async function handleApproveDraft() {
    if (!activeDraftId || dirty || busy) return;
    await run("approve", async () => {
      await requestJson(
        topicUrl(
          `/api/radar/creative/drafts/${encodeURIComponent(activeDraftId)}`,
          topicId,
        ),
        secret,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve" }),
        },
      );
      await reloadWorkspace(selectedFormat);
      setNotice(
        `Draft approved. It is ready for ${assetDimensions} image generation.`,
      );
    });
  }

  async function handleUnapproveDraft() {
    if (!activeDraftId || dirty || busy) return;
    await run("unapprove", async () => {
      await requestJson(
        topicUrl(
          `/api/radar/creative/drafts/${encodeURIComponent(activeDraftId)}`,
          topicId,
        ),
        secret,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "unapprove" }),
        },
      );
      await reloadWorkspace(selectedFormat);
      setNotice(
        "Approval removed. The script is back in draft and can be edited or approved again.",
      );
    });
  }

  async function handleGenerateImages() {
    if (!activeDraftId || !activeDraft || busy) return;
    const count = activeDraft.units.length;
    if (
      !window.confirm(
        `Generate ${count} ${count === 1 ? "image" : "images"} at ${assetDimensions} with GPT Image (${imageQualityLabel(selectedImageQuality)} quality)?`,
      )
    ) {
      return;
    }

    await run("images", async () => {
      const response = await requestJson<
        CreativeAssetBatchResponse & { outcome: "submitted" | "existing" }
      >(
        topicUrl(
          `/api/radar/creative/drafts/${encodeURIComponent(activeDraftId)}/assets`,
          topicId,
        ),
        secret,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quality: selectedImageQuality }),
        },
      );
      setLoadedAssets({ ...response, draftId: activeDraftId });
      const responseQuality = imageQualityFromResponse(response);
      setSelectedImageQuality(responseQuality);
      setAssetQualityRequest({
        draftId: activeDraftId,
        quality: responseQuality,
      });
      setNotice(
        response.outcome === "existing"
          ? `The ${imageQualityLabel(responseQuality).toLowerCase()} image batch already exists; no duplicate generation was submitted.`
          : `${count} ${count === 1 ? "image was" : "images were"} submitted to GPT Image at ${imageQualityLabel(responseQuality).toLowerCase()} quality. Progress will update automatically.`,
      );
    });
  }

  async function handleRegenerateImage(assetId: string, prompt: string) {
    if (!activeDraftId || assetBusy) return;
    await runAsset(`regenerate:${assetId}`, async () => {
      const response = await requestJson<CreativeAssetBatchResponse>(
        topicUrl(
          `/api/radar/creative/assets/${encodeURIComponent(assetId)}`,
          topicId,
        ),
        secret,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        },
      );
      setLoadedAssets({ ...response, draftId: activeDraftId });
      setNotice("A new image version was submitted. The previous version remains recorded.");
    });
  }

  async function handleImageApproval(
    assetId: string,
    action: "approve" | "unapprove",
  ) {
    if (!activeDraftId || assetBusy) return;
    await runAsset(`${action}:${assetId}`, async () => {
      const response = await requestJson<CreativeAssetBatchResponse>(
        topicUrl(
          `/api/radar/creative/assets/${encodeURIComponent(assetId)}`,
          topicId,
        ),
        secret,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      setLoadedAssets({ ...response, draftId: activeDraftId });
      setNotice(
        action === "approve"
          ? "Image approved for this creative."
          : "Image approval removed; it can be reviewed or regenerated.",
      );
    });
  }

  function chooseFormat(format: CreativeFormat) {
    if (dirty && !window.confirm("Discard unsaved draft changes?")) return;
    setSelectedFormat(format);
    if (workspace) {
      selectDraft(
        workspace,
        format,
        selectedAspectRatio,
        setActiveDraftId,
        setEditableDraft,
      );
    }
    setDirty(false);
    setError(undefined);
    setNotice(undefined);
  }

  function chooseAspectRatio(aspectRatio: CreativeAspectRatio) {
    if (dirty && !window.confirm("Discard unsaved draft changes?")) return;
    setSelectedAspectRatio(aspectRatio);
    if (workspace) {
      selectDraft(
        workspace,
        selectedFormat,
        aspectRatio,
        setActiveDraftId,
        setEditableDraft,
      );
    }
    setDirty(false);
    setError(undefined);
    setNotice(undefined);
  }

  function chooseImageQuality(quality: ImageQualityChoice) {
    if (quality === selectedImageQuality && requestedImageQuality === quality) {
      return;
    }

    setSelectedImageQuality(quality);
    if (activeDraftId) {
      setAssetQualityRequest({ draftId: activeDraftId, quality });
      setLoadedAssets(undefined);
    }
    setError(undefined);
    setNotice(undefined);
  }

  async function run(action: BusyAction, task: () => Promise<void>) {
    setBusy(action);
    setError(undefined);
    setNotice(undefined);
    try {
      await task();
    } catch (operationError) {
      setError(getErrorMessage(operationError));
    } finally {
      setBusy(undefined);
    }
  }

  async function runAsset(action: string, task: () => Promise<void>) {
    setAssetBusy(action);
    setError(undefined);
    setNotice(undefined);
    try {
      await task();
    } catch (operationError) {
      setError(getErrorMessage(operationError));
    } finally {
      setAssetBusy(undefined);
    }
  }

  function updateProfile(values: Partial<CreativeProfile>) {
    setProfile((current) => (current ? { ...current, ...values } : current));
    setProfileDirty(true);
  }

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className={styles.workspace}
        role="dialog"
        aria-modal="true"
        aria-labelledby="creative-studio-title"
      >
        <header className={styles.header}>
          <div>
            <p>Creative studio · script and images</p>
            <h2 id="creative-studio-title">{storyTitle}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={Boolean(busy)} aria-label="Close">
            ×
          </button>
        </header>

        {!workspace || !profile ? (
          <div className={styles.loading}>
            {error ? <ErrorMessage message={error} /> : "Loading creative workspace…"}
          </div>
        ) : (
          <div className={styles.body}>
            <div className={styles.progress} aria-label="Creative workflow">
              <ProgressStep number="1" label="Brief" active={!workspace.brief} complete={Boolean(workspace.brief)} />
              <ProgressStep number="2" label="Draft" active={Boolean(workspace.brief && !activeDraft)} complete={Boolean(activeDraft)} />
              <ProgressStep number="3" label="Approval" active={Boolean(activeDraft && activeDraft.status !== "approved")} complete={activeDraft?.status === "approved"} />
              <ProgressStep number="4" label="Images" active={Boolean(activeDraft?.status === "approved" && !assetBatch?.allApproved)} complete={Boolean(assetBatch?.allApproved)} />
            </div>

            {error ? <ErrorMessage message={error} /> : null}
            {notice ? <div className={styles.notice}>{notice}</div> : null}

            <details className={styles.profilePanel}>
              <summary>
                <span>
                  <strong>Creative profile</strong>
                  <small>{profile.platform} · {profile.language} · {profile.region}{profileDirty ? " · unsaved" : ""}</small>
                </span>
                <span>Edit parameters</span>
              </summary>
              <div className={styles.profileBody}>
                <div className={styles.fieldGrid}>
                  <TextField label="Profile name" value={profile.name} onChange={(name) => updateProfile({ name })} />
                  <TextField label="Platform" value={profile.platform} onChange={(platform) => updateProfile({ platform })} />
                  <TextField label="Language" value={profile.language} onChange={(language) => updateProfile({ language })} />
                  <TextField label="Region" value={profile.region} onChange={(region) => updateProfile({ region })} />
                </div>
                <TextAreaField label="Audience" value={profile.audience} onChange={(audience) => updateProfile({ audience })} rows={2} />
                <TextAreaField
                  label="Visual campaign guide"
                  value={profile.visualGuidance ?? ""}
                  onChange={(visualGuidance) => updateProfile({ visualGuidance })}
                  rows={8}
                />
                <p className={styles.profileGuideHint}>
                  Add the complete visual direction for this topic: palette,
                  typography, motifs, safe margins, reserved logo area, and
                  what to avoid. Save it, then refresh the creative brief to
                  apply it to new drafts and images.
                </p>
                <ListField
                  key={profile.brandPersonality.join("|")}
                  label="Brand personality (comma-separated)"
                  values={profile.brandPersonality}
                  onChange={(brandPersonality) => updateProfile({ brandPersonality })}
                />
                <div className={styles.sliders}>
                  {(["formality", "humor", "energy", "optimism", "provocation"] as const).map((dimension) => (
                    <label key={dimension}>
                      <span>{capitalize(dimension)} <strong>{profile[dimension]}</strong></span>
                      <input type="range" min="0" max="100" value={profile[dimension]} onChange={(event) => updateProfile({ [dimension]: Number(event.target.value) })} />
                    </label>
                  ))}
                </div>
                <div className={styles.emojiRow}>
                  <label>
                    <input type="checkbox" checked={profile.allowEmojis} onChange={(event) => updateProfile({ allowEmojis: event.target.checked })} />
                    Allow emojis
                  </label>
                  <label>
                    Maximum
                    <input type="number" min="0" max="10" value={profile.maxEmojis} onChange={(event) => updateProfile({ maxEmojis: Number(event.target.value) })} />
                  </label>
                </div>
                <TextAreaField label="Call-to-action style" value={profile.callToActionStyle} onChange={(callToActionStyle) => updateProfile({ callToActionStyle })} rows={2} />
                <button className={styles.secondaryButton} type="button" disabled={Boolean(busy) || !profileDirty} onClick={handleSaveProfile}>
                  {busy === "profile" ? "Saving profile…" : "Save creative profile"}
                </button>
              </div>
            </details>

            <section className={styles.section}>
              <div className={styles.sectionHeading}>
                <div>
                  <span>Stage 1</span>
                  <h3>Creative brief</h3>
                </div>
                <div className={styles.budget}>
                  {workspace.daily.remainingRuns} of {workspace.daily.maxRuns} AI runs left today
                </div>
              </div>

              {!workspace.story.hasContent ? (
                <div className={styles.warning}>
                  Prepare this story’s content before asking AI for a creative brief.
                </div>
              ) : null}

              {!workspace.brief || !workspace.briefIsCurrent ? (
                <div className={styles.briefCallout}>
                  <div>
                    <strong>{workspace.brief ? "The brief is out of date" : "No creative brief yet"}</strong>
                    <p>{workspace.brief ? "Story content or profile settings changed. Refresh before generating another draft." : "Gemini will assess the story and recommend a meme or carousel."}</p>
                  </div>
                  <button type="button" className={styles.primaryButton} disabled={Boolean(busy) || !workspace.story.hasContent} onClick={handleCreateBrief}>
                    {busy === "brief" ? "Creating brief…" : workspace.brief ? "Refresh creative brief" : "Create creative brief"}
                  </button>
                </div>
              ) : null}

              {workspace.brief ? <BriefView workspace={workspace} selectedFormat={selectedFormat} onSelectFormat={chooseFormat} /> : null}
            </section>

            {workspace.brief ? (
              <section className={styles.section}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span>Stage 2</span>
                    <h3>{capitalize(selectedFormat)} draft · {outputAspectRatioLabel(selectedAspectRatio)}</h3>
                  </div>
                  {activeDraft ? <StatusPill status={activeDraft.status} version={activeDraft.version} /> : null}
                </div>

                <div className={styles.draftSetup}>
                  <label className={`${styles.field} ${styles.aspectRatioField}`}>
                    <span>Output aspect ratio</span>
                    <select
                      value={selectedAspectRatio}
                      disabled={Boolean(busy)}
                      onChange={(event) =>
                        chooseAspectRatio(
                          event.target.value as CreativeAspectRatio,
                        )
                      }
                    >
                      {OUTPUT_ASPECT_RATIO_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p>
                    {outputAspectRatioDetail(selectedAspectRatio)} Each format and
                    ratio is saved as its own draft variant.
                  </p>
                </div>

                {!activeDraft || !editableDraft ? (
                  <div className={styles.generateDraftCard}>
                    <div>
                      <strong>
                        Generate an editable {selectedFormat} script for {outputAspectRatioLabel(selectedAspectRatio)}
                      </strong>
                      <p>
                        This creates copy, fact references, and visual directions—no images.
                      </p>
                    </div>
                    <button type="button" className={styles.primaryButton} disabled={Boolean(busy) || !workspace.briefIsCurrent} onClick={handleGenerateDraft}>
                      {busy === "draft" ? "Generating draft…" : `Generate ${selectedFormat} draft`}
                    </button>
                  </div>
                ) : (
                  <DraftEditor
                    format={selectedFormat}
                    outputAspectRatio={activeOutputAspectRatio}
                    draft={editableDraft}
                    keyFacts={workspace.brief.keyFacts}
                    onChange={(next) => {
                      setEditableDraft(next);
                      setDirty(true);
                    }}
                  />
                )}

                {activeDraft && editableDraft ? (
                  <div className={styles.approvalBar}>
                    <div>
                      <strong>{activeDraft.status === "approved" && !dirty ? "Ready for asset generation" : dirty ? "Unsaved draft changes" : "Ready for human approval"}</strong>
                      <small>{activeDraft.status === "approved" && !dirty ? "Generate and review each integrated text image below." : "Any saved edit resets approval so the exact copy is reviewed."}</small>
                    </div>
                    <div>
                      <button type="button" className={styles.secondaryButton} disabled={Boolean(busy) || !dirty} onClick={handleSaveDraft}>
                        {busy === "save" ? "Saving…" : "Save draft"}
                      </button>
                      {activeDraft.status === "approved" && !dirty ? (
                        <button
                          type="button"
                          className={styles.unapproveButton}
                          disabled={Boolean(busy)}
                          onClick={handleUnapproveDraft}
                        >
                          {busy === "unapprove" ? "Removing approval…" : "Unapprove"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.approveButton}
                          disabled={Boolean(busy) || dirty}
                          onClick={handleApproveDraft}
                        >
                          {busy === "approve" ? "Approving…" : "Approve draft"}
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {activeDraft ? (
              <section className={styles.section}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span>Stage 3</span>
                    <h3>Generated images</h3>
                  </div>
                  {assetBatch ? (
                    <span className={styles.statusPill}>
                      {capitalize(assetBatch.status)} · {imageQualityLabel(assetBatch.imageQuality ?? "high")} · {assetBatch.approvedAssets}/{assetBatch.totalAssets} approved
                    </span>
                  ) : (
                    <span className={styles.statusPill}>
                      {assetDimensions} · {imageQualityLabel(selectedImageQuality)} · PNG
                    </span>
                  )}
                </div>

                {activeDraft.status !== "approved" || dirty ? (
                  <div className={styles.warning}>
                    Save and approve the current script before generating images.
                  </div>
                ) : (
                  <>
                    <div className={styles.imageQualitySetup}>
                      <label className={`${styles.field} ${styles.imageQualityField}`}>
                        <span>GPT Image quality</span>
                        <select
                          value={selectedImageQuality}
                          disabled={Boolean(busy) || Boolean(assetBusy)}
                          onChange={(event) =>
                            chooseImageQuality(
                              event.target.value as ImageQualityChoice,
                            )
                          }
                        >
                          {IMAGE_QUALITY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p>
                        {imageQualityDetail(selectedImageQuality)} Each quality is
                        saved as its own batch, so switching never changes an
                        existing generation.
                      </p>
                    </div>

                    {!visibleAssets ? (
                      <div className={styles.assetLoading}>
                        Loading image workspace…
                      </div>
                    ) : !assetBatch ? (
                      <div className={styles.generateDraftCard}>
                        <div>
                          <strong>
                            Generate {imageQualityLabel(selectedImageQuality).toLowerCase()}-quality integrated text graphics with GPT Image
                          </strong>
                          <p>
                            GPT Image will create {activeDraft.units.length} {activeDraft.units.length === 1 ? "image" : "images"} in {assetDimensions}. Every result still requires human text review.
                          </p>
                          {hasMismatchedAssetBatch && returnedImageQuality ? (
                            <p className={styles.assetVariantHint}>
                              A {imageQualityLabel(returnedImageQuality).toLowerCase()} batch already exists for this draft. Generate this {imageQualityLabel(selectedImageQuality).toLowerCase()} variant without changing it.
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          disabled={Boolean(busy) || Boolean(assetBusy)}
                          onClick={handleGenerateImages}
                        >
                          {busy === "images" ? "Submitting images…" : "Generate images"}
                        </button>
                      </div>
                    ) : (
                      <div className={styles.assetWorkspace}>
                        <div className={styles.assetBatchSummary}>
                          <div>
                            <strong>
                              {assetBatch.allApproved
                                ? "All images approved"
                                : assetsPending
                                  ? "Generation in progress"
                                  : "Review every generated image"}
                            </strong>
                            <p>
                              {assetBatch.allApproved
                                ? "This creative is ready for the future publishing step."
                                : "Check the visible text carefully. Edit a prompt and regenerate only the image that needs work."}
                            </p>
                          </div>
                          <small>
                            {assetBatch.model} · {imageQualityLabel(assetBatch.imageQuality ?? "high")} · {assetBatch.width}×{assetBatch.height}
                          </small>
                        </div>
                        <div className={styles.assetGrid}>
                          {assetBatch.assets.map((asset) => (
                            <CreativeAssetCard
                              key={asset.id}
                              asset={asset}
                              format={activeDraft.format}
                              outputWidth={assetBatch.width}
                              outputHeight={assetBatch.height}
                              busyAction={assetBusy}
                              onRegenerate={handleRegenerateImage}
                              onApproval={handleImageApproval}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </section>
            ) : null}

            <footer className={styles.footer}>
              <a href={workspace.story.url} target="_blank" rel="noreferrer">Open original story ↗</a>
              <span>{workspace.configuration.model} · {workspace.daily.totalTokens.toLocaleString("en-CA")} creative tokens today</span>
            </footer>
          </div>
        )}
      </section>
    </div>
  );
}

function CreativeAssetCard({
  asset,
  format,
  outputWidth,
  outputHeight,
  busyAction,
  onRegenerate,
  onApproval,
}: {
  asset: CreativeGeneratedAsset;
  format: CreativeFormat;
  outputWidth: number;
  outputHeight: number;
  busyAction?: string;
  onRegenerate: (assetId: string, prompt: string) => void;
  onApproval: (assetId: string, action: "approve" | "unapprove") => void;
}) {
  const [prompt, setPrompt] = useState(asset.prompt);
  const isPending = asset.status === "queued" || asset.status === "generating";
  const isBusy = busyAction?.endsWith(asset.id) ?? false;
  const label = format === "meme" ? "Meme" : `Slide ${asset.unitOrder}`;

  return (
    <article className={styles.assetCard}>
      <header>
        <div>
          <strong>{label}</strong>
          <small>{capitalize(asset.unitRole.replaceAll("-", " "))} · v{asset.version}</small>
        </div>
        <span
          className={`${styles.assetStatus} ${asset.status === "approved" ? styles.assetApproved : ""} ${asset.status === "failed" ? styles.assetFailed : ""}`}
        >
          {asset.status === "generating" ? "Generating…" : capitalize(asset.status)}
        </span>
      </header>

      <div
        className={styles.assetPreview}
        style={{ aspectRatio: `${outputWidth} / ${outputHeight}` }}
      >
        {asset.imageUrl ? (
          <Image
            src={asset.imageUrl}
            alt={`Generated ${label.toLowerCase()} version ${asset.version}`}
            fill
            sizes="(max-width: 800px) 100vw, 480px"
            unoptimized
          />
        ) : isPending ? (
          <div className={styles.assetPlaceholder}>
            <span className={styles.assetSpinner} />
            <strong>{asset.status === "queued" ? "Waiting in fal.ai queue" : "Creating image"}</strong>
            <small>This panel updates automatically.</small>
          </div>
        ) : (
          <div className={styles.assetPlaceholder}>
            <strong>Image unavailable</strong>
            <small>{asset.error ?? "Regenerate this image to try again."}</small>
          </div>
        )}
      </div>

      <div className={styles.expectedText}>
        <span>Text that must appear exactly</span>
        <p>{asset.expectedText}</p>
      </div>

      {asset.expectedText.length > 140 ? (
        <div className={styles.assetTextWarning}>
          Dense copy for a {formatImageDimensions(outputWidth, outputHeight)} generated image ({asset.expectedText.length} characters). Check every word; shorter copy is more reliable.
        </div>
      ) : null}

      {asset.safetyFlag ? (
        <div className={styles.assetSafety}>
          Safety checker flagged this output. Regenerate it before approval.
        </div>
      ) : null}

      <details className={styles.assetPrompt}>
        <summary>Edit regeneration prompt</summary>
        <textarea
          rows={9}
          value={prompt}
          disabled={isPending || isBusy}
          onChange={(event) => setPrompt(event.target.value)}
        />
      </details>

      <footer className={styles.assetActions}>
        <div>
          {asset.imageUrl ? (
            <a href={asset.imageUrl} target="_blank" rel="noreferrer">
              Open full image ↗
            </a>
          ) : null}
          {asset.availableVersions > 1 ? (
            <small>{asset.availableVersions} versions saved</small>
          ) : null}
        </div>
        <div>
          {!isPending ? (
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={Boolean(busyAction) || !prompt.trim()}
              onClick={() => onRegenerate(asset.id, prompt)}
            >
              {busyAction === `regenerate:${asset.id}` ? "Submitting…" : "Regenerate"}
            </button>
          ) : null}
          {asset.status === "generated" ? (
            <button
              type="button"
              className={styles.approveButton}
              disabled={Boolean(busyAction) || asset.safetyFlag}
              onClick={() => onApproval(asset.id, "approve")}
            >
              {busyAction === `approve:${asset.id}` ? "Approving…" : "Approve image"}
            </button>
          ) : asset.status === "approved" ? (
            <button
              type="button"
              className={styles.unapproveButton}
              disabled={Boolean(busyAction)}
              onClick={() => onApproval(asset.id, "unapprove")}
            >
              {busyAction === `unapprove:${asset.id}` ? "Removing…" : "Unapprove"}
            </button>
          ) : null}
        </div>
      </footer>
    </article>
  );
}

function BriefView({
  workspace,
  selectedFormat,
  onSelectFormat,
}: {
  workspace: CreativeWorkspaceState;
  selectedFormat: CreativeFormat;
  onSelectFormat: (format: CreativeFormat) => void;
}) {
  const brief = workspace.brief!;
  return (
    <div className={styles.brief}>
      <div className={styles.recommendation}>
        <div>
          <span>Recommended format</span>
          <strong>{capitalize(brief.recommendedFormat)}</strong>
          <small>{brief.confidence}% confidence · {brief.contentSufficiency} source content</small>
        </div>
        <div>
          <span>Key message</span>
          <p>{brief.keyMessage}</p>
        </div>
      </div>
      <div className={styles.briefCopyGrid}>
        <BriefCopy label="Angle" value={brief.angle} />
        <BriefCopy label="Hook" value={brief.hook} />
        <BriefCopy label="Audience" value={brief.targetAudience} />
        <BriefCopy label="Tone" value={`${capitalize(brief.tone.primary)} · ${brief.tone.reason}`} />
      </div>
      <div className={styles.formatOptions}>
        {brief.formatScores.map((score) => (
          <button key={score.format} type="button" className={selectedFormat === score.format ? styles.selectedFormat : ""} onClick={() => onSelectFormat(score.format)}>
            <span>{capitalize(score.format)} {brief.recommendedFormat === score.format ? "· recommended" : ""}</span>
            <strong>{score.score}</strong>
            <small>{score.reason}</small>
          </button>
        ))}
      </div>
      <div className={styles.factsAndRisks}>
        <div>
          <h4>Verified working facts</h4>
          <ul>{brief.keyFacts.map((fact) => <li key={fact.id}><span>{fact.id}</span>{fact.statement}</li>)}</ul>
        </div>
        <div>
          <h4>Risk flags</h4>
          {brief.riskFlags.length ? <ul>{brief.riskFlags.map((risk) => <li key={risk}>{risk}</li>)}</ul> : <p>No specific risk flags.</p>}
        </div>
      </div>
    </div>
  );
}

function DraftEditor({
  format,
  outputAspectRatio,
  draft,
  keyFacts,
  onChange,
}: {
  format: CreativeFormat;
  outputAspectRatio: CreativeAspectRatio;
  draft: EditableCreativeDraft;
  keyFacts: { id: string; statement: string }[];
  onChange: (draft: EditableCreativeDraft) => void;
}) {
  function updateUnit(index: number, unit: CreativeUnit) {
    const units = draft.units.map((current, candidate) => candidate === index ? unit : current);
    onChange({ ...draft, units });
  }

  function moveUnit(index: number, offset: -1 | 1) {
    const destination = index + offset;
    if (destination < 0 || destination >= draft.units.length) return;
    const units = [...draft.units];
    [units[index], units[destination]] = [units[destination]!, units[index]!];
    onChange({ ...draft, units: units.map((unit, position) => ({ ...unit, order: position + 1 })) });
  }

  function addSlide() {
    if (format !== "carousel" || draft.units.length >= 8) return;
    const unit: CreativeUnit = {
      order: draft.units.length + 1,
      type: "carousel-slide",
      role: "content",
      headline: "New slide",
      visualDirection: "Define the visual composition and mood.",
      factIds: [],
      assetRequest: "generated-image",
      aspectRatio: outputAspectRatio,
    };
    onChange({ ...draft, units: [...draft.units, unit] });
  }

  function removeSlide(index: number) {
    if (format !== "carousel" || draft.units.length <= 3) return;
    onChange({
      ...draft,
      units: draft.units.filter((_, candidate) => candidate !== index).map((unit, position) => ({ ...unit, order: position + 1 })),
    });
  }

  return (
    <div className={styles.editor}>
      <TextAreaField label="Concept" value={draft.concept} onChange={(concept) => onChange({ ...draft, concept })} rows={3} />
      <div className={styles.fieldGrid}>
        <TextAreaField label="Caption" value={draft.caption} onChange={(caption) => onChange({ ...draft, caption })} rows={5} />
        <div>
          <TextAreaField label="Call to action (optional)" value={draft.callToAction ?? ""} onChange={(callToAction) => onChange({ ...draft, callToAction })} rows={2} />
          <ListField key={draft.hashtags.join("|")} label="Hashtags (comma-separated)" values={draft.hashtags} onChange={(hashtags) => onChange({ ...draft, hashtags })} />
        </div>
      </div>
      <TextAreaField label="Accessibility alt text" value={draft.altText} onChange={(altText) => onChange({ ...draft, altText })} rows={2} />

      <div className={styles.unitsHeading}>
        <div><h4>{format === "meme" ? "Meme frame" : "Carousel slides"}</h4><p>Text and visual directions remain separate for later composition.</p></div>
        {format === "carousel" ? <button type="button" onClick={addSlide} disabled={draft.units.length >= 8}>+ Add slide</button> : null}
      </div>

      <div className={styles.units}>
        {draft.units.map((unit, index) => (
          <article className={styles.unit} key={`${unit.id ?? "new"}-${index}`}>
            <header>
              <div><span>{format === "meme" ? "Frame" : `Slide ${index + 1}`}</span><strong>{capitalize(unit.role.replaceAll("-", " "))}</strong></div>
              {format === "carousel" ? <div className={styles.unitActions}><button type="button" onClick={() => moveUnit(index, -1)} disabled={index === 0} aria-label="Move slide up">↑</button><button type="button" onClick={() => moveUnit(index, 1)} disabled={index === draft.units.length - 1} aria-label="Move slide down">↓</button><button type="button" onClick={() => removeSlide(index)} disabled={draft.units.length <= 3} aria-label="Remove slide">×</button></div> : null}
            </header>
            <div className={styles.fieldGrid}>
              <label className={styles.field}><span>Role</span><select value={unit.role} onChange={(event) => updateUnit(index, { ...unit, role: event.target.value as CreativeUnit["role"] })}><option value="cover">Cover</option><option value="content">Content</option><option value="conclusion">Conclusion</option><option value="call-to-action">Call to action</option></select></label>
              <label className={styles.field}><span>Visual asset</span><select value={unit.assetRequest} onChange={(event) => updateUnit(index, { ...unit, assetRequest: event.target.value as CreativeUnit["assetRequest"] })}><option value="generated-image">Generated image later</option><option value="typography-only">Typography only</option></select></label>
            </div>
            <TextField label="On-image headline" value={unit.headline} onChange={(headline) => updateUnit(index, { ...unit, headline })} />
            <TextAreaField label="Supporting text (optional)" value={unit.body ?? ""} onChange={(body) => updateUnit(index, { ...unit, body })} rows={2} />
            <TextAreaField label="Visual direction" value={unit.visualDirection} onChange={(visualDirection) => updateUnit(index, { ...unit, visualDirection })} rows={3} />
            <fieldset className={styles.factPicker}>
              <legend>Facts used in this {format === "meme" ? "frame" : "slide"}</legend>
              {keyFacts.map((fact) => (
                <label key={fact.id} title={fact.statement}>
                  <input type="checkbox" checked={unit.factIds.includes(fact.id)} onChange={(event) => updateUnit(index, { ...unit, factIds: event.target.checked ? [...unit.factIds, fact.id] : unit.factIds.filter((id) => id !== fact.id) })} />
                  <span>{fact.id}</span>
                </label>
              ))}
            </fieldset>
          </article>
        ))}
      </div>
    </div>
  );
}

function ProgressStep({ number, label, active, complete }: { number: string; label: string; active: boolean; complete: boolean }) {
  return <div className={`${styles.progressStep} ${active ? styles.progressActive : ""} ${complete ? styles.progressComplete : ""}`}><span>{complete ? "✓" : number}</span>{label}</div>;
}

function StatusPill({ status, version }: { status: CreativeDraft["status"]; version: number }) {
  return <span className={`${styles.statusPill} ${status === "approved" ? styles.statusApproved : ""}`}>{status === "approved" ? "Approved" : "Draft"} · v{version}</span>;
}

function BriefCopy({ label, value }: { label: string; value: string }) {
  return <div className={styles.briefCopy}><span>{label}</span><p>{value}</p></div>;
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className={styles.field}><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function TextAreaField({ label, value, onChange, rows }: { label: string; value: string; onChange: (value: string) => void; rows: number }) {
  return <label className={styles.field}><span>{label}</span><textarea value={value} rows={rows} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ListField({
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

function ErrorMessage({ message }: { message: string }) {
  return <div className={styles.error} role="alert"><strong>Creative studio error</strong><p>{message}</p></div>;
}

function selectDraft(
  workspace: CreativeWorkspaceState,
  format: CreativeFormat,
  aspectRatio: CreativeAspectRatio,
  setId: (id: string | undefined) => void,
  setDraft: (draft: EditableCreativeDraft | undefined) => void,
) {
  const found = workspace.drafts.find(
    (draft) =>
      draft.format === format &&
      outputAspectRatioForDraft(draft) === aspectRatio,
  );
  setId(found?.id);
  setDraft(found ? editableFromDraft(found) : undefined);
}

function editableFromDraft(draft: CreativeDraft): EditableCreativeDraft {
  return {
    concept: draft.concept,
    caption: draft.caption,
    ...(draft.callToAction ? { callToAction: draft.callToAction } : {}),
    hashtags: [...draft.hashtags],
    altText: draft.altText,
    units: draft.units.map((unit) => ({ ...unit, factIds: [...unit.factIds] })),
    outputAspectRatio: outputAspectRatioForDraft(draft),
  };
}

function resolveDraftAspectRatio(
  workspace: CreativeWorkspaceState,
  format: CreativeFormat,
  preferredAspectRatio: CreativeAspectRatio = DEFAULT_OUTPUT_ASPECT_RATIO,
): CreativeAspectRatio {
  const preferred = workspace.drafts.find(
    (draft) =>
      draft.format === format &&
      outputAspectRatioForDraft(draft) === preferredAspectRatio,
  );

  if (preferred) {
    return preferredAspectRatio;
  }

  const existing = workspace.drafts.find((draft) => draft.format === format);
  return existing ? outputAspectRatioForDraft(existing) : preferredAspectRatio;
}

function outputAspectRatioForDraft(
  draft: Pick<CreativeDraft, "format"> & {
    outputAspectRatio?: CreativeAspectRatio;
  },
): CreativeAspectRatio {
  return draft.outputAspectRatio ??
    (draft.format === "meme" ? "1:1" : "4:5");
}

function outputAspectRatioLabel(aspectRatio: CreativeAspectRatio): string {
  return OUTPUT_ASPECT_RATIO_OPTIONS.find(
    (option) => option.value === aspectRatio,
  )?.label ?? aspectRatio;
}

function outputAspectRatioDetail(aspectRatio: CreativeAspectRatio): string {
  return OUTPUT_ASPECT_RATIO_OPTIONS.find(
    (option) => option.value === aspectRatio,
  )?.detail ?? "Choose the image shape before generating the draft.";
}

function imageQualityLabel(imageQuality: ImageQualityChoice): string {
  return IMAGE_QUALITY_OPTIONS.find(
    (option) => option.value === imageQuality,
  )?.label.split(" · ")[0] ?? imageQuality;
}

function imageQualityDetail(imageQuality: ImageQualityChoice): string {
  return IMAGE_QUALITY_OPTIONS.find(
    (option) => option.value === imageQuality,
  )?.detail ?? "Choose the image detail level for this batch.";
}

function imageQualityFromResponse(
  response: CreativeAssetBatchResponse,
): ImageQualityChoice {
  return response.batch
    ? response.batch.imageQuality ?? "high"
    : response.configuration.imageQuality ?? DEFAULT_IMAGE_QUALITY;
}

function creativeAssetBatchUrl(
  draftId: string,
  topicId: string,
  imageQuality?: ImageQualityChoice,
): string {
  const path = `/api/radar/creative/drafts/${encodeURIComponent(draftId)}/assets${
    imageQuality ? `?imageQuality=${encodeURIComponent(imageQuality)}` : ""
  }`;

  return topicUrl(path, topicId);
}

function parseList(value: string): string[] {
  return [...new Set(value.split(/[,\n]+/).map((item) => item.trim()).filter(Boolean))];
}

function topicUrl(path: string, topicId: string): string {
  const separator = path.includes("?") ? "&" : "?";

  return `${path}${separator}topicId=${encodeURIComponent(topicId)}`;
}

async function requestJson<T>(url: string, secret: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { ...init.headers, Authorization: `Bearer ${secret.trim()}` },
  });
  const payload = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
  if (!response.ok) throw new Error(payload?.error ?? `Request failed with ${response.status}`);
  return payload as T;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatImageDimensions(width: number, height: number): string {
  return `${width}×${height}`;
}
