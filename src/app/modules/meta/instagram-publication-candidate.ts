import type { PublishingAccess } from "./instagram-publishing-access";
import { createHash } from "node:crypto";
import type { CreativeAssetBatch, CreativeDraft } from "../stories/creative-content.types";
import { documentarySnapshot, DOCUMENTARY_PROVIDER, eligiblePhoto } from "../stories/creative-documentary";
import { imageTextNeedsUpdate } from "../stories/creative-image-text-sync";

export type PublicationBlocker = { code: string; message: string; assetId?: string };
export type PublicationDestination = {
  igUserId: string | null;
  igUsername: string | null;
  connectionVersion: string;
  connected: boolean;
  expired: boolean;
  /** False when OAuth supplied no usable scope list; absence is not a denial. */
  grantedPermissionsKnown?: boolean;
  hasPublishingPermission: boolean;
  hasBasicPermission?: boolean;
  appConfigurationVersion?: string;
};
export type PublicationCandidate = {
  state: "not-candidate" | "candidate" | "ready";
  checkedAt: string;
  snapshotHash: string;
  draftId: string;
  draftVersion: number;
  batchId: string;
  caption: string;
  hashtags: string[];
  destination: { igUserId: string | null; igUsername: string | null };
  assets: { id: string; version: number; order: number; sha256?: string }[];
  blockers: PublicationBlocker[];
  /** PUB-02: the live publishing-access preflight, present when it was run. */
  publishingAccess?: PublishingAccess;
};

/** Stable identities include full server snapshots, never serialized secrets. */
export function publicationSnapshotHash(value: unknown): string {
  function canonical(input: unknown): unknown {
    if (input instanceof Date) return input.toISOString();
    if (Array.isArray(input)) return input.map(canonical);
    if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
    return input;
  }
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export function editorialCandidateBlockers(draft: CreativeDraft, batch: CreativeAssetBatch, sourceToken: string, now = Date.now()): PublicationBlocker[] {
  const blockers: PublicationBlocker[] = [];
  const add = (code: string, message: string, assetId?: string) => blockers.push({ code, message, ...(assetId ? { assetId } : {}) });
  if (draft.status !== "approved" || !draft.approvedAt) add("draft-approval", "Approve the current script before preparing a publication.");
  if (draft.inputIsCurrent === false) add("stale-input", "The source, creative inputs or policy changed. Prepare and approve a current draft.");
  if (batch.draftId !== draft.id || batch.draftVersion !== draft.version || batch.status === "stale") add("stale-batch", "The image batch belongs to an earlier revision. Review the current images.");
  if (batch.status !== "completed") add("incomplete-batch", "Wait for every image to complete.");
  if (!draft.units.length || batch.assets.length !== draft.units.length || batch.totalAssets !== draft.units.length || new Set(batch.assets.map(a => a.unitOrder)).size !== draft.units.length || batch.assets.some(a => !draft.units.some(u => u.order === a.unitOrder))) add("incomplete-selection", "Select exactly one current image for every script unit.");
  if (!["meme", "carousel", "sequence"].includes(draft.format) || draft.outputAspectRatio !== "4:5" || batch.outputAspectRatio !== "4:5") add("unsupported-format", "Publishing candidates require a 4:5 photo or image carousel.");
  for (const asset of batch.assets) {
    if (asset.status !== "approved" || !asset.approvedAt) add("image-approval", `Approve image ${asset.unitOrder}.`, asset.id);
    if (!asset.imageUrl) add("missing-image", `Image ${asset.unitOrder} has no accessible file.`, asset.id);
    const unit = draft.units.find(u => u.order === asset.unitOrder);
    if (!unit || imageTextNeedsUpdate(asset.unitSnapshot, unit)) add("image-text-changed", `Image ${asset.unitOrder} no longer matches the saved script.`, asset.id);
    if (batch.provider === DOCUMENTARY_PROVIDER) {
      const evidence = documentarySnapshot(asset.unitSnapshot);
      if (!evidence || evidence.review?.decision !== "approved" || !evidence.review.actor?.trim() || !Number.isFinite(Date.parse(evidence.review.at))) add("documentary-final-approval", "Documentary content requires its joint final review of script and images.", asset.id);
      if (!evidence || evidence.sourceToken !== sourceToken || evidence.representation === "blocked") add("documentary-stale", "Documentary evidence or policy changed. Prepare and review a new version.", asset.id);
      if (evidence?.photo && (!evidence.places[0] || !eligiblePhoto(evidence.photo, evidence.places[0], now))) add("usage-rights", "Photograph evidence or usage permission is no longer current.", asset.id);
    }
  }
  return blockers;
}

export function destinationBlockers(destination: PublicationDestination): PublicationBlocker[] {
  if (!destination.connected || !destination.igUserId) return [{ code: "destination-disconnected", message: "Connect an Instagram account for this topic." }];
  if (destination.expired) return [{ code: "destination-reconnect", message: "Reconnect the Instagram account before publishing." }];
  if (destination.grantedPermissionsKnown !== false && !destination.hasPublishingPermission) return [{ code: "publishing-permission", message: "The connection has no recorded publishing permission. Insights access does not authorize publishing." }];
  // A stored scope alone is insufficient; the server performs the live check.
  return [{ code: "publishing-capability-unverified", message: "Verify publishing access for the connected Instagram account." }];
}

/**
 * PUB-02: translate the live publishing-access preflight into candidate
 * blockers. `enabled` means Instagram accepted the read-only quota check for
 * this exact connection; anything else keeps the set editorially ready but out
 * of "ready to publish", with a reason.
 */
export function publishingAccessBlockers(access: {
  state: string;
  message: string;
}): PublicationBlocker[] {
  if (access.state === "enabled") return [];
  return [{ code: `publishing-access-${access.state}`, message: access.message }];
}
