import type { PublishingAccess } from "./instagram-publishing-access";
import { destinationAccountId, publicationPlatformLabel, type PublicationChannel } from "./publication-channel";

export { destinationAccountId };
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
  /**
   * PUB-10. Absent on the direct Instagram connection, so its snapshot hashes
   * and identities stay exactly as they were before channels existed. Set for
   * the Facebook Page channels; `igUserId` is then the Page's linked Instagram
   * account (instagram-page) or null (facebook-page).
   */
  channel?: Exclude<PublicationChannel, "instagram-direct">;
  pageId?: string | null;
  pageName?: string | null;
};

/**
 * PUB-13 groundwork: one destination contract that both the direct Instagram
 * connection and a Facebook Page connection (PUB-09) can populate, so PUB-10
 * can resolve a delivery against either without reshaping the Instagram
 * pipeline. The existing publish path keeps using PublicationDestination
 * (the Instagram-direct shape) unchanged; nothing publishes to Facebook yet.
 */
export type InstagramDirectDestination = { platform: "instagram-direct" } & PublicationDestination;
export type FacebookPageDestination = {
  platform: "facebook-page";
  pageId: string | null;
  pageName: string | null;
  /** Set when the Page has a linked Instagram Business Account. */
  linkedIgUserId: string | null;
  connectionVersion: string;
  connected: boolean;
  expired: boolean;
  /** Page tasks include CREATE_CONTENT or MANAGE — granted, not live-verified. */
  hasPublishingTask: boolean;
  appConfigurationVersion?: string;
};
export type ChannelDestination = InstagramDirectDestination | FacebookPageDestination;

export type PublicationCandidate = {
  state: "not-candidate" | "candidate" | "ready";
  checkedAt: string;
  snapshotHash: string;
  draftId: string;
  draftVersion: number;
  batchId: string;
  caption: string;
  hashtags: string[];
  destination: CandidateDestinationSummary;
  assets: { id: string; version: number; order: number; sha256?: string }[];
  blockers: PublicationBlocker[];
  /** PUB-02: the live publishing-access preflight, present when it was run. */
  publishingAccess?: PublishingAccess;
};

/** Browser-safe destination summary. The channel fields are absent for direct Instagram. */
export type CandidateDestinationSummary = {
  igUserId: string | null;
  igUsername: string | null;
  channel?: Exclude<PublicationChannel, "instagram-direct">;
  pageId?: string | null;
  pageName?: string | null;
};

export function candidateDestinationSummary(destination: PublicationDestination): CandidateDestinationSummary {
  return {
    igUserId: destination.igUserId,
    igUsername: destination.igUsername,
    ...(destination.channel ? { channel: destination.channel, pageId: destination.pageId ?? null, pageName: destination.pageName ?? null } : {}),
  };
}

/**
 * Photo credits live in the caption, never drawn on the images: one line per
 * distinct credit, skipped when the editor already wrote it in the caption.
 */
export function captionWithPhotoCredits(caption: string, credits: readonly string[]): string {
  const lines = [...new Set(credits.map((credit) => credit.trim()).filter(Boolean))]
    .filter((credit) => !caption.includes(credit));
  return lines.length ? `${caption.trimEnd()}\n\n${lines.join("\n")}` : caption;
}

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
  if (destination.channel === "instagram-page" && destination.connected && !destination.igUserId) {
    return [{ code: "destination-disconnected", message: "The connected Facebook Page has no linked Instagram account. Link one in Meta, then verify the Page again." }];
  }
  if (!destination.connected || !destinationAccountId(destination)) {
    return [{ code: "destination-disconnected", message: destination.channel ? "Connect a Facebook Page for this topic." : "Connect an Instagram account for this topic." }];
  }
  if (destination.expired) return [{ code: "destination-reconnect", message: destination.channel ? "Reconnect the Facebook Page before publishing." : "Reconnect the Instagram account before publishing." }];
  if (destination.grantedPermissionsKnown !== false && !destination.hasPublishingPermission) return [{ code: "publishing-permission", message: "The connection has no recorded publishing permission. Insights access does not authorize publishing." }];
  // A stored scope alone is insufficient; the server performs the live check.
  return [{ code: "publishing-capability-unverified", message: `Verify publishing access for the connected ${destination.channel ? publicationPlatformLabel(destination.channel) : "Instagram"} account.` }];
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
