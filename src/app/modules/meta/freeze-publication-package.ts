import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  instagramDeliveryFiles,
  instagramPublicationPackages,
} from "@/db/schema";

import { findCreativeDraftById } from "../stories/creative-content.repository";
import { findCreativeAssetBatchById } from "../stories/creative-assets.repository";
import { DOCUMENTARY_PROVIDER } from "../stories/creative-documentary";
import { documentaryImage } from "../stories/manage-creative-documentary";
import { downloadApprovedCreativeImage } from "../stories/manage-creative-assets";
import {
  CreativeContentConflictError,
  CreativeContentNotFoundError,
} from "../stories/manage-creative-content";
import {
  buildPublicationDeliveryObjectKey,
  deletePrivateR2Object,
  putPrivateR2Object,
} from "../stories/r2-storage";

import { getPublicationCandidate } from "./get-publication-candidate";
import { getPublicationDestination } from "./topic-meta-connections.repository";
import {
  runFreezePublicationPackage,
  type FrozenPackage,
  type PersistDeliveryFile,
  type PersistPackage,
} from "./freeze-publication-package.core";
import type { PublicationMediaType } from "./instagram-publication-package";

export {
  PublicationPackageConflictError,
  type FrozenPackage,
  type FrozenPackageSlide,
} from "./freeze-publication-package.core";

function deliveryBaseUrl(): string {
  const url = process.env.RADAR_APP_URL?.trim().replace(/\/+$/u, "");
  if (!url) {
    throw new CreativeContentConflictError(
      "RADAR_APP_URL is not configured; delivery links cannot be built.",
    );
  }
  return url;
}

export async function freezePublicationPackage(
  topicId: string,
  draftId: string,
  batchId: string,
): Promise<FrozenPackage> {
  return runFreezePublicationPackage(topicId, draftId, {
    deliveryBaseUrl: deliveryBaseUrl(),
    loadCandidate: () => getPublicationCandidate(topicId, draftId, batchId),
    loadContext: async () => {
      const draft = await findCreativeDraftById(topicId, draftId);
      if (!draft) throw new CreativeContentNotFoundError("Draft not found");
      const [batch, destination] = await Promise.all([
        findCreativeAssetBatchById(batchId),
        getPublicationDestination(topicId),
      ]);
      if (!batch || batch.draftId !== draft.id) {
        throw new CreativeContentNotFoundError("Image batch not found for this draft");
      }
      return {
        storyId: draft.storyId,
        provider: batch.provider,
        connectionVersion: destination.connectionVersion,
        scriptSnapshot: {
          draftId: draft.id,
          version: draft.version,
          format: draft.format,
          outputAspectRatio: draft.outputAspectRatio,
          caption: draft.caption,
          hashtags: [...draft.hashtags],
          units: draft.units,
        },
        policySnapshot: {
          provider: batch.provider,
          visualFidelityOverride: draft.visualFidelityOverride ?? null,
        },
      };
    },
    findExisting: async (draft, hash) => {
      const [row] = await db
        .select()
        .from(instagramPublicationPackages)
        .where(
          and(
            eq(instagramPublicationPackages.draftId, draft),
            eq(instagramPublicationPackages.candidateSnapshotHash, hash),
            eq(instagramPublicationPackages.status, "frozen"),
          ),
        )
        .limit(1);
      if (!row) return undefined;
      const files = await db
        .select()
        .from(instagramDeliveryFiles)
        .where(eq(instagramDeliveryFiles.packageId, row.id));
      return mapFrozenPackage(row, files, deliveryBaseUrl());
    },
    readApprovedImage: (assetId, storyId, provider) =>
      provider === DOCUMENTARY_PROVIDER
        ? documentaryImage(topicId, storyId, assetId, false, true)
        : downloadApprovedCreativeImage(topicId, assetId),
    buildObjectKey: (packageId, unitOrder) =>
      buildPublicationDeliveryObjectKey({ topicId, packageId, unitOrder }),
    putObject: async (objectKey, body, contentType) => {
      await putPrivateR2Object({ objectKey, body, contentType });
    },
    removeObject: (objectKey) => deletePrivateR2Object(objectKey),
    persist: async (pkg, files) => {
      await db.batch([
        db
          .insert(instagramPublicationPackages)
          .values(pkg as typeof instagramPublicationPackages.$inferInsert),
        db
          .insert(instagramDeliveryFiles)
          .values(files as (typeof instagramDeliveryFiles.$inferInsert)[]),
      ]);
    },
  });
}

