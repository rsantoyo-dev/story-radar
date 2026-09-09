/**
 * PUB-03 orchestration, pure of I/O via injected dependencies so it can be
 * unit-tested. It freezes a PUB-01 "ready" candidate into an immutable,
 * delivery-ready package: exact caption, slide order, asset versions and file
 * hashes, plus one re-encoded JPEG per slide. It never publishes or schedules.
 */

import { createHash, randomUUID } from "node:crypto";

import sharp from "sharp";

import type { PublicationBlocker, PublicationCandidate } from "./instagram-publication-candidate";
import {
  assertPublishableImage,
  computePackageHash,
  describeImageTransform,
  newDeliveryToken,
  PublicationPackageValidationError,
  resolvePublicationMediaType,
  type PublicationMediaType,
} from "./instagram-publication-package";

export const JPEG_QUALITY = 90;
export const DEFAULT_TTL_HOURS = 24;

export class PublicationPackageConflictError extends Error {
  constructor(
    message: string,
    readonly blockers: PublicationBlocker[] = [],
  ) {
    super(message);
  }
}

export type FrozenPackageSlide = {
  unitOrder: number;
  assetVersion: number;
  sha256: string;
  width: number;
  height: number;
  byteSize: number;
  transform: string;
  deliveryUrl: string;
};

export type FrozenPackage = {
  id: string;
  status: "frozen" | "stale" | "consumed";
  packageHash: string;
  mediaType: PublicationMediaType;
  caption: string;
  hashtags: string[];
  destination: { igUserId: string | null; igUsername: string | null };
  /** Frozen before the live publishing-access check passed; PUB-04 re-verifies. */
  publishingAccessPending: boolean;
  expiresAt: string;
  createdAt: string;
  slides: FrozenPackageSlide[];
};

