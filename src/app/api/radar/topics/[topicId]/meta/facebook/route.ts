import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import {
  disconnectTopicFacebook,
  getTopicFacebookConnectionStatus,
} from "@/app/modules/meta/topic-facebook-connections.repository";

import { facebookRouteError, topicFromContext, type TopicRouteContext } from "./facebook-route-utils";
import { recordAuditEventLater } from "@/app/modules/observability/audit";

export async function GET(request: Request, context: TopicRouteContext) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  try {
    const topic = await topicFromContext(context);
    return noStoreJson(await getTopicFacebookConnectionStatus(topic.id));
  } catch (error) {
    return facebookRouteError(error, "read the Facebook Page connection");
  }
}

/** Disconnects only the Facebook Page; a directly connected Instagram account is untouched. */
export async function DELETE(request: Request, context: TopicRouteContext) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  try {
    const topic = await topicFromContext(context);
    await disconnectTopicFacebook(topic.id);
    recordAuditEventLater({ action: "meta.facebook.disconnected", entityType: "topic", entityId: topic.id, topicId: topic.id });
    return noStoreJson(await getTopicFacebookConnectionStatus(topic.id));
  } catch (error) {
    return facebookRouteError(error, "disconnect the Facebook Page");
  }
}
