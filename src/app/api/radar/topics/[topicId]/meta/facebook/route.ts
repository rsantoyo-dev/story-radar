import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import {
  disconnectTopicFacebook,
  getTopicFacebookConnectionStatus,
} from "@/app/modules/meta/topic-facebook-connections.repository";

import { facebookRouteError, topicFromContext, type TopicRouteContext } from "./facebook-route-utils";
import { recordAuditEventLater } from "@/app/modules/observability/audit";
import { withApiLog } from "@/app/modules/observability/api-request-log";

async function route_GET(request: Request, context: TopicRouteContext) {
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
async function route_DELETE(request: Request, context: TopicRouteContext) {
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

export const GET = withApiLog(route_GET);
export const DELETE = withApiLog(route_DELETE);
