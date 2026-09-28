import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import { verifyAndRecordFacebookPage } from "@/app/modules/meta/facebook-page-verification";
import {
  getDecryptedTopicFacebookAccessToken,
  getTopicFacebookConnectionStatus,
} from "@/app/modules/meta/topic-facebook-connections.repository";

import { facebookRouteError, topicFromContext, type TopicRouteContext } from "../facebook-route-utils";

/** Re-checks the connected Page live. A failed check is returned in the status body, never as a non-2xx. */
export async function POST(request: Request, context: TopicRouteContext) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  try {
    const topic = await topicFromContext(context);
    const page = await getDecryptedTopicFacebookAccessToken(topic.id);
    if (!page) {
      return noStoreJson({ error: "This topic has no connected Facebook Page" }, 400);
    }
    await verifyAndRecordFacebookPage({ topicId: topic.id, ...page });
    return noStoreJson(await getTopicFacebookConnectionStatus(topic.id));
  } catch (error) {
    return facebookRouteError(error, "verify the Facebook Page connection");
  }
}
