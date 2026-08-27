"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import {
  CAROUSEL_EDITORIAL_GOAL_OPTIONS,
  evaluateCarouselNarrative,
  getDefaultViewerQuestion,
  getPreferredCarouselArc,
  type CarouselEditorialGoal,
} from "./modules/stories/carousel-narrative";
import type {
  CreativeAssetBatchResponse,
  CreativeAspectRatio,
  CreativeCharacter,
  CreativeCharacterReferenceImage,
  CreativeCharacterRosterEntry,
  CreativeDraft,
  CreativeFormat,
  CreativeGeneratedAsset,
  CreativeImageQuality,
  CreativeProfile,
  CreativeUnit,
  CreativeWorkspaceState,
  EditableCreativeDraft,
} from "./modules/stories/creative-content.types";
import styles from "./creative-draft-workspace.generated.module.css";

type WorkspaceProps = {
  topicId: string;
  storyId: string;
  storyTitle: string;
  secret: string;
  onClose: () => void;
};

type BusyAction =
  | "profile"
  | "profile-draft"
  | "brief"
  | "draft"
  | "save"
  | "references"
  | "approve"
  | "unapprove"
  | "images";

type LoadedAssets = CreativeAssetBatchResponse & { draftId: string };
type ImageQualityChoice = CreativeImageQuality;
type AssetQualityRequest = {
  draftId: string;
  quality: ImageQualityChoice;
};

type CharacterSlot = {
  slot: 1 | 2;
  id?: string;
  name: string;
  description: string;
  referenceImages: CreativeCharacterReferenceImage[];
};

const DEFAULT_OUTPUT_ASPECT_RATIO: CreativeAspectRatio = "4:5";
const DEFAULT_IMAGE_QUALITY: ImageQualityChoice = "low";

