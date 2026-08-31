import type { RssFeedResult } from "./rss-feed.types";
import type { RssSourceConfig } from "./rss-source.types";

export const RSS_FETCH_MAX_CONCURRENCY_PER_HOST = 2;

type FetchRssFeed = (source: RssSourceConfig) => Promise<RssFeedResult>;

type SettledRssFeed = PromiseSettledResult<{
  source: RssSourceConfig;
  feed: RssFeedResult;
}>;

/**
 * Fetches unrelated hosts in parallel while preventing one publisher from
 * receiving a burst of simultaneous requests. Some official publishers expose
 * several topic feeds from the same host and throttle those bursts.
 */
export async function fetchRssFeedsWithHostLimit(
  sources: readonly RssSourceConfig[],
  fetchFeed: FetchRssFeed,
  maxConcurrencyPerHost = RSS_FETCH_MAX_CONCURRENCY_PER_HOST,
): Promise<SettledRssFeed[]> {
  const concurrency = Math.max(1, Math.floor(maxConcurrencyPerHost));
  const groups = groupSourcesByHost(sources);
  const results = new Array<SettledRssFeed>(sources.length);

  await Promise.all(
    [...groups.values()].map(async (group) => {
      let nextIndex = 0;
      const workers = Array.from(
        { length: Math.min(concurrency, group.length) },
        async () => {
          while (nextIndex < group.length) {
            const entry = group[nextIndex];
            nextIndex += 1;

            if (!entry) continue;

            try {
              results[entry.index] = {
                status: "fulfilled",
                value: {
                  source: entry.source,
                  feed: await fetchFeed(entry.source),
                },
              };
            } catch (reason) {
              results[entry.index] = { status: "rejected", reason };
            }
          }
        },
      );

      await Promise.all(workers);
    }),
  );

  return results;
}

function groupSourcesByHost(sources: readonly RssSourceConfig[]) {
  const groups = new Map<
    string,
    Array<{ index: number; source: RssSourceConfig }>
  >();

  sources.forEach((source, index) => {
    const host = sourceHost(source);
    const group = groups.get(host) ?? [];
    group.push({ index, source });
    groups.set(host, group);
  });

  return groups;
}

function sourceHost(source: RssSourceConfig): string {
  try {
    return new URL(source.url).hostname.toLowerCase();
  } catch {
    // Invalid source URLs must still reach the normal fetcher so it can return
    // its established validation error. Keep each invalid URL isolated here.
    return `invalid:${source.id}`;
  }
}
