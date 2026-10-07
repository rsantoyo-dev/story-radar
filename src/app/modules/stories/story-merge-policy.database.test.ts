import assert from "node:assert/strict";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { STORY_CONFLICT_SQL } from "./story-merge-policy";

type Contribution = {
  originalUrl: string;
  title: string;
  language: string;
  region: string;
};

const CANONICAL = "https://news.example/transit";

/** Runs the same ON CONFLICT expressions the repository sends. */
async function upsert(client: PGlite, value: Contribution) {
  await client.query(
    `INSERT INTO stories (canonical_url, original_url, title, language, region)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (canonical_url) DO UPDATE SET
       original_url = ${STORY_CONFLICT_SQL.originalUrl},
       title = ${STORY_CONFLICT_SQL.title},
       language = ${STORY_CONFLICT_SQL.language},
       region = ${STORY_CONFLICT_SQL.region}`,
    [CANONICAL, value.originalUrl, value.title, value.language, value.region],
  );
  const { rows } = await client.query<Contribution>(
    `SELECT original_url AS "originalUrl", title, language, region FROM stories WHERE canonical_url = $1`,
    [CANONICAL],
  );
  return rows[0];
}

async function withStories(run: (client: PGlite) => Promise<void>) {
  const client = new PGlite();
  try {
    await client.exec(`CREATE TABLE stories (
      canonical_url text NOT NULL UNIQUE,
      original_url text NOT NULL,
      title text NOT NULL,
      language text NOT NULL,
      region text NOT NULL
    )`);
    await run(client);
  } finally {
    await client.close();
  }
}

const rss: Contribution = {
  originalUrl: "https://news.example/transit?utm_source=rss",
  title: "City council approves new transit line",
  language: "en",
  region: "ca",
};
const manual: Contribution = {
  originalUrl: "https://news.example/transit",
  title: "news.example",
  language: "unknown",
  region: "global",
};

test("a manually added URL never overwrites a well-labelled Story", async () => {
  await withStories(async (client) => {
    await upsert(client, rss);
    assert.deepEqual(await upsert(client, manual), rss);
  });
});

test("a later source fills the placeholders a manual URL left", async () => {
  await withStories(async (client) => {
    await upsert(client, manual);
    assert.deepEqual(await upsert(client, rss), {
      originalUrl: manual.originalUrl,
      title: rss.title,
      language: "en",
      region: "ca",
    });
  });
});

test("a second source never replaces an established title, language or region", async () => {
  await withStories(async (client) => {
    await upsert(client, rss);
    assert.deepEqual(
      await upsert(client, {
        originalUrl: "https://aggregator.example/r/transit",
        title: "Transit line approved — aggregator rewrite",
        language: "fr",
        region: "us",
      }),
      rss,
    );
  });
});

test("a global region is refined by a specific one, never the reverse", async () => {
  await withStories(async (client) => {
    await upsert(client, { ...rss, region: "global" });
    assert.equal((await upsert(client, { ...rss, region: "ca" })).region, "ca");
    assert.equal((await upsert(client, { ...rss, region: "global" })).region, "ca");
    assert.equal((await upsert(client, { ...rss, region: "us" })).region, "ca");
  });
});
