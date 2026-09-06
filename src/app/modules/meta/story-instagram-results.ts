import "server-only";

import { findCreativeDraftsForStory } from "@/app/modules/stories/creative-content.repository";

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

  const hasLinkedDraft = items.some((item) => item.linkedDraftId);
  const draftsById = new Map<
    string,
    { format: string; status: string; version: number }
  >();
  if (hasLinkedDraft) {
    for (const draft of await findCreativeDraftsForStory(topicId, storyId)) {
      draftsById.set(draft.id, {
        format: draft.format,
        status: draft.status,
        version: draft.version,
      });
    }
  }

  const posts: StoryInstagramPost[] = items.map((item) => {
    const draft = item.linkedDraftId
      ? draftsById.get(item.linkedDraftId)
      : undefined;
    return {
      ...item,
      creativeVersion:
        item.linkedDraftId && draft
          ? {
              draftId: item.linkedDraftId,
              draftVersion: item.linkedDraftVersion,
              batchId: item.linkedBatchId,
              status: draft.status,
              label: instagramCreativeVersionLabel({
                format: draft.format,
                status: draft.status,
                version: item.linkedDraftVersion ?? draft.version,
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
