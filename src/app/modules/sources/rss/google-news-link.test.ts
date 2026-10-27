import assert from "node:assert/strict";
import test from "node:test";
import { GoogleNewsLinkError, googleNewsArticleId, publisherUrlIn, resolveGoogleNewsLink } from "./google-news-link";

const id = "CBMimAFBVV95cUxOWUxiVXdXamk1WUVEb1NMTzlOMjlhaWtKMHdQWXJx";
const link = `https://news.google.com/rss/articles/${id}?oc=5`;
const answer = `)]}'\n\n123\n[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://brossard.ca/actualites/la-place-de-la-gare/\\",null]",null,null,null,"generic"]]\n25\n[["di",12],["af.httprm",12,"x",1]]\n`;

test("a Google News link is told from any other address by its host and its article path", () => {
  assert.equal(googleNewsArticleId(link), id);
  assert.equal(googleNewsArticleId(`https://news.google.com/articles/${id}`), id);
  assert.equal(googleNewsArticleId("https://brossard.ca/actualites/x/"), undefined);
  assert.equal(googleNewsArticleId("https://news.google.com/rss/search?q=Brossard"), undefined);
  assert.equal(googleNewsArticleId("not a url"), undefined);
});

test("the resolver asks Google for the article page's signature, then its resolver for the publisher's address, and refuses anything else", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    if (calls.length === 1) return new Response(`<html><c-wiz data-n-a-id="${id}" data-n-a-sg="SIG" data-n-a-ts="1793109169"></c-wiz></html>`, { status: 200 });
    return new Response(answer, { status: 200 });
  }) as typeof fetch;
  assert.equal(await resolveGoogleNewsLink(link, { fetch: fetchImpl }), "https://brossard.ca/actualites/la-place-de-la-gare/");
  assert.equal(calls[0].url, `https://news.google.com/rss/articles/${id}`);
  assert.equal(calls[1].init?.method, "POST");
  const body = decodeURIComponent(String(calls[1].init?.body)).replace(/^f\.req=/, "");
  assert.ok(body.includes(id) && body.includes("1793109169") && body.includes("SIG"), "the id, the timestamp and the signature travel in the request");
  await assert.rejects(resolveGoogleNewsLink("https://brossard.ca/x", { fetch: fetchImpl }), GoogleNewsLinkError);
  const unsigned = (async () => new Response("<html></html>", { status: 200 })) as typeof fetch;
  await assert.rejects(resolveGoogleNewsLink(link, { fetch: unsigned }), /did not sign/);
  const down = (async () => new Response("", { status: 503 })) as typeof fetch;
  await assert.rejects(resolveGoogleNewsLink(link, { fetch: down }), /HTTP 503/);
});

test("the publisher's address is read from the resolver's answer, never a Google address or a broken line", () => {
  assert.equal(publisherUrlIn(answer), "https://brossard.ca/actualites/la-place-de-la-gare/");
  assert.equal(publisherUrlIn(`)]}'\n\n[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://news.google.com/articles/${id}\\"]"]]`), undefined, "a Google address is no resolution");
  assert.equal(publisherUrlIn(")]}'\n\n[[\"wrb.fr\",\"Fbv4je\",\"not json\"]]\n[[broken"), undefined);
  assert.equal(publisherUrlIn(""), undefined);
});
