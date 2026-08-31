import assert from "node:assert/strict";
import test from "node:test";

import { fetchRssFeedsWithHostLimit } from "../sources/rss/fetch-rss-feeds-with-host-limit";
import type { RssSourceConfig } from "../sources/rss/rss-source.types";

test("limits concurrent RSS requests per publisher host and preserves result order", async () => {
  const sources = [
    source("one", "https://publisher.example/feed/one"),
    source("two", "https://publisher.example/feed/two"),
    source("three", "https://publisher.example/feed/three"),
    source("other-one", "https://other.example/feed/one"),
    source("other-two", "https://other.example/feed/two"),
  ];
  const activeByHost = new Map<string, number>();
  const maximumByHost = new Map<string, number>();

  const results = await fetchRssFeedsWithHostLimit(
    sources,
    async (rssSource) => {
      const host = new URL(rssSource.url).hostname;
      const active = (activeByHost.get(host) ?? 0) + 1;
      activeByHost.set(host, active);
      maximumByHost.set(host, Math.max(maximumByHost.get(host) ?? 0, active));

      try {
        await new Promise((resolve) => setTimeout(resolve, 10));

        if (rssSource.id === "two") {
          throw new Error("publisher rejected this feed");
        }

        return {
          sourceId: rssSource.id,
          sourceName: rssSource.name,
          fetchedAt: new Date("2026-08-31T18:00:00.000Z"),
          items: [],
        };
      } finally {
        activeByHost.set(host, (activeByHost.get(host) ?? 1) - 1);
      }
    },
  );

  assert.equal(maximumByHost.get("publisher.example"), 2);
  assert.equal(maximumByHost.get("other.example"), 2);
  assert.deepEqual(
    results.map((result) => result.status),
    ["fulfilled", "rejected", "fulfilled", "fulfilled", "fulfilled"],
  );
  assert.equal(
    results[2]?.status === "fulfilled"
      ? results[2].value.source.id
      : undefined,
    "three",
  );
});

function source(id: string, url: string): RssSourceConfig {
  return {
    id,
    name: id,
    url,
    enabled: true,
    language: "en",
    region: "Canada",
    tags: [],
    pollEveryMinutes: 60,
    contentMode: "auto",
  };
}
