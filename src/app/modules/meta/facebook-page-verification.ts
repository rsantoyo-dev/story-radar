import "server-only";

import {
  fetchLinkedInstagramUsername,
  getFacebookPageInstagramLink,
  MetaGraphApiError,
  verifyFacebookPageAccess,
} from "./meta-facebook-graph-client";
import { classifyMetaGraphError, describeMetaVerificationError } from "./meta-verification";
import {
  recordFacebookVerificationFailure,
  recordFacebookVerificationSuccess,
} from "./topic-facebook-connections.repository";

/**
 * Live, read-only re-check of a connected Page, recorded against the exact
 * connection it started from (connectionVersion). A failure is a legitimate
 * result stored on the connection, not an exception for the caller — same
 * convention as the Instagram verify route.
 */
export async function verifyAndRecordFacebookPage(input: {
  topicId: string;
  pageId: string;
  pageAccessToken: string;
  connectionVersion: string;
}): Promise<void> {
  try {
    const access = await verifyFacebookPageAccess(input.pageId, input.pageAccessToken);
    // The linked Instagram account is best-effort: reading it can need a
    // permission the Page connection itself does not, and must not fail it.
    const link = await getFacebookPageInstagramLink(input.pageId, input.pageAccessToken).catch(() => undefined);
    const linkedIgUsername = link?.igUserId
      ? await fetchLinkedInstagramUsername(link.igUserId, input.pageAccessToken).catch(() => undefined)
      : undefined;
    await recordFacebookVerificationSuccess(input.topicId, input.connectionVersion, new Date(), {
      ...(access.pageName ? { pageName: access.pageName } : {}),
      ...(link ? { linkedIgUserId: link.igUserId ?? null } : {}),
      ...(linkedIgUsername ? { linkedIgUsername } : {}),
    });
  } catch (error) {
    const graphError = error instanceof MetaGraphApiError ? error.graphError : undefined;
    console.error(`Facebook Page verification failed for topic ${input.topicId}`);
    await recordFacebookVerificationFailure(input.topicId, input.connectionVersion, {
      message: describeMetaVerificationError(graphError, "Facebook Page verification failed"),
      forceReconnect: classifyMetaGraphError(graphError) === "auth",
    });
  }
}
