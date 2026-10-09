import "server-only";
import { publishingIdentity } from "./instagram-publishing-access";
import { GRAPH_API_VERSION } from "./meta-graph-client";
import { findCreativeDraftById } from "../stories/creative-content.repository";
import { findCreativeAssetBatchById, getCreativeAssetGenerationReferences } from "../stories/creative-assets.repository";
import { adaptationCreditLine, placePhotoAdaptationCreditLine, portraitCreditLine } from "../stories/creative-portrait-composite";
import type { CreativeAssetBatch } from "../stories/creative-content.types";
import { getSelectedStoryContent } from "../stories/story-content.repository";
import { documentarySourceToken, latestDocumentaryBatch } from "../stories/creative-documentary.repository";
import { DOCUMENTARY_PROVIDER } from "../stories/creative-documentary";
import { documentaryImage } from "../stories/manage-creative-documentary";
import { downloadApprovedCreativeImage } from "../stories/manage-creative-assets";
import { CreativeContentConflictError, CreativeContentNotFoundError, getCreativeWorkspaceState } from "../stories/manage-creative-content";
import { checkChannelPublishingAccess, getChannelPublicationDestination } from "./publication-channel-connections";
import { DEFAULT_PUBLICATION_CHANNEL, type PublicationChannel } from "./publication-channel";
import { validatePublicationCandidate } from "./validate-publication-candidate";

export async function getPublicationCandidate(topicId: string, draftId: string, batchId: string, channel: PublicationChannel = DEFAULT_PUBLICATION_CHANNEL) {
  return validatePublicationCandidate({
    apiVersion: GRAPH_API_VERSION,
    checkDestination: (input) => checkChannelPublishingAccess(topicId, channel, publishingIdentity(topicId, input.destination)),
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
      const [sourceToken, destination] = await Promise.all([documentarySourceToken(topicId, draft.storyId), getChannelPublicationDestination(topicId, channel)]);
      const photoCredits = batch.provider === DOCUMENTARY_PROVIDER ? [] : await batchPhotoCredits(batch);
      return { topicId, draft, batch, sourceToken, destination, photoCredits };
    },
    readApprovedImage: (input, assetId) => input.batch.provider === DOCUMENTARY_PROVIDER
      ? documentaryImage(topicId, input.draft.storyId, assetId, false, true)
      : downloadApprovedCreativeImage(topicId, assetId),
  });
}

/** Credits owed by the batch's pasted portraits and AI adaptations of licensed photos. */
async function batchPhotoCredits(batch: CreativeAssetBatch): Promise<string[]> {
  const credits: string[] = [];
  for (const asset of [...batch.assets].sort((a, b) => a.unitOrder - b.unitOrder)) {
    const portrait = asset.unitSnapshot.documentaryPortrait;
    if (portrait?.provenance) credits.push(portraitCreditLine(portrait.provenance));
    // A verified place photo the model adapted: its credit is never drawn on the image.
    const place = asset.unitSnapshot.placeVisual;
    if (place?.generationUse === "ai-reference" && place.photo?.author && place.photo.license) {
      credits.push(placePhotoAdaptationCreditLine(place.photo));
    }
    const references = (await getCreativeAssetGenerationReferences(asset.id)).story ?? [];
    for (const reference of references) {
      if (reference.purpose !== "documentary-portrait" && reference.purpose !== "style" && /via Wikimedia Commons/.test(reference.provenance)) {
        credits.push(adaptationCreditLine(reference.provenance));
      }
    }
  }
  return credits;
}