export type PersistPackage = {
  id: string;
  topicId: string;
  storyId: string;
  draftId: string;
  draftVersion: number;
  batchId: string;
  candidateSnapshotHash: string;
  packageHash: string;
  mediaType: PublicationMediaType;
  caption: string;
  hashtags: string[];
  igUserId: string | null;
  igUsername: string | null;
  connectionVersion: string;
  scriptSnapshot: unknown;
  policySnapshot: unknown;
  transforms: { unitOrder: number; transform: string }[];
  status: "frozen";
  publishingAccessPending: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type PersistDeliveryFile = {
  packageId: string;
  unitOrder: number;
  assetVersion: number;
  token: string;
  objectKey: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  sourceSha256: string;
  width: number;
  height: number;
  expiresAt: Date;
  createdAt: Date;
};

export type FreezeDependencies = {
  loadCandidate: () => Promise<PublicationCandidate>;
  loadContext: () => Promise<{
    storyId: string;
    provider: string;
    connectionVersion: string;
    scriptSnapshot: unknown;
    policySnapshot: unknown;
  }>;
  findExisting: (
    draftId: string,
    candidateSnapshotHash: string,
  ) => Promise<FrozenPackage | undefined>;
  readApprovedImage: (assetId: string, storyId: string, provider: string) => Promise<File>;
  buildObjectKey: (packageId: string, unitOrder: number) => string;
  putObject: (objectKey: string, bytes: Uint8Array, contentType: string) => Promise<void>;
  removeObject: (objectKey: string) => Promise<void>;
  persist: (pkg: PersistPackage, files: PersistDeliveryFile[]) => Promise<void>;
  deliveryBaseUrl: string;
  ttlHours?: number;
  now?: () => Date;
};

/** Blockers that only concern the live account capability, not the approved set. */
export function isPublishingAccessBlocker(code: string): boolean {
  return (
    code.startsWith("publishing-access-") ||
    code === "publishing-capability-unverified" ||
    code === "publishing-verification-stale" ||
    code === "publishing-permission" ||
    code === "destination-disconnected" ||
    code === "destination-reconnect"
  );
}

export async function runFreezePublicationPackage(
  topicId: string,
  draftId: string,
  deps: FreezeDependencies,
): Promise<FrozenPackage> {
  const now = deps.now ?? (() => new Date());
  const ttlHours = deps.ttlHours ?? DEFAULT_TTL_HOURS;

  const candidate = await deps.loadCandidate();
  // The approved set must be complete. Missing/unverified publishing access does
  // not block *preparing* the deliverable — PUB-04 re-checks capability at
  // publish time — but any editorial/policy/file blocker does.
  const editorialBlockers = candidate.blockers.filter(
    (blocker) => !isPublishingAccessBlocker(blocker.code),
  );
  if (candidate.state === "not-candidate" || editorialBlockers.length > 0) {
    throw new PublicationPackageConflictError(
      "The approved set is not ready to prepare for publication yet.",
      editorialBlockers.length > 0 ? editorialBlockers : candidate.blockers,
    );
  }
  const pendingPublishingAccess = candidate.state !== "ready";

  const existing = await deps.findExisting(draftId, candidate.snapshotHash);
  if (existing) return existing;

  const context = await deps.loadContext();
  const orderedAssets = [...candidate.assets].sort((a, b) => a.order - b.order);

  const packageId = randomUUID();
  const timestamp = now();
  const expiresAt = new Date(timestamp.getTime() + ttlHours * 60 * 60 * 1_000);

  const deliverySlides: {
    unitOrder: number;
    assetVersion: number;
    objectKey: string;
    token: string;
    jpeg: Uint8Array;
    sha256: string;
    sourceSha256: string;
    width: number;
    height: number;
    transform: string;
  }[] = [];

  for (const asset of orderedAssets) {
    const file = await deps.readApprovedImage(asset.id, context.storyId, context.provider);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const metadata = await sharp(bytes, { limitInputPixels: 20_000_000 }).metadata();
    const sourceFormat = metadata.format ?? "";
    const staticImage = (metadata.pages ?? 1) === 1;
    const uprightOrientation = metadata.orientation === undefined || metadata.orientation === 1;
    if (metadata.width !== 1080 || metadata.height !== 1350 || !staticImage || !uprightOrientation) {
      throw new PublicationPackageValidationError(
        `Image ${asset.order}: ${describeImageTransform({ sourceFormat, resized: true, quality: JPEG_QUALITY })}`,
      );
    }
    const jpeg = new Uint8Array(
      await sharp(bytes).jpeg({ quality: JPEG_QUALITY, chromaSubsampling: "4:4:4" }).toBuffer(),
    );
    assertPublishableImage({ width: 1080, height: 1350, byteSize: jpeg.byteLength, format: "jpeg" });
    deliverySlides.push({
      unitOrder: asset.order,
      assetVersion: asset.version,
      objectKey: deps.buildObjectKey(packageId, asset.order),
      token: newDeliveryToken(),
      jpeg,
      sha256: createHash("sha256").update(jpeg).digest("hex"),
      sourceSha256: createHash("sha256").update(bytes).digest("hex"),
      width: 1080,
      height: 1350,
      transform: describeImageTransform({ sourceFormat, resized: false, quality: JPEG_QUALITY }),
    });
  }

  const mediaType = resolvePublicationMediaType(deliverySlides.length);
  const packageHash = computePackageHash({
    caption: candidate.caption,
    hashtags: candidate.hashtags,
    orderedSlideSha256: deliverySlides.map((slide) => slide.sha256),
    igUserId: candidate.destination.igUserId,
    connectionVersion: context.connectionVersion,
  });

  const stored: string[] = [];
  try {
    for (const slide of deliverySlides) {
      await deps.putObject(slide.objectKey, slide.jpeg, "image/jpeg");
      stored.push(slide.objectKey);
    }
    await deps.persist(
      {
        id: packageId,
        topicId,
        storyId: context.storyId,
        draftId,
        draftVersion: candidate.draftVersion,
        batchId: candidate.batchId,
        candidateSnapshotHash: candidate.snapshotHash,
        packageHash,
        mediaType,
        caption: candidate.caption,
        hashtags: [...candidate.hashtags],
        igUserId: candidate.destination.igUserId,
        igUsername: candidate.destination.igUsername,
        connectionVersion: context.connectionVersion,
        scriptSnapshot: context.scriptSnapshot,
        policySnapshot: context.policySnapshot,
        transforms: deliverySlides.map((slide) => ({
          unitOrder: slide.unitOrder,
          transform: slide.transform,
        })),
        status: "frozen",
        publishingAccessPending: pendingPublishingAccess,
        expiresAt,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      deliverySlides.map((slide) => ({
        packageId,
        unitOrder: slide.unitOrder,
        assetVersion: slide.assetVersion,
        token: slide.token,
        objectKey: slide.objectKey,
        contentType: "image/jpeg",
        byteSize: slide.jpeg.byteLength,
        sha256: slide.sha256,
        sourceSha256: slide.sourceSha256,
        width: slide.width,
        height: slide.height,
        expiresAt,
        createdAt: timestamp,
      })),
    );
  } catch (error) {
    await Promise.all(stored.map((key) => deps.removeObject(key).catch(() => undefined)));
    throw error;
  }

  return {
    id: packageId,
    status: "frozen",
    packageHash,
    mediaType,
    caption: candidate.caption,
    hashtags: [...candidate.hashtags],
    destination: {
      igUserId: candidate.destination.igUserId,
      igUsername: candidate.destination.igUsername,
    },
    publishingAccessPending: pendingPublishingAccess,
    expiresAt: expiresAt.toISOString(),
    createdAt: timestamp.toISOString(),
    slides: deliverySlides.map((slide) => ({
      unitOrder: slide.unitOrder,
      assetVersion: slide.assetVersion,
      sha256: slide.sha256,
      width: slide.width,
      height: slide.height,
      byteSize: slide.jpeg.byteLength,
      transform: slide.transform,
      deliveryUrl: `${deps.deliveryBaseUrl}/api/deliver/${slide.token}`,
    })),
  };
}
