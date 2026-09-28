import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { SQL } from "drizzle-orm";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import * as schema from "../../../db/schema";
import * as crypto from "./meta-token-crypto";
import * as capabilities from "./channel-capabilities";
import type * as selectionsRepo from "./meta-facebook-oauth-selections.repository";
import type * as connectionsRepo from "./topic-facebook-connections.repository";

const requireLocal = createRequire(import.meta.url);
const topicId = "00000000-0000-4000-8000-000000000001";
const otherTopicId = "00000000-0000-4000-8000-000000000002";
const encryptionKey = randomBytes(32).toString("base64");

const pages = [
  { pageId: "1001", pageName: "Salut Saint Jean", pageAccessToken: "page-token-secret-1", tasks: ["MANAGE", "CREATE_CONTENT"], linkedIgUserId: "179", linkedIgUsername: "salut.st.jean" },
  { pageId: "1002", pageName: "Salut Saint Jean", pageAccessToken: "page-token-secret-2", tasks: ["ANALYZE"] },
];

async function createTable(client: PGlite, dialect: PgDialect, table: PgTable) {
  const config = getTableConfig(table);
  const columns = config.columns.map((column) => {
    const value = column.default instanceof SQL ? dialect.sqlToQuery(column.default).sql
      : column.default === undefined ? undefined : typeof column.default === "string" ? `'${column.default}'` : String(column.default);
    return `"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}${column.notNull ? " NOT NULL" : ""}${value ? ` DEFAULT ${value}` : ""}`;
  });
  await client.exec(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
}

async function setup() {
  const client = new PGlite();
  const db = drizzle(client);
  const dialect = new PgDialect();
  await createTable(client, dialect, schema.metaFacebookOauthSelections);
  await createTable(client, dialect, schema.topicFacebookConnections);
  const deps: Record<string, unknown> = {
    "server-only": {},
    "@/db/client": { db },
    "@/db/schema": schema,
    "./meta-token-crypto": crypto,
    "./channel-capabilities": capabilities,
    "./meta-integration.config": {
      requireMetaTokenEncryptionKeyFromEnv: () => encryptionKey,
      getDefaultMetaFacebookAppCredentials: () => ({ appId: "fb-app", appSecret: "fb-secret" }),
    },
  };
  function load<T>(file: string): T {
    const exports = {};
    const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      exports, Date, Map, Set, JSON, Buffer,
      require: (id: string) => (id in deps ? deps[id] : requireLocal(id)),
    });
    return exports as T;
  }
  return {
    client,
    db,
    selections: load<typeof selectionsRepo>("./meta-facebook-oauth-selections.repository.ts"),
    connections: load<typeof connectionsRepo>("./topic-facebook-connections.repository.ts"),
  };
}

test("the picker exposes public Page fields only, and the stored list is encrypted at rest", async () => {
  const h = await setup();
  try {
    const { id } = await h.selections.createPendingFacebookSelection(topicId, pages);
    const selection = await h.selections.getPendingFacebookSelection(id, topicId);
    assert.equal(selection?.pages.length, 2);
    assert.ok(!JSON.stringify(selection).includes("page-token-secret"));
    const [row] = await h.db.select().from(schema.metaFacebookOauthSelections);
    assert.ok(!row.pagesEncrypted.includes("page-token-secret"));
    assert.ok(!row.pagesEncrypted.includes("Salut Saint Jean"));
  } finally { await h.client.close(); }
});

