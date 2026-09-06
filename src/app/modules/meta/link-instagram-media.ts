import "server-only";

import {
  listCreativeAssetBatchSummariesForDraft,
  type CreativeAssetBatchSummary,
} from "@/app/modules/stories/creative-assets.repository";
import { findCreativeDraftById } from "@/app/modules/stories/creative-content.repository";
import { findCreativeDraftsForStory } from "@/app/modules/stories/creative-content.repository";
import {
  listApprovedTopicStoriesBrief,
  type ApprovedTopicStoryBrief,
} from "@/app/modules/stories/list-approved-topic-stories";
import {
  getSelectedStoryContent,
  SelectedStoryContentNotFoundError,
} from "@/app/modules/stories/story-content.repository";

import { getConnectedInstagramAccount } from "./topic-meta-connections.repository";
import {
  findApprovedStoryMatchForPermalink,
  getTopicInstagramMediaListItem,
  setInstagramMediaStoryLink,
  type InstagramMediaListItem,
} from "./topic-instagram-media.repository";

export class InstagramMediaLinkError extends Error {}

export type InstagramMediaLinkInput = {
  externalId: string;
  /** null clears the link; a string links (or corrects) it. */
  storyId: string | null;
  draftId?: string | null;
  batchId?: string | null;
  by?: string | null;
};

export type InstagramMediaLinkDraftOption = {
  id: string;
  format: string;
  status: string;
  version: number;
};

export type InstagramMediaLinkOptions = {
  stories: ApprovedTopicStoryBrief[];
  suggestion?: { storyId: string; storyTitle: string };
};

/**
 * Links, corrects or removes the editorial-story link on one imported
 * publication (IG-04). Belonging is enforced here, not by a DB check:
 * - the story must be approved in this topic,
 * - a draft (optional) must belong to that story,
 * - a batch (optional) requires a draft and must belong to it.
 * Linking never approves a draft or its images.
 */
export async function linkInstagramMediaToStory(
  topicId: string,
  input: InstagramMediaLinkInput,
): Promise<InstagramMediaListItem> {
  const externalId = input.externalId.trim();
  if (!externalId) {
    throw new InstagramMediaLinkError("A publication id is required");
  }

  const account = await getConnectedInstagramAccount(topicId);
  if (!account) {
    throw new InstagramMediaLinkError(
      "This topic has no connected Instagram account",
    );
  }

  const by = normalizeActor(input.by);

  if (input.storyId === null) {
    const item = await setInstagramMediaStoryLink({
      topicId,
      igUserId: account.igUserId,
      externalId,
      link: { storyId: null, by },
    });
    if (!item) throw new InstagramMediaLinkError("Publication not found");
    return item;
  }

  const storyId = input.storyId.trim();
  if (!storyId) {
    throw new InstagramMediaLinkError("A story id is required");
  }

  // Approved-in-topic guard (throws SelectedStoryContentNotFoundError otherwise).
  await getSelectedStoryContent(topicId, storyId);

  const draftId = input.draftId?.trim() || null;
  const batchId = input.batchId?.trim() || null;

  if (batchId && !draftId) {
    throw new InstagramMediaLinkError(
      "Selecting an image batch also needs its draft",
    );
  }

  // Snapshot the published draft revision. A draft's `version` is an in-place
  // counter, so without this a later edit of the same draft would move the
  // publication's reference onto newer content.
  let draftVersion: number | null = null;

  if (draftId) {
    const draft = await findCreativeDraftById(topicId, draftId);
    if (!draft || draft.storyId !== storyId) {
      throw new InstagramMediaLinkError(
        "That draft does not belong to the selected story",
      );
    }

    if (batchId) {
      // A batch pins the exact revision it was generated against.
      const batches = await listCreativeAssetBatchSummariesForDraft(draftId);
      const batch = batches.find((entry) => entry.id === batchId);
      if (!batch) {
        throw new InstagramMediaLinkError(
          "That image batch does not belong to the selected draft",
        );
      }
      draftVersion = batch.draftVersion;
    } else {
      // No batch: keep the version already linked when the selection
      // (story + draft + no batch) is unchanged — re-saving the same link must
      // not follow a later in-place draft edit. Snapshot the current version
      // only when the draft is being selected or changed.
      const current = await getTopicInstagramMediaListItem(
        topicId,
        account.igUserId,
        externalId,
      );
      const unchanged =
        current !== undefined &&
        current.linkedStoryId === storyId &&
        current.linkedDraftId === draftId &&
        current.linkedBatchId === null &&
        current.linkedDraftVersion !== null;
      draftVersion = unchanged
        ? current.linkedDraftVersion
        : draft.version;
    }
  }

  const item = await setInstagramMediaStoryLink({
    topicId,
    igUserId: account.igUserId,
    externalId,
    link: { storyId, draftId, draftVersion, batchId, by },
  });
  if (!item) throw new InstagramMediaLinkError("Publication not found");
  return item;
}

/** Approved stories + the URL-match suggestion for one publication's dialog. */
export async function getInstagramMediaLinkOptions(
  topicId: string,
  externalId: string,
): Promise<InstagramMediaLinkOptions> {
  const [stories, suggestion] = await Promise.all([
    listApprovedTopicStoriesBrief(topicId),
    suggestInstagramMediaStory(topicId, externalId),
  ]);
  return suggestion ? { stories, suggestion } : { stories };
}

/** Drafts belonging to a story, shaped for the link dialog's draft picker. */
export async function listInstagramMediaLinkDrafts(
  topicId: string,
  storyId: string,
): Promise<InstagramMediaLinkDraftOption[]> {
  const drafts = await findCreativeDraftsForStory(topicId, storyId);
  return drafts.map((draft) => ({
    id: draft.id,
    format: draft.format,
    status: draft.status,
    version: draft.version,
  }));
}

/** Image batches of a draft (validated to be in this topic) for the picker. */
export async function listInstagramMediaLinkBatches(
  topicId: string,
  draftId: string,
): Promise<CreativeAssetBatchSummary[]> {
  const draft = await findCreativeDraftById(topicId, draftId);
  if (!draft) {
    throw new InstagramMediaLinkError("Draft not found");
  }
  return listCreativeAssetBatchSummariesForDraft(draftId);
}

/**
 * The single approved story whose registered Instagram URL matches this
 * publication's permalink, or null when there is none or it is ambiguous.
 */
export async function suggestInstagramMediaStory(
  topicId: string,
  externalId: string,
): Promise<{ storyId: string; storyTitle: string } | null> {
  const account = await getConnectedInstagramAccount(topicId);
  if (!account) return null;
  const media = await getTopicInstagramMediaListItem(
    topicId,
    account.igUserId,
    externalId.trim(),
  );
  if (!media || media.linkState === "linked") return null;
  return findApprovedStoryMatchForPermalink(topicId, media.permalink);
}

function normalizeActor(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 200) : null;
}

export { SelectedStoryContentNotFoundError };