const OUTPUT_ASPECT_RATIO_OPTIONS = [
  {
    value: "4:5",
    label: "1080x1350 · Portrait (4:5)",
    detail: "Every image and carousel slide uses this feed-ready canvas.",
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
  const [characterSlots, setCharacterSlots] = useState<CharacterSlot[]>(
    emptyCharacterSlots,
  );
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
  const [assetsReloadKey, setAssetsReloadKey] = useState(0);
  const [historyDraftId, setHistoryDraftId] = useState<string>();
  const [assetBusy, setAssetBusy] = useState<string>();
  const [characterBusy, setCharacterBusy] = useState<string>();
  const requestedImageQuality =
    assetQualityRequest && assetQualityRequest.draftId === activeDraftId
      ? assetQualityRequest.quality
      : undefined;
  const activeDraft = workspace?.drafts.find(
    (draft) => draft.id === activeDraftId,
  );
  const viewingHistoricalDraft = Boolean(
    activeDraft &&
      (activeDraft.inputIsCurrent === false || historyDraftId === activeDraft.id),
  );
  const historicDrafts =
    workspace?.drafts.filter((draft) => draft.inputIsCurrent === false) ?? [];
  const currentDraft = workspace?.drafts.find(
    (draft) => draft.inputIsCurrent !== false,
  );

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      requestJson<CreativeWorkspaceState>(
        topicUrl(
          `/api/radar/stories/${encodeURIComponent(storyId)}/creative`,
          topicId,
        ),
        secret,
        { signal: controller.signal },
      ),
      requestJson<CreativeCharacter[]>(
        topicUrl("/api/radar/creative/characters", topicId),
        secret,
        { signal: controller.signal },
      ),
    ])
      .then(([next, characters]) => {
        setWorkspace(next);
        setProfile(next.profile);
        setProfileDirty(false);
        setCharacterSlots(characterSlotsFromCharacters(characters));
        // Prefer the editable draft for the current profile. If there is no
        // current one, open the latest saved study so its copy and images do
        // not appear to vanish after a brief/profile refresh.
        const latestDraft =
          next.drafts.find((draft) => draft.inputIsCurrent !== false) ??
          next.drafts[0];
        const format = latestDraft?.format ?? next.brief?.recommendedFormat ?? "meme";
        const aspectRatio = latestDraft
          ? outputAspectRatioForDraft(latestDraft)
          : resolveDraftAspectRatio(next, format);
        setSelectedFormat(format);
        setSelectedAspectRatio(aspectRatio);
        setHistoryDraftId(undefined);
        if (latestDraft) {
          setActiveDraftId(latestDraft.id);
          setEditableDraft(
            latestDraft.inputIsCurrent === false
              ? undefined
              : editableFromDraft(latestDraft),
          );
        } else {
          selectDraft(
            next,
            format,
            aspectRatio,
            setActiveDraftId,
            setEditableDraft,
          );
        }
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
        viewingHistoricalDraft,
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
  }, [
    activeDraftId,
    requestedImageQuality,
    secret,
    topicId,
    viewingHistoricalDraft,
    assetsReloadKey,
  ]);

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
  // A saved script creates a new immutable draft version. Its previous image
  // batch remains available in history, but must never be treated as the
  // generation state for the newly saved version.
  const assetBatchIsStaleForCurrentDraft = Boolean(
    assetBatch &&
      !viewingHistoricalDraft &&
      (assetBatch.status === "stale" ||
        assetBatch.draftVersion !== activeDraft?.version),
  );
  const currentAssetBatch = assetBatchIsStaleForCurrentDraft
    ? undefined
    : assetBatch;
  const hasMismatchedAssetBatch = Boolean(
    returnedAssetBatch &&
      requestedImageQuality &&
      returnedImageQuality !== requestedImageQuality,
  );
  const currentDraftForSelection = workspace?.drafts.find(
    (draft) =>
      draft.format === selectedFormat &&
      outputAspectRatioForDraft(draft) === selectedAspectRatio &&
      draft.inputIsCurrent !== false,
  );
  const staleDraftForSelection = workspace?.drafts.find(
    (draft) =>
      draft.format === selectedFormat &&
      outputAspectRatioForDraft(draft) === selectedAspectRatio &&
      draft.inputIsCurrent === false,
  );
  const draftNeedsRefresh = Boolean(
    workspace?.brief &&
      (!workspace.briefIsCurrent ||
        (!currentDraftForSelection && staleDraftForSelection)),
  );
  const activeDraftHasSupportingCharacters = Boolean(
    activeDraft?.units.some((unit) => (unit.characterIds?.length ?? 0) > 0),
  );
  const activeOutputAspectRatio = activeDraft
    ? outputAspectRatioForDraft(activeDraft)
    : selectedAspectRatio;
  const assetsPending = currentAssetBatch?.assets.some(
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
            viewingHistoricalDraft,
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
    viewingHistoricalDraft,
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
    // Saving a profile, draft, or approval changes which batch is valid. Do
    // not leave an old in-memory response in place while the new version is
    // loading; otherwise a stale batch can hide the Generate images action.
    setHistoryDraftId(undefined);
    resetAssetWorkspace();
    setDirty(false);
    return next;
  }

  function resetAssetWorkspace() {
    setLoadedAssets(undefined);
    setAssetQualityRequest(undefined);
    setAssetsReloadKey((current) => current + 1);
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
      setError("Save the creative profile before creating or refreshing the brief.");
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
      setHistoryDraftId(undefined);
      resetAssetWorkspace();
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
      let currentState = workspace;
      const needsBriefRefresh =
        !currentState.briefIsCurrent ||
        (selectedFormat === "carousel" && !currentState.brief?.carouselPlan);

      if (needsBriefRefresh) {
        const refreshedBrief = await requestJson<{
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
        currentState = refreshedBrief.state;
        setWorkspace(currentState);
        setProfile(currentState.profile);
        setProfileDirty(false);
      }

      if (!currentState.brief || !currentState.briefIsCurrent) {
        throw new Error(
          "The current creative brief could not be prepared for this draft.",
        );
      }

      const result = await requestJson<{
        outcome: "generated" | "cached";
        state: CreativeWorkspaceState;
      }>(
        topicUrl(
          `/api/radar/creative/briefs/${encodeURIComponent(currentState.brief.id)}/drafts`,
          topicId,
        ),
        secret,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            format: selectedFormat,
            aspectRatio: selectedAspectRatio,
            createNewVersion: true,
          }),
        },
      );
      setWorkspace(result.state);
      setHistoryDraftId(undefined);
      resetAssetWorkspace();
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

  async function handleRefreshDraftFromProfile() {
    if (!workspace?.brief || busy) return;
    if (profileDirty) {
      setError("Save the creative profile before updating the draft.");
      return;
    }

    const refreshBrief = !workspace.briefIsCurrent;
    const maximumRunsNeeded = refreshBrief ? 2 : 1;
    if (workspace.daily.remainingRuns < maximumRunsNeeded) {
      setError(
        `Updating this draft needs up to ${maximumRunsNeeded} AI ${maximumRunsNeeded === 1 ? "run" : "runs"}, but only ${workspace.daily.remainingRuns} remain today.`,
      );
      return;
    }

    if (
      !window.confirm(
        `Create a fresh ${selectedFormat} draft from the current creative profile${refreshBrief ? " and refresh its brief" : " and supporting-character roster"}? This uses up to ${maximumRunsNeeded} AI ${maximumRunsNeeded === 1 ? "run" : "runs"}. Your existing draft and images will remain in history.`,
      )
    ) {
      return;
    }

    await run("profile-draft", async () => {
      let currentState = workspace;
      if (refreshBrief) {
        const refreshedBrief = await requestJson<{
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
        currentState = refreshedBrief.state;
      }

      if (!currentState.brief || !currentState.briefIsCurrent) {
        throw new Error(
          "The current creative profile could not be resolved into a fresh brief.",
        );
      }

      const refreshedDraft = await requestJson<{
        outcome: "generated" | "cached";
        state: CreativeWorkspaceState;
      }>(
        topicUrl(
          `/api/radar/creative/briefs/${encodeURIComponent(currentState.brief.id)}/drafts`,
          topicId,
        ),
        secret,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            format: selectedFormat,
            aspectRatio: selectedAspectRatio,
            createNewVersion: true,
          }),
        },
      );
      setWorkspace(refreshedDraft.state);
      setProfile(refreshedDraft.state.profile);
      setProfileDirty(false);
      setHistoryDraftId(undefined);
      resetAssetWorkspace();
      selectDraft(
        refreshedDraft.state,
        selectedFormat,
        selectedAspectRatio,
        setActiveDraftId,
        setEditableDraft,
      );
      setDirty(false);
      setNotice(
        `Fresh ${selectedFormat} draft created from the current profile. The prior draft and its images remain in history.`,
      );
    });
  }

  async function handleSaveDraft() {
    if (!activeDraftId || !editableDraft || busy || viewingHistoricalDraft) return;
    await run("save", async () => {
      const saved = await requestJson<CreativeDraft>(
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
      setNotice(
        `Draft version ${saved.version} saved. Approve this version before generating images.`,
      );
    });
  }

  async function handleApproveDraft() {
    if (!activeDraftId || dirty || busy || viewingHistoricalDraft) return;
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
    if (!activeDraftId || dirty || busy || viewingHistoricalDraft) return;
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

  async function handleRefreshCharacterReferences() {
    if (
      !activeDraftId ||
      dirty ||
      busy ||
      characterBusy ||
      viewingHistoricalDraft
    ) {
      return;
    }
    if (
      !window.confirm(
        "Use the current supporting-character description and reference images for this draft? This will unapprove the draft and retire its existing image batch.",
      )
    ) {
      return;
    }

    await run("references", async () => {
      await requestJson(
        topicUrl(
          `/api/radar/creative/drafts/${encodeURIComponent(activeDraftId)}`,
          topicId,
        ),
        secret,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "refresh-character-references" }),
        },
      );
      await reloadWorkspace(selectedFormat);
      setNotice(
        "Character references refreshed. Approve the draft, then generate a new image batch to use them.",
      );
    });
  }

  async function handleGenerateImages() {
    if (!activeDraftId || !activeDraft || busy || viewingHistoricalDraft) return;
    const count = activeDraft.units.length;
    if (
      !window.confirm(
        `Generate ${count} ${count === 1 ? "image" : "images"} at ${assetDimensions} with GPT Image (${imageQualityLabel(selectedImageQuality)} quality)${activeDraftHasSupportingCharacters ? ". Slides with selected supporting characters will use reference-guided generation." : ""}?`,
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

  async function handleGenerateNextImageVersion() {
    if (
      !activeDraftId ||
      !activeDraft ||
      !currentAssetBatch ||
      busy ||
      assetBusy ||
      assetsPending ||
      viewingHistoricalDraft ||
      dirty ||
      activeDraft.status !== "approved"
    ) {
      return;
    }

    const count = currentAssetBatch.assets.length;
    if (
      !window.confirm(
        `Generate a new version of all ${count} ${count === 1 ? "image" : "images"} at ${assetDimensions}? Each slide will keep its current prompt and saved character references. The current image versions will remain saved.`,
      )
    ) {
      return;
    }

    await run("images", async () => {
      const response = await requestJson<
        CreativeAssetBatchResponse & { outcome: "versioned" }
      >(
        topicUrl(
          `/api/radar/creative/drafts/${encodeURIComponent(activeDraftId)}/assets`,
          topicId,
        ),
        secret,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            createNewVersion: true,
            batchId: currentAssetBatch.id,
          }),
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
        `New image versions were submitted for all ${count} ${count === 1 ? "slide" : "slides"}. Previous versions remain saved.`,
      );
    });
  }

  async function handleRegenerateImage(assetId: string, prompt: string) {
    if (!activeDraftId || assetBusy || viewingHistoricalDraft) return;
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
    if (!activeDraftId || assetBusy || viewingHistoricalDraft) return;
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
    setHistoryDraftId(undefined);
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

  function viewHistoricalDraft(draft: CreativeDraft) {
    if (dirty && !window.confirm("Discard unsaved draft changes?")) return;
    setSelectedFormat(draft.format);
    setSelectedAspectRatio(outputAspectRatioForDraft(draft));
    setActiveDraftId(draft.id);
    setEditableDraft(undefined);
    setHistoryDraftId(draft.id);
    setAssetQualityRequest(undefined);
    setLoadedAssets(undefined);
    setDirty(false);
    setError(undefined);
    setNotice(undefined);
  }

  function returnToCurrentDraft() {
    if (!workspace) return;
    setHistoryDraftId(undefined);
    setAssetQualityRequest(undefined);
    setLoadedAssets(undefined);
    setDirty(false);
    setError(undefined);

    if (!currentDraft) {
      setActiveDraftId(undefined);
      setEditableDraft(undefined);
      setNotice(
        "No current draft is available for these profile inputs. Refresh the brief or generate a new draft to continue.",
      );
      return;
    }

    setSelectedFormat(currentDraft.format);
    setSelectedAspectRatio(outputAspectRatioForDraft(currentDraft));
    setActiveDraftId(currentDraft.id);
    setEditableDraft(editableFromDraft(currentDraft));
    setNotice(undefined);
  }

  function viewLatestSavedBatch() {
    if (!activeDraftId) return;
    if (dirty && !window.confirm("Discard unsaved draft changes?")) return;
    setEditableDraft(undefined);
    setHistoryDraftId(activeDraftId);
    setAssetQualityRequest(undefined);
    setLoadedAssets(undefined);
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

  async function runCharacter(action: string, task: () => Promise<void>) {
    setCharacterBusy(action);
    setError(undefined);
    setNotice(undefined);
    try {
      await task();
    } catch (operationError) {
      setError(getErrorMessage(operationError));
    } finally {
      setCharacterBusy(undefined);
    }
  }

  function updateProfile(values: Partial<CreativeProfile>) {
    setProfile((current) => (current ? { ...current, ...values } : current));
    setProfileDirty(true);
  }

  function updateCharacterSlot(
    slot: 1 | 2,
    values: Partial<Pick<CharacterSlot, "name" | "description">>,
  ) {
    setCharacterSlots((current) =>
      current.map((character) =>
        character.slot === slot ? { ...character, ...values } : character,
      ),
    );
  }

  function replaceCharacterSlot(character: CreativeCharacter) {
    setCharacterSlots((current) =>
      current.map((slot) =>
        slot.slot === character.slot ? characterSlotFromCharacter(character) : slot,
      ),
    );
  }

  async function handleSaveCharacter(slot: 1 | 2) {
    const character = characterSlots.find((candidate) => candidate.slot === slot);
    if (!character || !character.name.trim() || !character.description.trim()) {
      setError("A supporting character needs both a name and a description.");
      return;
    }

    await runCharacter(`save:${slot}`, async () => {
      const saved = await requestJson<CreativeCharacter>(
        topicUrl(
          character.id
            ? `/api/radar/creative/characters/${encodeURIComponent(character.id)}`
            : "/api/radar/creative/characters",
          topicId,
        ),
        secret,
        {
          method: character.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: character.name,
            description: character.description,
          }),
        },
      );
      replaceCharacterSlot(saved);
      await reloadWorkspace();
      setNotice(
        "Supporting character saved. The Studio rechecked affected drafts before the next image generation.",
      );
    });
  }

  async function handleArchiveCharacter(slot: 1 | 2) {
    const character = characterSlots.find((candidate) => candidate.slot === slot);
    if (!character?.id || !window.confirm(`Remove ${character.name} from this creative profile?`)) {
      return;
    }
    const characterId = character.id;

    await runCharacter(`archive:${characterId}`, async () => {
      await requestJson(
        topicUrl(
          `/api/radar/creative/characters/${encodeURIComponent(characterId)}`,
          topicId,
        ),
        secret,
        { method: "DELETE" },
      );
      setCharacterSlots((current) =>
        current.map((candidate) =>
          candidate.slot === slot ? emptyCharacterSlot(slot) : candidate,
        ),
      );
      await reloadWorkspace();
      setNotice(
        "Supporting character removed. The Studio rechecked affected drafts before the next image generation.",
      );
    });
  }

  async function handleUploadCharacterReferences(slot: 1 | 2, files: File[]) {
    const character = characterSlots.find((candidate) => candidate.slot === slot);
    if (!character?.id || files.length === 0) return;
    const available = Math.max(0, 5 - character.referenceImages.length);
    if (available === 0) {
      setError("A supporting character can have at most five reference images.");
      return;
    }

    await runCharacter(`upload:${character.id}`, async () => {
      const uploaded: CreativeCharacterReferenceImage[] = [];
      for (const file of files.slice(0, available)) {
        const body = new FormData();
        body.append("image", file);
        uploaded.push(
          await requestJson<CreativeCharacterReferenceImage>(
            topicUrl(
              `/api/radar/creative/characters/${encodeURIComponent(character.id!)}/references`,
              topicId,
            ),
            secret,
            { method: "POST", body },
          ),
        );
      }
      setCharacterSlots((current) =>
        current.map((candidate) =>
          candidate.id === character.id
            ? {
                ...candidate,
                referenceImages: [...candidate.referenceImages, ...uploaded].sort(
                  (left, right) => left.order - right.order,
                ),
              }
            : candidate,
        ),
      );
      await reloadWorkspace();
      setNotice(
        `${uploaded.length} reference ${uploaded.length === 1 ? "image was" : "images were"} added to ${character.name}. The Studio rechecked affected drafts.`,
      );
    });
  }

  async function handleRemoveCharacterReference(slot: 1 | 2, referenceId: string) {
    const character = characterSlots.find((candidate) => candidate.slot === slot);
    if (!character?.id) return;

    await runCharacter(`reference:${referenceId}`, async () => {
      await requestJson(
        topicUrl(
          `/api/radar/creative/characters/${encodeURIComponent(character.id!)}/references/${encodeURIComponent(referenceId)}`,
          topicId,
        ),
        secret,
        { method: "DELETE" },
      );
      setCharacterSlots((current) =>
        current.map((candidate) =>
          candidate.id === character.id
            ? {
                ...candidate,
                referenceImages: candidate.referenceImages.filter(
                  (reference) => reference.id !== referenceId,
                ),
              }
            : candidate,
        ),
      );
      await reloadWorkspace();
      setNotice(
        "Reference image removed. The Studio rechecked affected drafts before the next image generation.",
      );
    });
  }

  return (
    <div
      className={styles.backdrop}
      role="presentation"
          onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy && !characterBusy) onClose();
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
          <button type="button" onClick={onClose} disabled={Boolean(busy) || Boolean(characterBusy)} aria-label="Close">
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
              <ProgressStep number="4" label="Images" active={Boolean(activeDraft?.status === "approved" && !currentAssetBatch?.allApproved)} complete={Boolean(currentAssetBatch?.allApproved)} />
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
                  what to avoid. Save it, then update the draft from the
                  current profile to apply it to new prompts and images.
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
                <SupportingCharactersEditor
                  slots={characterSlots}
                  topicId={topicId}
                  secret={secret}
                  busyAction={characterBusy}
                  onChange={updateCharacterSlot}
                  onSave={handleSaveCharacter}
                  onArchive={handleArchiveCharacter}
                  onUpload={handleUploadCharacterReferences}
                  onRemoveReference={handleRemoveCharacterReference}
                />
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
              {historicDrafts.length ? (
                <CreativeDraftHistory
                  drafts={historicDrafts}
                  selectedDraftId={activeDraftId}
                  onSelect={viewHistoricalDraft}
                />
              ) : null}
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
                  <div className={styles.fixedCanvas}>
                    <span>Output canvas</span>
                    <strong>{outputAspectRatioLabel(selectedAspectRatio)}</strong>
                  </div>
                  <p>{outputAspectRatioDetail(selectedAspectRatio)}</p>
                </div>

                {viewingHistoricalDraft ? (
                  <>
                    <div className={styles.historyCallout}>
                      <div>
                        <strong>Viewing a saved study</strong>
                        <p>
                          Its posting copy, question, hashtags, prompts, and
                          generated images remain available here. This saved
                          version is read-only. Use Create improved version
                          below to apply the current narrative rules.
                        </p>
                      </div>
                      {currentDraft ? (
                        <div className={styles.historyActions}>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={returnToCurrentDraft}
                          >
                            Return to current draft
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {activeDraft ? (
                      <HistoricalDraftDetails
                        draft={activeDraft}
                        creating={busy === "profile-draft"}
                        createDisabled={
                          Boolean(busy) ||
                          dirty ||
                          profileDirty ||
                          !workspace.story.hasContent
                        }
                        generationError={error}
                        onCreateImprovedVersion={handleRefreshDraftFromProfile}
                      />
                    ) : null}
                  </>
                ) : draftNeedsRefresh ? (
                  <div className={styles.briefCallout}>
                    <div>
                      <strong>Draft prompts use earlier inputs</strong>
                      <p>
                        {!workspace.briefIsCurrent
                          ? "The creative profile or story changed. Create a fresh brief and draft to apply the new guidance."
                          : "The supporting-character roster or its reference images changed. Create a fresh draft so Gemini can use the current roster."}
                        {" "}The existing draft and images are preserved as history.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      disabled={
                        Boolean(busy) ||
                        dirty ||
                        profileDirty ||
                        !workspace.story.hasContent
                      }
                      onClick={handleRefreshDraftFromProfile}
                    >
                      {busy === "profile-draft"
                        ? "Updating draft…"
                        : "Update draft from profile"}
                    </button>
                  </div>
                ) : !activeDraft || !editableDraft ? (
                  <div className={styles.generateDraftCard}>
                    <div>
                      <strong>
                        Generate an editable {selectedFormat} script for {outputAspectRatioLabel(selectedAspectRatio)}
                      </strong>
                      <p>
                        This creates copy, fact references, and visual directions—no images.
                      </p>
                    </div>
                    <button type="button" className={styles.primaryButton} disabled={Boolean(busy) || !workspace.story.hasContent} onClick={handleGenerateDraft}>
                      {busy === "draft" ? "Generating draft…" : `Generate ${selectedFormat} draft`}
                    </button>
                  </div>
                ) : (
                  <DraftEditor
                    format={selectedFormat}
                    outputAspectRatio={activeOutputAspectRatio}
                    draft={editableDraft}
                    keyFacts={workspace.brief.keyFacts}
                    characterRoster={characterRosterFromSlots(characterSlots)}
                    onChange={(next) => {
                      setEditableDraft(next);
                      setDirty(true);
                    }}
                  />
                )}

                {activeDraft && editableDraft && !viewingHistoricalDraft ? (
                  <div className={styles.approvalBar}>
                    <div>
                      <strong>{activeDraft.status === "approved" && !dirty ? "Ready for asset generation" : dirty ? "Unsaved draft changes" : "Ready for human approval"}</strong>
                      <small>{activeDraft.status === "approved" && !dirty
                        ? activeDraftHasSupportingCharacters
                          ? "Refresh character references before generating if their description or images changed."
                          : "Generate and review each integrated text image below."
                        : "Editing and saving creates a new draft version. The earlier image batch remains in Saved studies."}</small>
                    </div>
                    <div>
                      {activeDraftHasSupportingCharacters ? (
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          disabled={Boolean(busy) || Boolean(characterBusy) || dirty}
                          onClick={handleRefreshCharacterReferences}
                        >
                          {busy === "references" ? "Refreshing references..." : "Refresh character references"}
                        </button>
                      ) : null}
                      <button type="button" className={styles.secondaryButton} disabled={Boolean(busy) || !dirty} onClick={handleSaveDraft}>
                        {busy === "save"
                          ? `Saving version ${activeDraft.version + 1}...`
                          : `Save as version ${activeDraft.version + 1}`}
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
                  {currentAssetBatch ? (
                    <span className={styles.statusPill}>
                      {capitalize(currentAssetBatch.status)} · {imageQualityLabel(currentAssetBatch.imageQuality ?? "high")} · {currentAssetBatch.approvedAssets}/{currentAssetBatch.totalAssets} approved
                    </span>
                  ) : (
                    <span className={styles.statusPill}>
                      {assetDimensions} · {imageQualityLabel(selectedImageQuality)} · PNG
                    </span>
                  )}
                </div>

                {!visibleAssets ? (
                  <div className={styles.assetLoading}>
                    Loading image workspace...
                  </div>
                ) : !currentAssetBatch ? (
                  viewingHistoricalDraft ? (
                    <div className={styles.warning}>
                      This saved study does not have a generated image batch.
                    </div>
                  ) : activeDraft.status !== "approved" || dirty ? (
                    <div className={styles.historyCallout}>
                      <div>
                        <strong>Current draft needs approval</strong>
                        <p>
                          Save and approve this version before creating its new
                          image batch.
                        </p>
                      </div>
                      {activeDraft.version > 1 ? (
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={viewLatestSavedBatch}
                        >
                          View earlier saved images
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className={styles.generateDraftCard}>
                      <div>
                        <strong>
                          {assetBatchIsStaleForCurrentDraft
                            ? "Create a fresh image batch for this saved script"
                            : `Generate ${imageQualityLabel(selectedImageQuality).toLowerCase()}-quality integrated text graphics with GPT Image`}
                        </strong>
                        <p>
                          GPT Image will create {activeDraft.units.length} {activeDraft.units.length === 1 ? "image" : "images"} in {assetDimensions}. {activeDraftHasSupportingCharacters ? "Slides with selected characters use reference-guided generation; other slides remain text-to-image." : "Every slide will use text-to-image."} Every result still requires human text review.
                        </p>
                        {assetBatchIsStaleForCurrentDraft ? (
                          <p className={styles.assetVariantHint}>
                            This script changed after its earlier images were
                            generated. Those images remain in Saved studies;
                            this button creates a separate batch for the
                            current approved version.
                          </p>
                        ) : null}
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
                        {busy === "images" ? "Submitting images..." : "Generate images"}
                      </button>
                      {assetBatchIsStaleForCurrentDraft ? (
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          disabled={Boolean(busy) || Boolean(assetBusy)}
                          onClick={viewLatestSavedBatch}
                        >
                          View earlier saved images
                        </button>
                      ) : null}
                    </div>
                  )
                ) : (
                  <>
                    {viewingHistoricalDraft ||
                    activeDraft.status !== "approved" ||
                    dirty ||
                    currentAssetBatch.status === "stale" ||
                    currentAssetBatch.draftVersion !== activeDraft.version ? (
                      <div className={styles.historyCallout}>
                        <div>
                          <strong>Saved image batch</strong>
                          <p>
                            These images remain available for review, but this
                            draft is not the current approved generation state.
                          </p>
                        </div>
                      </div>
                    ) : (
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
                        <button
                          type="button"
                          className={styles.primaryButton}
                          disabled={
                            Boolean(busy) || Boolean(assetBusy) || assetsPending
                          }
                          onClick={handleGenerateNextImageVersion}
                        >
                          {busy === "images"
                            ? "Creating new versions..."
                            : "Generate new image version"}
                        </button>
                      </div>
                    )}
                    <div className={styles.assetWorkspace}>
                      <div className={styles.assetBatchSummary}>
                        <div>
                          <strong>
                            {currentAssetBatch.allApproved
                              ? "All images approved"
                              : assetsPending
                                ? "Generation in progress"
                                : "Review every generated image"}
                          </strong>
                          <p>
                            {currentAssetBatch.allApproved
                              ? "This creative is ready for the future publishing step."
                              : "Check the visible text carefully. Edit a prompt and regenerate only the image that needs work."}
                          </p>
                        </div>
                        <small>
                          {currentAssetBatch.model} · {imageQualityLabel(currentAssetBatch.imageQuality ?? "high")} · {currentAssetBatch.width}×{currentAssetBatch.height}
                        </small>
                      </div>
                      <div className={styles.assetGrid}>
                        {currentAssetBatch.assets.map((asset) => (
                          <CreativeAssetCard
                            key={asset.id}
                            asset={asset}
                            format={activeDraft.format}
                            outputWidth={currentAssetBatch.width}
                            outputHeight={currentAssetBatch.height}
                            busyAction={assetBusy}
                            readOnly={
                              viewingHistoricalDraft ||
                              activeDraft.status !== "approved" ||
                              dirty ||
                              currentAssetBatch.status === "stale" ||
                              currentAssetBatch.draftVersion !== activeDraft.version
                            }
                            onRegenerate={handleRegenerateImage}
                            onApproval={handleImageApproval}
                          />
                        ))}
                      </div>
                    </div>
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

function CreativeDraftHistory({
  drafts,
  selectedDraftId,
  onSelect,
}: {
  drafts: CreativeDraft[];
  selectedDraftId?: string;
  onSelect: (draft: CreativeDraft) => void;
}) {
  return (
    <details className={styles.historyPanel}>
      <summary>
        <span>
          <strong>Saved studies</strong>
          <small>
            {drafts.length} earlier {drafts.length === 1 ? "draft" : "drafts"} for this story
          </small>
        </span>
        <span>View history</span>
      </summary>
      <div className={styles.historyList}>
        {drafts.map((draft) => (
          <button
            key={draft.id}
            type="button"
            className={
              draft.id === selectedDraftId ? styles.historySelected : undefined
            }
            onClick={() => onSelect(draft)}
          >
            <span>
              <strong>
                {capitalize(draft.format)} · {outputAspectRatioLabel(outputAspectRatioForDraft(draft))}
              </strong>
              <small>
                {capitalize(draft.status)} · draft v{draft.version}
              </small>
            </span>
            <span>Open</span>
          </button>
        ))}
      </div>
    </details>
  );
}

/**
 * A profile refresh can make an older draft non-current, but that must not
 * take its already-approved social copy away from the person posting it.
 * Keep this deliberately read-only: editing or generating from history would
 * mix an old brief with the current creative profile.
 */
function HistoricalDraftDetails({
  draft,
  creating,
  createDisabled,
  generationError,
  onCreateImprovedVersion,
}: {
  draft: CreativeDraft;
  creating: boolean;
  createDisabled: boolean;
  generationError?: string;
  onCreateImprovedVersion: () => void;
}) {
  const hashtags = draft.hashtags
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .join(" ");

  return (
    <div className={styles.historicalDraftDetails}>
      <div className={styles.historicalDraftHeading}>
        <div>
          <strong>Posting copy from this saved study</strong>
          <p>Select and copy any field below for publishing.</p>
        </div>
        <small>
          {capitalize(draft.format)} · v{draft.version}
        </small>
      </div>
      <div className={styles.historicalRegenerationAction}>
        <div>
          <strong>Generate with the new narrative rules</strong>
          <p>
            Creates a new brief and carousel when needed. This saved version
            and its images remain unchanged in history.
          </p>
        </div>
        <div className={styles.historicalRegenerationControls}>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={createDisabled}
            onClick={onCreateImprovedVersion}
          >
            {creating
              ? "Generating new brief and carousel…"
              : "Generate new brief and carousel"}
          </button>
          {generationError ? (
            <small role="alert">Generation failed: {generationError}</small>
          ) : null}
        </div>
      </div>
      <div className={styles.historicalDraftFields}>
        <ReadOnlyDraftField label="Concept" value={draft.concept} rows={3} />
        <ReadOnlyDraftField
          label="Caption"
          value={draft.caption}
          rows={6}
        />
        <ReadOnlyDraftField
          label="Question / call to action"
          value={draft.callToAction ?? "No call to action was saved."}
          rows={3}
        />
        <ReadOnlyDraftField
          label="Hashtags"
          value={hashtags || "No hashtags were saved."}
          rows={3}
        />
      </div>
      <details className={styles.historicalUnits}>
        <summary>Show slide copy and generation prompts</summary>
        <div>
          {draft.units.map((unit) => (
            <article key={unit.id ?? `${unit.order}-${unit.headline}`}>
              <header>
                <strong>
                  {draft.format === "meme" ? "Frame" : `Slide ${unit.order}`}
                </strong>
                <small>{capitalize(unit.role.replaceAll("-", " "))}</small>
              </header>
              <ReadOnlyDraftField
                label="On-image headline"
                value={unit.headline}
                rows={2}
              />
              {unit.body ? (
                <ReadOnlyDraftField
                  label="Supporting text"
                  value={unit.body}
                  rows={3}
                />
              ) : null}
              <ReadOnlyDraftField
                label="Visual / image-generation prompt"
                value={unit.visualDirection}
                rows={5}
              />
            </article>
          ))}
        </div>
      </details>
    </div>
  );
}

function ReadOnlyDraftField({
  label,
  value,
  rows,
}: {
  label: string;
  value: string;
  rows: number;
}) {
  return (
    <label className={styles.readOnlyDraftField}>
      <span>{label}</span>
      <textarea readOnly value={value} rows={rows} />
    </label>
  );
}

function CreativeAssetCard({
  asset,
  format,
  outputWidth,
  outputHeight,
  busyAction,
  readOnly = false,
  onRegenerate,
  onApproval,
}: {
  asset: CreativeGeneratedAsset;
  format: CreativeFormat;
  outputWidth: number;
  outputHeight: number;
  busyAction?: string;
  readOnly?: boolean;
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
          <small>
            {capitalize(asset.unitRole.replaceAll("-", " "))} · v{asset.version} · {asset.generationMode === "reference-guided" ? "Reference-guided" : "Text-to-image"}
          </small>
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
        <summary>{readOnly ? "Generation prompt" : "Edit regeneration prompt"}</summary>
        <textarea
          rows={9}
          value={prompt}
          disabled={readOnly || isPending || isBusy}
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
          {!readOnly && !isPending ? (
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={Boolean(busyAction) || !prompt.trim()}
              onClick={() => onRegenerate(asset.id, prompt)}
            >
              {busyAction === `regenerate:${asset.id}` ? "Submitting…" : "Regenerate"}
            </button>
          ) : null}
          {!readOnly && asset.status === "generated" ? (
            <button
              type="button"
              className={styles.approveButton}
              disabled={Boolean(busyAction) || asset.safetyFlag}
              onClick={() => onApproval(asset.id, "approve")}
            >
              {busyAction === `approve:${asset.id}` ? "Approving…" : "Approve image"}
            </button>
          ) : !readOnly && asset.status === "approved" ? (
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
      {brief.carouselPlan ? (
        <div className={styles.carouselPlanSummary}>
          <div>
            <h4>Planned carousel · {brief.carouselPlan.slideCount} slides</h4>
            <p>{brief.carouselPlan.rationale}</p>
          </div>
          <ol>
            {brief.carouselPlan.slides.map((slide, index) => (
              <li key={`${slide.editorialGoal}-${index}`}>
                <strong>Slide {index + 1} · {capitalize(slide.editorialGoal)}</strong>
                <span>{slide.allowedFactIds.length ? slide.allowedFactIds.join(", ") : "No new facts"}</span>
                <small>{slide.viewerQuestion}</small>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
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
          <ul>{brief.keyFacts.map((fact) => <li key={fact.id}><span>{fact.id}</span>{fact.statement}{fact.requiredQualifiers?.length || fact.attribution ? <small>{fact.requiredQualifiers?.length ? `Preserve: ${fact.requiredQualifiers.join(", ")}` : ""}{fact.requiredQualifiers?.length && fact.attribution ? " · " : ""}{fact.attribution ? `Source: ${fact.attribution}` : ""}</small> : null}</li>)}</ul>
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
  characterRoster,
  onChange,
}: {
  format: CreativeFormat;
  outputAspectRatio: CreativeAspectRatio;
  draft: EditableCreativeDraft;
  keyFacts: { id: string; statement: string }[];
  characterRoster: CreativeCharacterRosterEntry[];
  onChange: (draft: EditableCreativeDraft) => void;
}) {
  const narrativeWarnings =
    format === "carousel"
      ? evaluateCarouselNarrative(draft.units, draft.narrativeRationale)
      : [];

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
    const currentArc = getPreferredCarouselArc(draft.units.length);
    const nextArc = getPreferredCarouselArc(draft.units.length + 1);
    const followsPreferredArc = Boolean(
      currentArc &&
        draft.units.every(
          (candidate, index) =>
            candidate.editorialGoal === currentArc[index],
        ),
    );
    const insertionIndex = Math.max(1, draft.units.length - 1);
    const defaultGoal = nextArc?.[insertionIndex] ?? "explain";
    const unit: CreativeUnit = {
      order: insertionIndex + 1,
      type: "carousel-slide",
      role: "content",
      editorialGoal: defaultGoal,
      viewerQuestion: getDefaultViewerQuestion(defaultGoal),
      headline: "New slide",
      visualDirection: "Define the visual composition and mood.",
      factIds: [],
      assetRequest: "generated-image",
      aspectRatio: outputAspectRatio,
      characterIds: [],
    };
    const inserted = [
      ...draft.units.slice(0, insertionIndex),
      unit,
      ...draft.units.slice(insertionIndex),
    ];
    onChange({
      ...draft,
      units: inserted.map((candidate, index) =>
        withCarouselOrderAndPreferredGoal(
          candidate,
          index,
          followsPreferredArc ? nextArc?.[index] : undefined,
        ),
      ),
    });
  }

  function removeSlide(index: number) {
    if (format !== "carousel" || draft.units.length <= 3) return;
    const currentArc = getPreferredCarouselArc(draft.units.length);
    const nextArc = getPreferredCarouselArc(draft.units.length - 1);
    const followsPreferredArc = Boolean(
      currentArc &&
        draft.units.every(
          (candidate, candidateIndex) =>
            candidate.editorialGoal === currentArc[candidateIndex],
        ),
    );
    onChange({
      ...draft,
      units: draft.units
        .filter((_, candidate) => candidate !== index)
        .map((candidate, position) =>
          withCarouselOrderAndPreferredGoal(
            candidate,
            position,
            followsPreferredArc ? nextArc?.[position] : undefined,
          ),
        ),
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
      {format === "carousel" ? (
        <TextAreaField
          label="Narrative rationale (optional)"
          value={draft.narrativeRationale ?? ""}
          onChange={(narrativeRationale) =>
            onChange({ ...draft, narrativeRationale })
          }
          rows={2}
        />
      ) : null}

      <div className={styles.unitsHeading}>
        <div><h4>{format === "meme" ? "Meme frame" : "Carousel slides"}</h4><p>Text and visual directions remain separate for later composition.</p></div>
        {format === "carousel" ? <button type="button" onClick={addSlide} disabled={draft.units.length >= 8}>+ Add slide</button> : null}
      </div>

      {narrativeWarnings.length ? (
        <div className={styles.narrativeReview} role="status">
          <strong>Narrative review</strong>
          <ul>
            {narrativeWarnings.map((warning, index) => (
              <li key={`${warning.code}-${warning.unitIndex ?? "draft"}-${index}`}>
                {warning.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={styles.units}>
        {draft.units.map((unit, index) => (
          <article className={styles.unit} key={`${unit.id ?? "new"}-${index}`}>
            <header>
              <div><span>{format === "meme" ? "Frame" : `Slide ${index + 1}`}</span><strong>{capitalize(unit.role.replaceAll("-", " "))}</strong></div>
              {format === "carousel" ? <div className={styles.unitActions}><button type="button" onClick={() => moveUnit(index, -1)} disabled={index === 0} aria-label="Move slide up">↑</button><button type="button" onClick={() => moveUnit(index, 1)} disabled={index === draft.units.length - 1} aria-label="Move slide down">↓</button><button type="button" onClick={() => removeSlide(index)} disabled={draft.units.length <= 3} aria-label="Remove slide">×</button></div> : null}
            </header>
            <div className={styles.fieldGrid}>
              <label className={styles.field}><span>Role</span><select value={unit.role} onChange={(event) => updateUnit(index, { ...unit, role: event.target.value as CreativeUnit["role"] })}><option value="cover">Cover</option><option value="content">Content</option><option value="conclusion">Conclusion</option><option value="call-to-action">Call to action</option></select></label>
              {format === "carousel" ? (
                <label className={styles.field}>
                  <span>Editorial purpose</span>
                  <select
                    value={unit.editorialGoal ?? ""}
                    onChange={(event) => {
                      const editorialGoal = event.target.value as CarouselEditorialGoal;
                      const previousDefault = unit.editorialGoal
                        ? getDefaultViewerQuestion(unit.editorialGoal)
                        : undefined;
                      updateUnit(index, {
                        ...unit,
                        editorialGoal,
                        viewerQuestion:
                          !unit.viewerQuestion?.trim() ||
                          unit.viewerQuestion === previousDefault
                            ? getDefaultViewerQuestion(editorialGoal)
                            : unit.viewerQuestion,
                      });
                    }}
                  >
                    <option value="" disabled>Select a purpose</option>
                    {CAROUSEL_EDITORIAL_GOAL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className={styles.field}><span>Visual asset</span><select value={unit.assetRequest} onChange={(event) => updateUnit(index, { ...unit, assetRequest: event.target.value as CreativeUnit["assetRequest"] })}><option value="generated-image">Generated image later</option><option value="typography-only">Typography only</option></select></label>
              )}
            </div>
            {format === "carousel" ? (
              <div className={styles.fieldGrid}>
                <label className={styles.field}><span>Visual asset</span><select value={unit.assetRequest} onChange={(event) => updateUnit(index, { ...unit, assetRequest: event.target.value as CreativeUnit["assetRequest"] })}><option value="generated-image">Generated image later</option><option value="typography-only">Typography only</option></select></label>
                <TextField
                  label="Viewer question (internal)"
                  value={unit.viewerQuestion ?? ""}
                  onChange={(viewerQuestion) =>
                    updateUnit(index, { ...unit, viewerQuestion })
                  }
                />
              </div>
            ) : null}
            <TextField label="On-image headline" value={unit.headline} onChange={(headline) => updateUnit(index, { ...unit, headline })} />
            <TextAreaField label="Supporting text (optional)" value={unit.body ?? ""} onChange={(body) => updateUnit(index, { ...unit, body })} rows={2} />
            {format === "carousel" &&
            (index === draft.units.length - 1 || unit.ctaQuestion) ? (
              <TextField
                label="Visible CTA question (optional)"
                value={unit.ctaQuestion ?? ""}
                onChange={(ctaQuestion) =>
                  updateUnit(index, { ...unit, ctaQuestion })
                }
              />
            ) : null}
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
            <fieldset className={styles.characterPicker}>
              <legend>Supporting characters (optional)</legend>
              {characterRoster.length ? characterRoster.map((character) => (
                <label key={character.id} title={character.description}>
                  <input
                    type="checkbox"
                    checked={(unit.characterIds ?? []).includes(character.id)}
                    disabled={
                      !(unit.characterIds ?? []).includes(character.id) &&
                      (unit.characterIds?.length ?? 0) >= 2
                    }
                    onChange={(event) => updateUnit(index, {
                      ...unit,
                      characterIds: event.target.checked
                        ? [...(unit.characterIds ?? []), character.id]
                        : (unit.characterIds ?? []).filter((id) => id !== character.id),
                    })}
                  />
                  <span>{character.name}</span>
                </label>
              )) : <p>Add a character with at least one reference image in Creative profile to make it available here.</p>}
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

function SupportingCharactersEditor({
  slots,
  topicId,
  secret,
  busyAction,
  onChange,
  onSave,
  onArchive,
  onUpload,
  onRemoveReference,
}: {
  slots: CharacterSlot[];
  topicId: string;
  secret: string;
  busyAction?: string;
  onChange: (
    slot: 1 | 2,
    values: Partial<Pick<CharacterSlot, "name" | "description">>,
  ) => void;
  onSave: (slot: 1 | 2) => void;
  onArchive: (slot: 1 | 2) => void;
  onUpload: (slot: 1 | 2, files: File[]) => void;
  onRemoveReference: (slot: 1 | 2, referenceId: string) => void;
}) {
  return (
    <section className={styles.charactersSection}>
      <div className={styles.charactersHeading}>
        <div>
          <strong>Supporting characters</strong>
          <p>Optional fictional visual narrators for new story drafts.</p>
        </div>
        <small>Up to 2 characters · 5 references each</small>
      </div>
      <div className={styles.characterGrid}>
        {slots.map((character) => {
          const isSaved = Boolean(character.id);
          const isBusy = Boolean(busyAction);
          const isSaving = busyAction === `save:${character.slot}`;
          const isUploading = character.id
            ? busyAction === `upload:${character.id}`
            : false;

          return (
            <article className={styles.characterSlot} key={character.slot}>
              <header>
                <div>
                  <span>Character {character.slot}</span>
                  <strong>{isSaved ? character.name : "Available slot"}</strong>
                </div>
                {isSaved ? (
                  <button
                    type="button"
                    className={styles.characterRemoveButton}
                    disabled={isBusy}
                    onClick={() => onArchive(character.slot)}
                  >
                    Remove
                  </button>
                ) : null}
              </header>
              <label className={styles.field}>
                <span>Name</span>
                <input
                  value={character.name}
                  disabled={isBusy}
                  onChange={(event) =>
                    onChange(character.slot, { name: event.target.value })
                  }
                />
              </label>
              <label className={styles.field}>
                <span>Description</span>
                <textarea
                  rows={3}
                  value={character.description}
                  disabled={isBusy}
                  onChange={(event) =>
                    onChange(character.slot, {
                      description: event.target.value,
                    })
                  }
                />
              </label>
              <div className={styles.characterReferences}>
                <div className={styles.characterReferencesHeading}>
                  <span>Reference images</span>
                  <small>{character.referenceImages.length}/5</small>
                </div>
                {isSaved ? (
                  <>
                    {character.referenceImages.length ? (
                      <div className={styles.referenceGrid}>
                        {character.referenceImages.map((reference) => (
                          <figure key={reference.id} className={styles.referenceItem}>
                            <CharacterReferencePreview
                              topicId={topicId}
                              secret={secret}
                              characterId={character.id!}
                              reference={reference}
                            />
                            <figcaption title={reference.fileName}>
                              <span>{reference.fileName}</span>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() =>
                                  onRemoveReference(
                                    character.slot,
                                    reference.id,
                                  )
                                }
                              >
                                Remove
                              </button>
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.referenceEmpty}>
                        Add at least one image before this character is available to AI.
                      </p>
                    )}
                    <label
                      className={`${styles.referenceUpload} ${
                        character.referenceImages.length >= 5 ? styles.referenceUploadDisabled : ""
                      }`}
                    >
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        disabled={isBusy || character.referenceImages.length >= 5}
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? []);
                          event.currentTarget.value = "";
                          onUpload(character.slot, files);
                        }}
                      />
                      {isUploading ? "Uploading references..." : "Add reference images"}
                    </label>
                  </>
                ) : (
                  <p className={styles.referenceEmpty}>
                    Save name and description to add JPEG, PNG, or WebP references.
                  </p>
                )}
              </div>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={
                  isBusy || !character.name.trim() || !character.description.trim()
                }
                onClick={() => onSave(character.slot)}
              >
                {isSaving ? "Saving character..." : isSaved ? "Save character" : "Create character"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CharacterReferencePreview({
  topicId,
  secret,
  characterId,
  reference,
}: {
  topicId: string;
  secret: string;
  characterId: string;
  reference: CreativeCharacterReferenceImage;
}) {
  const [source, setSource] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;

    fetch(
      topicUrl(
        `/api/radar/creative/characters/${encodeURIComponent(characterId)}/references/${encodeURIComponent(reference.id)}`,
        topicId,
      ),
      {
        cache: "no-store",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${secret.trim()}` },
      },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Reference preview unavailable");
        objectUrl = URL.createObjectURL(await response.blob());
        setSource(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSource(undefined);
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [characterId, reference.id, secret, topicId]);

  return source ? (
    <Image
      src={source}
      alt={reference.fileName}
      width={160}
      height={160}
      unoptimized
    />
  ) : (
    <div className={styles.referencePreviewPlaceholder}>Loading</div>
  );
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
  const candidates = workspace.drafts.filter(
    (draft) =>
      draft.format === format &&
      outputAspectRatioForDraft(draft) === aspectRatio,
  );
  const found =
    candidates.find((draft) => draft.inputIsCurrent !== false) ??
    candidates[0];
  if (!found) {
    setId(undefined);
    setDraft(undefined);
    return;
  }

  setId(found.id);
  setDraft(
    found.inputIsCurrent === false ? undefined : editableFromDraft(found),
  );
}

function emptyCharacterSlots(): CharacterSlot[] {
  return [emptyCharacterSlot(1), emptyCharacterSlot(2)];
}

function emptyCharacterSlot(slot: 1 | 2): CharacterSlot {
  return { slot, name: "", description: "", referenceImages: [] };
}

function characterSlotFromCharacter(character: CreativeCharacter): CharacterSlot {
  return {
    slot: character.slot,
    id: character.id,
    name: character.name,
    description: character.description,
    referenceImages: character.referenceImages,
  };
}

function characterSlotsFromCharacters(
  characters: CreativeCharacter[],
): CharacterSlot[] {
  return ([1, 2] as const).map((slot) => {
    const character = characters.find((candidate) => candidate.slot === slot);
    return character ? characterSlotFromCharacter(character) : emptyCharacterSlot(slot);
  });
}

function characterRosterFromSlots(
  slots: CharacterSlot[],
): CreativeCharacterRosterEntry[] {
  return slots.flatMap((character) =>
    character.id && character.referenceImages.length > 0
      ? [
          {
            id: character.id,
            name: character.name,
            description: character.description,
          },
        ]
      : [],
  );
}

function editableFromDraft(draft: CreativeDraft): EditableCreativeDraft {
  return {
    concept: draft.concept,
    ...(draft.narrativeRationale
      ? { narrativeRationale: draft.narrativeRationale }
      : {}),
    caption: draft.caption,
    ...(draft.callToAction ? { callToAction: draft.callToAction } : {}),
    hashtags: [...draft.hashtags],
    altText: draft.altText,
    units: draft.units.map((unit) => ({
      ...unit,
      factIds: [...unit.factIds],
      characterIds: [...(unit.characterIds ?? [])],
    })),
    outputAspectRatio: outputAspectRatioForDraft(draft),
  };
}

function withCarouselOrderAndPreferredGoal(
  unit: CreativeUnit,
  index: number,
  preferredGoal?: CarouselEditorialGoal,
): CreativeUnit {
  if (!preferredGoal) {
    return { ...unit, order: index + 1 };
  }

  const goalChanged = unit.editorialGoal !== preferredGoal;
  return {
    ...unit,
    order: index + 1,
    editorialGoal: preferredGoal,
    viewerQuestion:
      goalChanged || !unit.viewerQuestion?.trim()
        ? getDefaultViewerQuestion(preferredGoal)
        : unit.viewerQuestion,
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
      draft.inputIsCurrent !== false &&
      outputAspectRatioForDraft(draft) === preferredAspectRatio,
  );

  if (preferred) {
    return preferredAspectRatio;
  }

  const existing = workspace.drafts.find(
    (draft) => draft.format === format && draft.inputIsCurrent !== false,
  );
  return existing ? outputAspectRatioForDraft(existing) : preferredAspectRatio;
}

function outputAspectRatioForDraft(
  draft: Pick<CreativeDraft, "format"> & {
    outputAspectRatio?: CreativeAspectRatio;
  },
): CreativeAspectRatio {
  void draft;
  return "4:5";
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
  history = false,
): string {
  const search = new URLSearchParams();
  if (imageQuality) search.set("imageQuality", imageQuality);
  if (history) search.set("history", "true");
  const query = search.size ? `?${search.toString()}` : "";
  const path = `/api/radar/creative/drafts/${encodeURIComponent(draftId)}/assets${query}`;

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
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 75_000);
  const abortRequest = () => controller.abort();
  init.signal?.addEventListener("abort", abortRequest, { once: true });

  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: { ...init.headers, Authorization: `Bearer ${secret.trim()}` },
    });
    const payload = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
    if (!response.ok) throw new Error(payload?.error ?? `Request failed with ${response.status}`);
    return payload as T;
  } catch (error) {
    if (controller.signal.aborted && !init.signal?.aborted) {
      throw new Error("The request took too long. Check the AI provider and try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    init.signal?.removeEventListener("abort", abortRequest);
  }
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
