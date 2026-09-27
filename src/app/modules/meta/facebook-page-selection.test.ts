import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import type * as discovery from "./facebook-page-discovery";
import { FacebookPageSelectionError, parseFacebookPageList, publicFacebookPages, selectFacebookPage } from "./facebook-page-selection";

test("Page discovery keeps same-name IDs distinct and strips tokens for UI", () => {
  const page = parseFacebookPageList({ data: [
    { id: "123", name: "Daily", access_token: "secret-one", tasks: ["CREATE_CONTENT"], instagram_business_account: { id: "789" } },
    { id: "456", name: "Daily", access_token: "secret-two", tasks: ["ANALYZE"] },
  ], paging: { next: "https://graph.facebook.com/next", cursors: { after: "cursor" } } });
  assert.equal(page.nextCursor, "cursor");
  assert.equal(selectFacebookPage(page.pages, "123").pageAccessToken, "secret-one");
  assert.deepEqual(publicFacebookPages(page.pages), [
    { id: "123", name: "Daily", linkedInstagramId: "789", canCreateContent: true },
    { id: "456", name: "Daily", canCreateContent: false },
  ]);
  assert.doesNotMatch(JSON.stringify(publicFacebookPages(page.pages)), /secret/);
  assert.throws(() => selectFacebookPage(page.pages, "456"), FacebookPageSelectionError);
  assert.throws(() => selectFacebookPage(page.pages, "999"), FacebookPageSelectionError);
});

test("malformed, repeated or tokenless Pages fail closed", () => {
  for (const value of [{ data: [{ id: "1", name: "Page", tasks: [] }] },
    { data: [{ id: "1", name: "A", access_token: "x", tasks: [] },
      { id: "1", name: "B", access_token: "y", tasks: [] }] },
    { data: [], paging: { next: "next", cursors: { after: 123 } } },
    { data: [{ id: "2", name: "Page", access_token: "x", tasks: [], instagram_business_account: { id: "unknown" } }] }]) {
    assert.throws(() => parseFacebookPageList(value), FacebookPageSelectionError);
  }
});

test("discovery uses a fixed Graph host and never puts tokens in the URL or errors", async () => {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL("./facebook-page-discovery.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, URL, AbortSignal, require: (path: string) => ({
    "server-only": {}, "./facebook-page-selection": { parseFacebookPageList },
  } as Record<string, unknown>)[path] });
  const { fetchFacebookPages } = exports as typeof discovery;
  let requestUrl = "";
  let authorization = "";
  const fetcher = (async (url: URL, init: RequestInit) => {
    requestUrl = url.toString();
    authorization = new Headers(init.headers).get("authorization") ?? "";
    return { ok: true, json: async () => ({ data: [] }) } as Response;
  }) as typeof fetch;
  assert.deepEqual(await fetchFacebookPages({ userAccessToken: "private-token", graphVersion: "v26.0", after: "cursor", fetcher }), { pages: [] });
  assert.match(requestUrl, /^https:\/\/graph\.facebook\.com\/v26\.0\/me\/accounts\?/);
  assert.equal(new URL(requestUrl).searchParams.get("after"), "cursor");
  assert.doesNotMatch(requestUrl, /private-token/);
  assert.equal(authorization, "Bearer private-token");
  await assert.rejects(fetchFacebookPages({ userAccessToken: "private-token", graphVersion: "v26.0",
    fetcher: (async () => ({ ok: false }) as Response) as typeof fetch }), { message: "Meta Page discovery failed" });
});