test("confirming only accepts a Page from the stored list, exactly once", async () => {
  const h = await setup();
  try {
    const { id } = await h.selections.createPendingFacebookSelection(topicId, pages);
    assert.equal(await h.selections.consumePendingFacebookSelection(id, topicId, "9999"), undefined, "an arbitrary pageId is rejected");
    assert.equal(await h.selections.consumePendingFacebookSelection(id, otherTopicId, "1001"), undefined, "another topic cannot use it");
    const chosen = await h.selections.consumePendingFacebookSelection(id, topicId, "1001");
    assert.equal(chosen?.pageAccessToken, "page-token-secret-1");
    assert.equal(await h.selections.consumePendingFacebookSelection(id, topicId, "1002"), undefined, "no second Page after consumption");
    assert.equal(await h.selections.getPendingFacebookSelection(id, topicId), undefined);
  } finally { await h.client.close(); }
});

test("concurrent confirms of the same selection: exactly one wins", async () => {
  const h = await setup();
  try {
    const { id } = await h.selections.createPendingFacebookSelection(topicId, pages);
    const results = await Promise.all([
      h.selections.consumePendingFacebookSelection(id, topicId, "1001"),
      h.selections.consumePendingFacebookSelection(id, topicId, "1002"),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
  } finally { await h.client.close(); }
});

test("an expired selection can be neither read nor confirmed", async () => {
  const h = await setup();
  try {
    const past = new Date(Date.now() - 60 * 60 * 1_000);
    const { id } = await h.selections.createPendingFacebookSelection(topicId, pages, past);
    assert.equal(await h.selections.getPendingFacebookSelection(id, topicId), undefined);
    assert.equal(await h.selections.consumePendingFacebookSelection(id, topicId, "1001"), undefined);
  } finally { await h.client.close(); }
});

test("a verification from before a reconnect never lands on the new connection", async () => {
  const h = await setup();
  try {
    const first = await h.connections.saveTopicFacebookConnection(topicId, {
      pageId: "1001", pageName: "Salut Saint Jean", pageAccessToken: "token-a", tasks: ["MANAGE"],
    });
    await h.connections.saveTopicFacebookConnection(topicId, {
      pageId: "1001", pageName: "Salut Saint Jean", pageAccessToken: "token-b", tasks: ["MANAGE"],
    });
    await h.connections.recordFacebookVerificationSuccess(topicId, first.connectionVersion, new Date());
    const status = await h.connections.getTopicFacebookConnectionStatus(topicId);
    assert.equal(status.connected, true);
    assert.equal(status.lastVerifiedAt, undefined, "the stale success was dropped");
    const [row] = await h.db.select().from(schema.topicFacebookConnections);
    assert.ok(!row.pageAccessTokenEncrypted?.includes("token-b"), "the Page token is encrypted at rest");
  } finally { await h.client.close(); }
});

test("status reports honest capabilities, and disconnect clears the Page", async () => {
  const h = await setup();
  try {
    const saved = await h.connections.saveTopicFacebookConnection(topicId, {
      pageId: "1001", pageName: "Salut Saint Jean", pageAccessToken: "token-a", tasks: ["MANAGE", "CREATE_CONTENT"],
      linkedIgUserId: "179", linkedIgUsername: "salut.st.jean",
    });
    await h.connections.recordFacebookVerificationSuccess(topicId, saved.connectionVersion, new Date(), {
      pageName: "Salut Saint Jean", linkedIgUserId: "179", linkedIgUsername: "salut.st.jean",
    });
    const status = await h.connections.getTopicFacebookConnectionStatus(topicId);
    assert.equal(status.pageName, "Salut Saint Jean");
    assert.equal(status.linkedIgUsername, "salut.st.jean");
    assert.ok(status.lastVerifiedAt);
    assert.equal(status.capabilities.canPublish, "needs-attention", "never 'available' before PUB-10");
    assert.ok(!JSON.stringify(status).includes("token-a"));

    await h.connections.disconnectTopicFacebook(topicId);
    const cleared = await h.connections.getTopicFacebookConnectionStatus(topicId);
    assert.equal(cleared.connected, false);
    assert.equal(cleared.pageId, undefined);
    assert.equal(await h.connections.getDecryptedTopicFacebookAccessToken(topicId), undefined);
  } finally { await h.client.close(); }
});
