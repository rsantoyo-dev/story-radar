import "server-only";
import { checkInstagramPublishingAccess } from "./check-instagram-publishing-access";
import { publishingIdentity } from "./instagram-publishing-access";
import { GRAPH_API_VERSION } from "./meta-graph-client";
import { findCreativeDraftById } from "../stories/creative-content.repository";
import { findCreativeAssetBatchById } from "../stories/creative-assets.repository";
import { getSelectedStoryContent } from "../stories/story-content.repository";
import { documentarySourceToken, latestDocumentaryBatch } from "../stories/creative-documentary.repository";
import { DOCUMENTARY_PROVIDER } from "../stories/creative-documentary";
import { documentaryImage } from "../stories/manage-creative-documentary";
import { downloadApprovedCreativeImage } from "../stories/manage-creative-assets";
import { CreativeContentConflictError, CreativeContentNotFoundError, getCreativeWorkspaceState } from "../stories/manage-creative-content";
import { getPublicationDestination } from "./topic-meta-connections.repository";
import { validatePublicationCandidate } from "./validate-publication-candidate";

export async function getPublicationCandidate(topicId: string, draftId: string, batchId: string) {
  return validatePublicationCandidate({
    apiVersion: GRAPH_API_VERSION,
    checkDestination: (input) => checkInstagramPublishingAccess(topicId, publishingIdentity(topicId, input.destination)),
    load: async () => {
      let draft = await findCreativeDraftById(topicId, draftId);
      if (!draft) throw new CreativeContentNotFoundError("Draft not found");
      await getSelectedStoryContent(topicId, draft.storyId);
      const batch = await findCreativeAssetBatchById(batchId);
      if (!batch || batch.draftId !== draft.id) throw new CreativeContentNotFoundError("Image batch not found for this draft");
      if (batch.provider === DOCUMENTARY_PROVIDER && (await latestDocumentaryBatch(topicId, draft.storyId))?.id !== batch.id) throw new CreativeContentConflictError("Validate the latest documentary preparation.");
      if (batch.provider !== DOCUMENTARY_PROVIDER) {
        const workspace = await getCreativeWorkspaceState(topicId, draft.storyId);
        const current = workspace.drafts.find(item => item.id === draftId);
        if (!current) throw new CreativeContentNotFoundError("Draft not found");
        draft = current;
      }
      const [sourceToken, destination] = await Promise.all([documentarySourceToken(topicId, draft.storyId), getPublicationDestination(topicId)]);
      return { topicId, draft, batch, sourceToken, destination };
    },
    readApprovedImage: (input, assetId) => input.batch.provider === DOCUMENTARY_PROVIDER
      ? documentaryImage(topicId, input.draft.storyId, assetId, false, true)
      : downloadApprovedCreativeImage(topicId, assetId),
  });
}
