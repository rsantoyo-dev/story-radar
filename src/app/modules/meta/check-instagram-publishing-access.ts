import "server-only";
import { fetchInstagramPublishingQuota, GRAPH_API_VERSION } from "./meta-graph-client";
import { verifyPublishingAccess, type PublishingIdentity } from "./instagram-publishing-access";
import { getPublicationAccessContext } from "./topic-meta-connections.repository";

export function checkInstagramPublishingAccess(topicId: string, expectedIdentity?: PublishingIdentity) {
  return verifyPublishingAccess({
    topicId, apiVersion: GRAPH_API_VERSION, expectedIdentity,
    load: () => getPublicationAccessContext(topicId),
    probe: fetchInstagramPublishingQuota,
  });
}
