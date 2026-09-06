import "server-only";

import { findCreativeAssetBatchById } from "@/app/modules/stories/creative-assets.repository";
import { findCreativeDraftById } from "@/app/modules/stories/creative-content.repository";

import { instagramCreativeVersionLabel } from "./instagram-creative-version-label";
import type { MetaConnectionState } from "./meta-connection.types";
import {
  getConnectedInstagramAccount,
  getTopicMetaConnectionStatus,
} from "./topic-meta-connections.repository";
import {
  listStoryInstagramPosts,
  type InstagramMediaListItem,
} from "./topic-instagram-media.repository";

export type StoryInstagramCreativeVersion = {
  draftId: string;
  draftVersion: number | null;
  batchId: string | null;
  status: string;
  label: string;
};

export type StoryInstagramPost = InstagramMediaListItem & {
  /** null → "Versión no identificada" (no linked draft, or it was deleted). */
  creativeVersion: StoryInstagramCreativeVersion | null;
};

export type StoryInstagramResults = {
  connectionState: MetaConnectionState;
  account: { igUsername: string | null } | null;
  posts: StoryInstagramPost[];
};

export { instagramCreativeVersionLabel } from "./instagram-creative-version-label";

/**
 * Everything the story-side "Instagram results" panel (IG-06) needs: the topic's
 * connection state + account (for the empty-state), and every publication linked
 * to this story with its resolved creative-version label. Read-only.
 */
export async function getStoryInstagramResults(
  topicId: string,
  storyId: string,
): Promise<StoryInstagramResults> {
  const [status, account, items] = await Promise.all([
    getTopicMetaConnectionStatus(topicId),
    getConnectedInstagramAccount(topicId),
    listStoryInstagramPosts(topicId, storyId),
  ]);

  const draftsById = new Map<string, { format: string }>();
  const draftIds = new Set(items.flatMap(item => item.linkedDraftId ? [item.linkedDraftId] : []));
  // The workspace list excludes documentary drafts; resolve linked IDs directly.
  for (const id of draftIds) {
    const draft = await findCreativeDraftById(topicId, id);
    if (draft?.storyId === storyId) draftsById.set(id, { format: draft.format });
  }

  const posts: StoryInstagramPost[] = items.map((item) => {
    const draft = item.linkedDraftId
      ? draftsById.get(item.linkedDraftId)
      : undefined;
    return {
      ...item,
      creativeVersion:
        item.linkedDraftId && draft && item.linkedDraftVersion != null
          ? {
              draftId: item.linkedDraftId,
              draftVersion: item.linkedDraftVersion,
              batchId: item.linkedBatchId,
              status: "historical",
              label: instagramCreativeVersionLabel({
                format: draft.format,
                status: "historical",
                version: item.linkedDraftVersion,
              }),
            }
          : null,
    };
  });

  return {
    connectionState: status.state,
    account: account ? { igUsername: account.igUsername } : null,
    posts,
  };
}


export type StoryInstagramVersion = {
  draftVersion: number | null;
  batchId: string | null;
  unavailable?: string;
  units: { order: number; headline: string; body: string; imageUrl?: string }[];
};

/** Resolve only the version attached to a post in this topic and story. */
export async function getStoryInstagramVersion(topicId: string, storyId: string, externalId: string): Promise<StoryInstagramVersion> {
  const post = (await listStoryInstagramPosts(topicId, storyId)).find(item => item.externalId === externalId);
  const result: StoryInstagramVersion = { draftVersion: post?.linkedDraftVersion ?? null, batchId: post?.linkedBatchId ?? null, units: [] };
  if (!post?.linkedDraftId || post.linkedDraftVersion == null) return { ...result, unavailable: "The linked version is not identified." };
  const draft = await findCreativeDraftById(topicId, post.linkedDraftId);
  if (!draft || draft.storyId !== storyId) return { ...result, unavailable: "The linked draft is no longer available." };
  if (post.linkedBatchId) {
    const batch = await findCreativeAssetBatchById(post.linkedBatchId);
    if (!batch || batch.draftId !== draft.id || batch.draftVersion !== post.linkedDraftVersion) return { ...result, unavailable: "The exact linked image batch is unavailable." };
    return { ...result, units: batch.assets.map(asset => ({ order: asset.unitOrder, headline: asset.unitSnapshot.headline, body: asset.unitSnapshot.body || "", imageUrl: asset.imageUrl })) };
  }
  if (draft.version !== post.linkedDraftVersion) return { ...result, unavailable: "This draft revision has no preserved content snapshot. The current draft has a different version." };
  return { ...result, units: draft.units.map(unit => ({ order: unit.order, headline: unit.headline, body: unit.body || "" })) };
}
