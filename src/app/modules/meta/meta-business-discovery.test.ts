import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import * as tokenResponse from "./meta-token-response";

const requireLocal = createRequire(import.meta.url);

type Answer = { status: number; body: unknown };
/** The Graph client with a fake fetch that answers each request in turn, and records the URLs and tokens it was asked with. */
function client(answers: Answer[]) {
  const requests: { url: string; authorization: string }[] = [];
  const fetch = async (url: URL, init: { headers: Record<string, string> }) => {
    requests.push({ url: url.toString(), authorization: init.headers.Authorization });
    const answer = answers.shift()!;
    return { ok: answer.status < 400, status: answer.status, json: async () => answer.body };
  };
  const code = ts.transpileModule(readFileSync(new URL("./meta-graph-client.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  const imports: Record<string, unknown> = {
    "server-only": {},
    "./meta-token-response": tokenResponse,
    "./instagram-publishing-access": { parsePublishingQuota: () => undefined },
    "./instagram-media-response": { parseInstagramMediaListResponse: () => undefined },
    "./instagram-insights-response": { assertInstagramInsightsShape: () => undefined },
  };
  runInNewContext(code, { exports, fetch, URL, AbortSignal, JSON, Error, Object, Array, Promise, Number, String, Map, Set,
    require: (name: string) => name in imports ? imports[name] : requireLocal(name) });
  return { lookup: (exports as typeof import("./meta-graph-client")).fetchInstagramBusinessDiscovery, requests };
}

const UNKNOWN_USER = { error: { message: "Invalid user id", type: "OAuthException", code: 110, error_subcode: 2207013, error_user_msg: "The user with username: nobody cannot be found." } };

test("Business Discovery asks for one username through the Topic's own account, with the Page token, on graph.facebook.com", async () => {
  const { lookup, requests } = client([{ status: 200, body: { business_discovery: { username: "biblio.longueuil", name: "Bibliothèques de Longueuil", followers_count: 4821, website: "https://longueuil.quebec", id: "17841" }, id: "1784" } }]);
  const found = await lookup("17841400000000", "page-token", "biblio.longueuil");
  assert.equal(JSON.stringify(found), JSON.stringify({ username: "biblio.longueuil", name: "Bibliothèques de Longueuil", followers: 4821, website: "https://longueuil.quebec" }));
  const url = new URL(requests[0].url);
  assert.equal(`${url.host}${url.pathname}`, "graph.facebook.com/v21.0/17841400000000");
  assert.equal(url.searchParams.get("fields"), "business_discovery.username(biblio.longueuil){username,name,followers_count,website}");
  assert.equal(requests[0].authorization, "Bearer page-token", "the token travels in the header, never in the URL");
});

test("an account Instagram cannot find (a personal account, or no account) is not found; any other refusal throws", async () => {
  assert.equal(await client([{ status: 400, body: UNKNOWN_USER }]).lookup("17841400000000", "t", "nobody"), undefined);
  await assert.rejects(client([{ status: 400, body: { error: { message: "Invalid user id", code: 110 } } }]).lookup("17841400000000", "t", "someone"), tokenResponse.MetaGraphApiError,
    "code 110 without Instagram's subcode is the Topic's own account failing, not an unknown username");
  await assert.rejects(client([{ status: 403, body: { error: { message: "(#10) Application does not have permission for this action", code: 10 } } }]).lookup("17841400000000", "t", "someone"), /permission/);
});

test("a malformed username or account id is refused before any request", async () => {
  const { lookup, requests } = client([]);
  await assert.rejects(lookup("17841400000000", "t", "bad name"), /Invalid Instagram username/);
  await assert.rejects(lookup("17841400000000", "t", "x){id}"), /Invalid Instagram username/);
  await assert.rejects(lookup("ig-user", "t", "fine"), /Invalid Instagram account identity/);
  assert.equal(requests.length, 0);
});
