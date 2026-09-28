import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import { getPendingFacebookSelection } from "@/app/modules/meta/meta-facebook-oauth-selections.repository";

import { facebookRouteError, topicFromContext } from "../../facebook-route-utils";

type Context = { params: Promise<{ topicId: string; selectionId: string }> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The Pages offered for this selection (public fields only). An expired or
 * already-used selection is a normal result — `{ pages: [], expired: true }`
 * lets the picker say "start over" without a fetch-error branch.
 */
export async function GET(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  try {
    const topic = await topicFromContext(context);
    const { selectionId } = await context.params;
    const selection = UUID_PATTERN.test(selectionId)
      ? await getPendingFacebookSelection(selectionId, topic.id)
      : undefined;
    if (!selection) return noStoreJson({ pages: [], expired: true });
    return noStoreJson({ pages: selection.pages, expiresAt: selection.expiresAt, expired: false });
  } catch (error) {
    return facebookRouteError(error, "read the Facebook Page selection");
  }
}
