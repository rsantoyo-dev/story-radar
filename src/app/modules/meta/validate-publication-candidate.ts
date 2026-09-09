import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  publishingAccessIsCurrent,
  publishingIdentity,
  type PublishingAccess,
} from "./instagram-publishing-access";
import type { CreativeAssetBatch, CreativeDraft } from "../stories/creative-content.types";
import {
  destinationBlockers,
  editorialCandidateBlockers,
  publicationSnapshotHash,
  publishingAccessBlockers,
  type PublicationCandidate,
  type PublicationDestination,
} from "./instagram-publication-candidate";

export type CandidateInputs = {
  topicId: string;
  draft: CreativeDraft;
  batch: CreativeAssetBatch;
  sourceToken: string;
  destination: PublicationDestination;
};
export type CandidateDependencies = {
  load: () => Promise<CandidateInputs>;
  apiVersion?: string;
  checkDestination?: (inputs: CandidateInputs) => Promise<PublishingAccess>;
  readApprovedImage: (inputs: CandidateInputs, assetId: string) => Promise<File>;
  /**
   * PUB-02: the explicit, server-side live check of this connection's ability
   * to publish. Omitted → the candidate stays blocked as capability-unverified.
   */
  verifyPublishingAccess?: () => Promise<PublishingAccess>;
};

/** Read-only evaluation. This snapshot is not a persisted delivery authorization. */
export async function validatePublicationCandidate(deps: CandidateDependencies): Promise<PublicationCandidate> {
  const input = await deps.load();
  const { draft, batch, destination } = input;
  const initialHash = publicationSnapshotHash(input);
  const blockers = editorialCandidateBlockers(draft, batch, input.sourceToken);
  const files: Record<string, string> = {};
  if (!blockers.length) {
    // Bound memory to one decoded image; never invoke an image generator.
    for (const asset of batch.assets) {
      try {
        const file = await deps.readApprovedImage(input, asset.id);
        const bytes = Buffer.from(await file.arrayBuffer());
        const metadata = await sharp(bytes, { limitInputPixels: 20_000_000 }).metadata();
        if (metadata.width !== 1080 || metadata.height !== 1350 || (metadata.pages ?? 1) !== 1 || !["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.orientation !== undefined && metadata.orientation !== 1)) {
          blockers.push({ code: "image-format", message: `Image ${asset.unitOrder} must be a static 1080×1350 image with its approved orientation.`, assetId: asset.id });
        } else {
          files[asset.id] = createHash("sha256").update(bytes).digest("hex");
        }
      } catch {
        // Provider errors may contain credentials or signed URLs. Never echo them.
        blockers.push({ code: "image-validation", message: `Image ${asset.unitOrder} could not be validated. Check its file, current evidence, policy and usage permissions.`, assetId: asset.id });
      }
    }
  }
  // PUB-02: the explicit, server-side live capability check. A stored scope
  // never authorizes an envío — only Instagram accepting the read-only quota
  // check for this exact connection clears the last blocker. Browser-supplied
  // evidence is not trusted; this runs on the server for every validation.
  let publishingAccess: PublishingAccess | undefined;
  let accessCheckFailed = false;
  if (deps.checkDestination) {
    try { publishingAccess = await deps.checkDestination(input); }
    catch { accessCheckFailed = true; /* fail closed below, no provider errors */ }
  } else if (deps.verifyPublishingAccess) {
    try { publishingAccess = await deps.verifyPublishingAccess(); }
    catch { accessCheckFailed = true; }
  }

  try {
    if (publicationSnapshotHash(await deps.load()) !== initialHash) blockers.push({ code: "snapshot-changed", message: "The script, images, approval, policy or destination changed during validation. Validate again." });
  } catch {
    blockers.push({ code: "snapshot-changed", message: "The approved set is no longer available. Refresh and validate again." });
  }

  const editorialReady = blockers.length === 0;

  if (publishingAccess) {
    const current =
      !deps.apiVersion ||
      publishingAccessIsCurrent(
        publishingAccess,
        publishingIdentity(input.topicId, destination),
        deps.apiVersion,
      );
    if (!current) {
      blockers.push({
        code: publishingAccess.state === "enabled" ? "publishing-verification-stale" : `publishing-access-${publishingAccess.state}`,
        message: publishingAccess.state === "enabled"
          ? "The publishing verification no longer matches this account or has expired. Validate again."
          : publishingAccess.message,
      });
    } else {
      blockers.push(...publishingAccessBlockers(publishingAccess));
    }
  } else if (accessCheckFailed) {
    blockers.push({
      code: "publishing-access-unavailable",
      message: "Publishing access could not be verified. Try again; no content was sent.",
    });
  } else {
    blockers.push(...destinationBlockers(destination));
  }

  return {
    state: editorialReady ? (blockers.length ? "candidate" : "ready") : "not-candidate",
    checkedAt: new Date().toISOString(),
    ...(publishingAccess ? { publishingAccess } : {}),
    snapshotHash: publicationSnapshotHash({ input, files }),
    draftId: draft.id, draftVersion: draft.version, batchId: batch.id,
    caption: draft.caption, hashtags: [...draft.hashtags],
    destination: { igUserId: destination.igUserId, igUsername: destination.igUsername },
    assets: [...batch.assets].sort((a, b) => a.unitOrder - b.unitOrder).map(a => ({ id: a.id, version: a.version, order: a.unitOrder, ...(files[a.id] ? { sha256: files[a.id] } : {}) })),
    blockers,
  };
}
