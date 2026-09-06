import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { EventEmitter } from "node:events";
import * as crypto from "node:crypto";
import ts from "typescript";
import sharp from "sharp";
import * as policy from "./creative-documentary";

type Fixture = (url: URL) => unknown;
function providers(fixture: Fixture, env: Record<string, string> = { CREATIVE_GEO_CONTACT: "test@example.org" }) {
  const calls: URL[] = [];
  const source = readFileSync("src/app/modules/stories/creative-documentary-providers.ts", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, Buffer, URL, URLSearchParams, Date, Set, Map, process: { env }, require: (name: string) => ({
    "server-only": {}, "node:crypto": crypto, sharp, "./creative-documentary": policy,
    "../sources/rss/fetch-rss-feed": { lookupPublicAddress: () => { throw new Error("No real network in fixtures"); } },
    "node:https": { request: (url: URL, _options: unknown, callback: (response: EventEmitter & { headers: object; statusCode: number; destroy: () => void }) => void) => {
      calls.push(url);
      const req = Object.assign(new EventEmitter(), { setTimeout: () => {}, destroy: () => {}, end: () => queueMicrotask(() => {
        try {
          const body = Buffer.from(JSON.stringify(fixture(url)));
          const response = Object.assign(new EventEmitter(), { headers: { "content-length": body.length }, statusCode: 200, destroy: () => {} });
          callback(response); response.emit("data", body); response.emit("end");
        } catch (error) { req.emit("error", error); }
      }) });
      return req;
    } },
  })[name] });
  return { module: exports as typeof import("./creative-documentary-providers"), calls };
}
const scope = { municipality: "Saint-Jean-sur-Richelieu", region: "Québec", country: "Canada", validatedLocationId: null };
const mention: policy.PlaceMention = { name: "place Jacques-Cartier", excerpt: "place Jacques-Cartier", kind: "named", role: "event", municipality: "", region: "", country: "" };
const claim = (value: unknown) => [{ mainsnak: { datavalue: { value } } }];
const entities: Record<string, object> = {
  Q1: { id: "Q1", lastrevid: 12, labels: { fr: { value: mention.name } }, claims: { P131: claim({ id: "Q2" }), P17: claim({ id: "Q4" }), P18: claim("Place.jpg"), P625: claim({ latitude: 45.3, longitude: -73.2, precision: 0.00001, globe: "http://www.wikidata.org/entity/Q2" }) } },
  Q2: { id: "Q2", lastrevid: 20, labels: { fr: { value: scope.municipality } }, claims: { P131: claim({ id: "Q3" }), P17: claim({ id: "Q4" }) } },
  Q3: { id: "Q3", lastrevid: 30, labels: { fr: { value: scope.region } }, claims: { P17: claim({ id: "Q4" }) } },
  Q4: { id: "Q4", lastrevid: 40, labels: { fr: { value: scope.country } } },
};
function fixture(url: URL) {
  if (url.searchParams.get("action") === "wbsearchentities") return { search: [{ id: "Q1" }] };
  const id = url.searchParams.get("ids")!;
  return { entities: { [id]: entities[id] } };
}

test("resolver requires provider hierarchy for municipality, region and country", async () => {
  const h = providers(fixture);
  const place = await h.module.documentaryProviders(AbortSignal.timeout(5000)).resolve(mention, scope);
  assert.equal(place?.id, "Q1"); assert.equal(place?.revision, 12); assert.equal(place?.coordinates?.latitude, 45.3);
  assert.ok(h.calls.every(url => url.hostname === "www.wikidata.org"));
  const mismatch = providers(fixture);
  assert.equal(await mismatch.module.documentaryProviders(AbortSignal.timeout(5000)).resolve(mention, { ...scope, municipality: "Montréal" }), undefined);
});

test("resolver rejects homonyms and incomplete candidate lists", async () => {
  for (const search of [{ search: [{ id: "Q1" }, { id: "Q5" }] }, { search: [{ id: "Q1" }], "search-continue": 6 }]) {
    const h = providers(url => {
      if (url.searchParams.get("action") === "wbsearchentities") return search;
      if (url.searchParams.get("ids") === "Q5") return { entities: { Q5: { ...entities.Q1, id: "Q5" } } };
      return fixture(url);
    });
    assert.equal(await h.module.documentaryProviders(AbortSignal.timeout(5000)).resolve(mention, scope), undefined);
  }
});

test("generic names and unconfigured providers never trigger a lookup", async () => {
  const h = providers(() => { assert.fail("Unexpected lookup"); });
  assert.equal(await h.module.documentaryProviders(AbortSignal.timeout(5000)).resolve({ ...mention, kind: "generic" }, scope), undefined);
  const disabled = providers(() => { assert.fail("Unexpected lookup"); }, {});
  assert.equal(await disabled.module.documentaryProviders(AbortSignal.timeout(5000)).resolve(mention, scope), undefined);
});

test("unknown photo rights exclude ingestion before fetching the image", async () => {
  const h = providers(() => ({ query: { pages: [{ imageinfo: [{ url: "https://upload.wikimedia.org/wikipedia/commons/a/a.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:A.jpg", extmetadata: { LicenseUrl: { value: "https://unknown.example/license" } } }] }] } }));
  const result = await h.module.documentaryProviders(AbortSignal.timeout(5000)).photo({ id: "Q1", name: "Place", revision: 1, sourceUrl: "https://www.wikidata.org/wiki/Q1", scope, hierarchy: [], imageTitle: "A.jpg" });
  assert.equal(result, undefined); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].hostname, "commons.wikimedia.org");
});

test("resource downloads reject untrusted hosts, private targets, credentials and alternate ports", () => {
  const h = providers(() => { assert.fail("Unexpected request"); });
  for (const url of ["http://upload.wikimedia.org/a", "https://127.0.0.1/a", "https://upload.wikimedia.org.attacker.example/a", "https://user:secret@upload.wikimedia.org/a", "https://upload.wikimedia.org:8443/a"]) {
    assert.throws(() => h.module.fetchDocumentaryResource(new URL(url), AbortSignal.timeout(1000)), /Unsupported/);
  }
  assert.equal(h.calls.length, 0);
});

test("maps require a configured export plan and reject imprecise or non-earth coordinates", async () => {
  const h = providers(() => { assert.fail("Unexpected map request"); });
  assert.equal(await h.module.documentaryProviders(AbortSignal.timeout(1000)).map({ id: "Q1", name: "Place", scope, hierarchy: [], revision: 1, sourceUrl: "https://www.wikidata.org/wiki/Q1" }), undefined);
  assert.equal(h.module.validCoordinate({ latitude: 45, longitude: -73, precision: 1, globe: "http://www.wikidata.org/entity/Q2" }), false);
  assert.equal(h.module.validCoordinate({ latitude: 45, longitude: -73, precision: 0.00001, globe: "Mars" }), false);
});
