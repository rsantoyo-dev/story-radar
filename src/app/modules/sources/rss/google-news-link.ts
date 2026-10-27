/**
 * Google News feeds link every item to news.google.com; the publisher's
 * address sits behind a signed redirect the page resolves in the browser.
 * The collector keeps the Google link as the item's address; the article is
 * fetched from the publisher once the link is resolved here (2026-10-27:
 * Salut Brossard read brossard.ca only through Google, so every municipal
 * notice reached the evaluator as its title alone).
 */

const ARTICLE_PATH = /^\/(?:rss\/)?articles\/([A-Za-z0-9_-]{16,})\/?$/;
const BATCH_EXECUTE = "https://news.google.com/_/DotsSplashUi/data/batchexecute";
const USER_AGENT = "Mozilla/5.0 (compatible; PressCraftor/1.0; +https://presscraftor.com)";

export class GoogleNewsLinkError extends Error {}

/** The article id of a Google News link, or nothing for any other address. */
export function googleNewsArticleId(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "news.google.com") return undefined;
    return ARTICLE_PATH.exec(parsed.pathname)?.[1];
  } catch {
    return undefined;
  }
}

/**
 * The publisher's address behind a Google News link: the article page carries
 * a signature and a timestamp, and Google's own resolver answers them with
 * the address. Two requests; nothing is stored here.
 */
export async function resolveGoogleNewsLink(
  url: string,
  { fetch: fetchImpl = fetch, timeoutMs = 10_000 }: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<string> {
  const id = googleNewsArticleId(url);
  if (!id) throw new GoogleNewsLinkError("Not a Google News article link");
  const page = await fetchImpl(`https://news.google.com/rss/articles/${id}`, {
    headers: { "user-agent": USER_AGENT, accept: "text/html" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!page.ok) throw new GoogleNewsLinkError(`Google News answered HTTP ${page.status}`);
  const html = await page.text();
  const signature = /data-n-a-sg="([^"]+)"/.exec(html)?.[1];
  const timestamp = /data-n-a-ts="(\d+)"/.exec(html)?.[1];
  if (!signature || !timestamp) throw new GoogleNewsLinkError("Google News did not sign the article page");
  const request = JSON.stringify([[["Fbv4je", JSON.stringify(["garturlreq", [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, Number(timestamp), signature]), null, "generic"]]]);
  const answer = await fetchImpl(BATCH_EXECUTE, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "user-agent": USER_AGENT },
    body: `f.req=${encodeURIComponent(request)}`,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!answer.ok) throw new GoogleNewsLinkError(`Google News answered HTTP ${answer.status}`);
  const resolved = publisherUrlIn(await answer.text());
  if (!resolved) throw new GoogleNewsLinkError("Google News did not return the publisher's address");
  return resolved;
}

/** The publisher's address in the resolver's answer: after the `)]}'` guard, a JSON envelope whose first entry carries a JSON string of [kind, address, …]. */
export function publisherUrlIn(body: string): string | undefined {
  for (const line of body.split("\n")) {
    if (!line.startsWith("[[")) continue;
    try {
      const envelope = JSON.parse(line) as unknown[];
      const first = Array.isArray(envelope[0]) ? (envelope[0] as unknown[]) : undefined;
      const payload = typeof first?.[2] === "string" ? (JSON.parse(first[2] as string) as unknown[]) : undefined;
      const address = payload?.[1];
      if (typeof address === "string" && /^https?:\/\//i.test(address) && new URL(address).hostname !== "news.google.com") return address;
    } catch {
      // another line of the answer
    }
  }
  return undefined;
}
