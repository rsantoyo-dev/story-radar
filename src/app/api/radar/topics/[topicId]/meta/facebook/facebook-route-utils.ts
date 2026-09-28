import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import { MetaIntegrationConfigError } from "@/app/modules/meta/meta-integration.config";
import { TopicFacebookConnectionError } from "@/app/modules/meta/topic-facebook-connections.repository";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";
import type { Topic } from "@/db/schema";

export type TopicRouteContext = { params: Promise<{ topicId: string }> };

export async function topicFromContext(context: { params: Promise<{ topicId: string }> }): Promise<Topic> {
  const { topicId } = await context.params;
  return requireTopic(topicId, { active: true });
}

/** Same mapping as the Instagram routes: unknown topic → 404, configuration gap → 400, anything else → 500. */
export function facebookRouteError(error: unknown, action: string) {
  if (error instanceof TopicContextError) {
    return noStoreJson({ error: error.message }, 404);
  }
  if (error instanceof TopicFacebookConnectionError || error instanceof MetaIntegrationConfigError) {
    return noStoreJson({ error: error.message }, 400);
  }
  console.error(`Failed to ${action}`, error);
  return noStoreJson({ error: `Unable to ${action}` }, 500);
}