export async function listPublicationPackages(
  topicId: string,
  draftId: string,
): Promise<FrozenPackage[]> {
  const rows = await db
    .select()
    .from(instagramPublicationPackages)
    .where(
      and(
        eq(instagramPublicationPackages.topicId, topicId),
        eq(instagramPublicationPackages.draftId, draftId),
      ),
    );
  if (rows.length === 0) return [];

  const draft = await findCreativeDraftById(topicId, draftId);
  const base = deliveryBaseUrl();
  const out: FrozenPackage[] = [];
  for (const row of rows) {
    let status = row.status;
    if (status === "frozen" && draft && draft.version !== row.draftVersion) {
      await db
        .update(instagramPublicationPackages)
        .set({ status: "stale", updatedAt: new Date() })
        .where(eq(instagramPublicationPackages.id, row.id));
      status = "stale";
    }
    const files = await db
      .select()
      .from(instagramDeliveryFiles)
      .where(eq(instagramDeliveryFiles.packageId, row.id));
    out.push(mapFrozenPackage({ ...row, status }, files, base));
  }
  return out;
}

export async function discardPublicationPackage(
  topicId: string,
  packageId: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(instagramPublicationPackages)
    .where(
      and(
        eq(instagramPublicationPackages.id, packageId),
        eq(instagramPublicationPackages.topicId, topicId),
      ),
    )
    .limit(1);
  if (!row) throw new CreativeContentNotFoundError("Publication package not found");
  if (row.status === "consumed") {
    throw new CreativeContentConflictError(
      "This package was used for a publication and is kept as history.",
    );
  }
  const files = await db
    .select({ objectKey: instagramDeliveryFiles.objectKey })
    .from(instagramDeliveryFiles)
    .where(eq(instagramDeliveryFiles.packageId, packageId));
  await db
    .delete(instagramPublicationPackages)
    .where(eq(instagramPublicationPackages.id, packageId));
  await Promise.all(
    files.map((file) => deletePrivateR2Object(file.objectKey).catch(() => undefined)),
  );
}

export type DeliveryFileTarget = {
  objectKey: string;
  contentType: string;
  disposition: "ok" | "gone";
};

/**
 * Public delivery route resolution. `undefined` → the caller returns 404. A
 * stale package or an expired file resolves to `"gone"` (410). `consumed`
 * packages still serve until they expire so a publish retry (PUB-04) can
 * re-fetch.
 */
export async function resolveDeliveryFile(
  token: string,
  now: Date = new Date(),
): Promise<DeliveryFileTarget | undefined> {
  const [row] = await db
    .select({
      objectKey: instagramDeliveryFiles.objectKey,
      contentType: instagramDeliveryFiles.contentType,
      expiresAt: instagramDeliveryFiles.expiresAt,
      packageStatus: instagramPublicationPackages.status,
    })
    .from(instagramDeliveryFiles)
    .innerJoin(
      instagramPublicationPackages,
      eq(instagramPublicationPackages.id, instagramDeliveryFiles.packageId),
    )
    .where(eq(instagramDeliveryFiles.token, token))
    .limit(1);
  if (!row) return undefined;
  const gone =
    row.expiresAt.getTime() <= now.getTime() || row.packageStatus === "stale";
  return {
    objectKey: row.objectKey,
    contentType: row.contentType,
    disposition: gone ? "gone" : "ok",
  };
}

function mapFrozenPackage(
  row: typeof instagramPublicationPackages.$inferSelect,
  files: (typeof instagramDeliveryFiles.$inferSelect)[],
  base: string,
): FrozenPackage {
  const transforms = Array.isArray(row.transforms)
    ? (row.transforms as { unitOrder: number; transform: string }[])
    : [];
  return {
    id: row.id,
    status: row.status as FrozenPackage["status"],
    packageHash: row.packageHash,
    mediaType: row.mediaType as PublicationMediaType,
    caption: row.caption,
    hashtags: row.hashtags ?? [],
    destination: { igUserId: row.igUserId, igUsername: row.igUsername },
    publishingAccessPending: row.publishingAccessPending,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    slides: [...files]
      .sort((a, b) => a.unitOrder - b.unitOrder)
      .map((file) => ({
        unitOrder: file.unitOrder,
        assetVersion: file.assetVersion,
        sha256: file.sha256,
        width: file.width,
        height: file.height,
        byteSize: file.byteSize,
        transform:
          transforms.find((entry) => entry.unitOrder === file.unitOrder)?.transform ??
          "JPEG re-encode",
        deliveryUrl: `${base}/api/deliver/${file.token}`,
      })),
  };
}

/** Persistence shape re-exports for consumers that map rows themselves. */
export type { PersistPackage, PersistDeliveryFile };
