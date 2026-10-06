import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Who a provider call is spent for. Low-level adapters (maps, embeddings,
 * text calls outside Creative Studio) read it to attribute their cost without
 * threading a Topic through every function. Set it at the entry point of a
 * workflow that knows its Topic, and its Story when there is one.
 */
export type UsageAttribution = { topicId: string; storyId?: string | null };

const scope = new AsyncLocalStorage<UsageAttribution>();

export function withUsageAttribution<T>(attribution: UsageAttribution, work: () => Promise<T>): Promise<T> {
  return scope.run(attribution, work);
}

export function currentUsageAttribution(): UsageAttribution | undefined {
  return scope.getStore();
}
