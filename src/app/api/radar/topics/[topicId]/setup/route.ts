import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import {
  TopicSetupError,
  completeTopicSetup,
  confirmTopicIdentity,
  getTopicSetupStatus,
} from "@/app/modules/topics/topic-setup";

type Context = { params: Promise<{ topicId: string }> };

/** The brand's guided setup progress (identity → sources → channels). */
export async function GET(request: Request, context: Context) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  try {
    return noStoreJson({ setup: await getTopicSetupStatus((await context.params).topicId) });
  } catch (error) {
    return setupError(error, "load the setup progress");
  }
}

/** `confirm-identity` once the identity is reviewed; `complete` to open the dashboard. */
export async function POST(request: Request, context: Context) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  try {
    const { topicId } = await context.params;
    const body = await request.json().catch(() => ({})) as { action?: unknown };
    if (body.action === "confirm-identity") return noStoreJson({ setup: await confirmTopicIdentity(topicId) });
    if (body.action === "complete") return noStoreJson({ setup: await completeTopicSetup(topicId) });
    return noStoreJson({ error: "action must be confirm-identity or complete" }, 400);
  } catch (error) {
    return setupError(error, "update the setup progress");
  }
}

function setupError(error: unknown, action: string) {
  if (error instanceof TopicSetupError) return noStoreJson({ error: error.message }, error.status);
  console.error(`Could not ${action}`, error);
  return noStoreJson({ error: `Could not ${action}.` }, 500);
}
