import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import { verifyAndRecordFacebookPage } from "@/app/modules/meta/facebook-page-verification";
import { consumePendingFacebookSelection } from "@/app/modules/meta/meta-facebook-oauth-selections.repository";
import {
  getTopicFacebookConnectionStatus,
  saveTopicFacebookConnection,
} from "@/app/modules/meta/topic-facebook-connections.repository";

import { facebookRouteError, topicFromContext } from "../../../facebook-route-utils";
import { recordAuditEventLater } from "@/app/modules/observability/audit";
import { withApiLog } from "@/app/modules/observability/api-request-log";

type Context = { params: Promise<{ topicId: string; selectionId: string }> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Connects the chosen Page. The pageId must be one of this selection's own
 * stored Pages — its token comes from the server's copy, never the browser —
 * and the selection is consumed atomically, so a double-click or a replay
 * cannot attach a second Page.
 */
async function route_POST(request: Request, context: Context) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  try {
    const topic = await topicFromContext(context);
    const { selectionId } = await context.params;
    const body = (await request.json().catch(() => undefined)) as { pageId?: unknown } | undefined;
    const pageId = typeof body?.pageId === "string" ? body.pageId : undefined;
    if (!pageId || !UUID_PATTERN.test(selectionId)) {
      return noStoreJson({ error: "Choose a Page from this selection" }, 400);
    }

    const page = await consumePendingFacebookSelection(selectionId, topic.id, pageId);
    if (!page) {
      return noStoreJson(
        { error: "This Page selection expired, was already used, or does not include that Page. Connect Meta again." },
        409,
      );
    }

    const { connectionVersion } = await saveTopicFacebookConnection(topic.id, {
      pageId: page.pageId,
      pageName: page.pageName,
      pageAccessToken: page.pageAccessToken,
      tasks: page.tasks,
      ...(page.linkedIgUserId ? { linkedIgUserId: page.linkedIgUserId } : {}),
      ...(page.linkedIgUsername ? { linkedIgUsername: page.linkedIgUsername } : {}),
    });
    recordAuditEventLater({
      action: "meta.facebook.connected", entityType: "topic", entityId: topic.id, topicId: topic.id,
      details: { pageId: page.pageId, pageName: page.pageName, connectionVersion },
    });
    // Best-effort live check so the card shows the verified state immediately.
    await verifyAndRecordFacebookPage({
      topicId: topic.id,
      pageId: page.pageId,
      pageAccessToken: page.pageAccessToken,
      connectionVersion,
    });

    return noStoreJson(await getTopicFacebookConnectionStatus(topic.id));
  } catch (error) {
    return facebookRouteError(error, "connect the Facebook Page");
  }
}

export const POST = withApiLog(route_POST);
