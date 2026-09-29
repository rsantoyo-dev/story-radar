import "server-only";

import { checkInstagramPublishingAccess } from "./check-instagram-publishing-access";
import type { PublicationDestination } from "./instagram-publication-candidate";
import {
  verifyPublishingAccess,
  type PublishingAccess,
  type PublishingIdentity,
  UNMETERED_PAGE_QUOTA,
} from "./instagram-publishing-access";
import { verifyFacebookPageAccess } from "./meta-facebook-graph-client";
import { fetchInstagramPublishingQuota, GRAPH_API_VERSION, type InstagramGraphHost } from "./meta-graph-client";
import type { PublicationChannel } from "./publication-channel";
import {
  getFacebookChannelAccessContext,
  getFacebookChannelDestination,
  getFacebookChannelSendCredentials,
} from "./topic-facebook-connections.repository";
import {
  getDecryptedTopicMetaAccessToken,
  getPublicationDestination,
} from "./topic-meta-connections.repository";

/**
 * PUB-10: one resolver per channel for the shared publishing pipeline. The
 * direct Instagram channel delegates to the pre-existing functions unchanged,
 * so its destinations, identities and hashes are exactly what they were.
 */

export function instagramGraphHostFor(channel: PublicationChannel): InstagramGraphHost {
  return channel === "instagram-direct" ? "graph.instagram.com" : "graph.facebook.com";
}

export async function getChannelPublicationDestination(
  topicId: string,
  channel: PublicationChannel,
): Promise<PublicationDestination> {
  return channel === "instagram-direct"
    ? getPublicationDestination(topicId)
    : getFacebookChannelDestination(topicId, channel);
}

/** The live, read-only PUB-02 preflight for this channel. Never creates or posts anything. */
export function checkChannelPublishingAccess(
  topicId: string,
  channel: PublicationChannel,
  expectedIdentity?: PublishingIdentity,
): Promise<PublishingAccess> {
  if (channel === "instagram-direct") return checkInstagramPublishingAccess(topicId, expectedIdentity);
  const access = verifyPublishingAccess({
    topicId,
    apiVersion: GRAPH_API_VERSION,
    expectedIdentity,
    load: () => getFacebookChannelAccessContext(topicId, channel),
    probe: channel === "instagram-page"
      ? (igUserId, token) => fetchInstagramPublishingQuota(igUserId, token, "graph.facebook.com")
      : async (pageId, token) => {
          await verifyFacebookPageAccess(pageId, token);
          return UNMETERED_PAGE_QUOTA;
        },
  });
  return channel === "facebook-page"
    ? access.then((result) => ({ ...result, message: FACEBOOK_PAGE_ACCESS_MESSAGES[result.state] ?? result.message }))
    : access;
}

/** The shared messages describe Instagram's quota check; a Page has none. */
const FACEBOOK_PAGE_ACCESS_MESSAGES: Partial<Record<PublishingAccess["state"], string>> = {
  disconnected: "Connect a Facebook Page for this topic.",
  "needs-reconnect": "The Facebook Page authorization is expired or invalid. Reconnect the Page.",
  "missing-permission": "The Page connection lacks publishing access. Check that you can create content on the Page and that pages_manage_posts is granted, then reconnect.",
  unverified: "Publishing access to the Facebook Page has not been checked.",
  enabled: "Facebook accepted the live check for this Page token.",
  "rate-limited": "Facebook limited this check. Wait before verifying again.",
};

/**
 * The token and the account a send acts as: the Instagram account for both
 * Instagram channels, the Page for facebook-page. Decrypted per call.
 */
export async function getChannelSendCredentials(
  topicId: string,
  channel: PublicationChannel,
): Promise<{ accessToken: string; accountId: string; connectionVersion: string } | undefined> {
  if (channel === "instagram-direct") {
    const token = await getDecryptedTopicMetaAccessToken(topicId);
    return token ? { accessToken: token.accessToken, accountId: token.igUserId, connectionVersion: token.connectionVersion } : undefined;
  }
  return getFacebookChannelSendCredentials(topicId, channel);
}
