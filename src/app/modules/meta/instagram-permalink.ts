/**
 * Extracts the canonical shortcode from an Instagram permalink so an imported
 * media (`topic_instagram_media.permalink`, always instagram.com) and an
 * operator-entered publication URL (`story_social_publications.post_url`) can be
 * compared for the IG-04 URL auto-link. Pure — unit-tested.
 *
 * `/p/<code>/`, `/reel/<code>/` and `/tv/<code>/` of the same media all carry
 * the same shortcode, so the shortcode alone is the match key. Query string and
 * hash are ignored. Only real Instagram hosts are accepted — anything else
 * returns null so a stray URL never matches.
 */

const ALLOWED_HOSTS = new Set(["instagram.com", "www.instagram.com"]);

const SHORTCODE_PATH =
  /^\/(?:[A-Za-z0-9_.]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?$/;

export function instagramPermalinkShortcode(
  url: string | null | undefined,
): string | null {
  if (typeof url !== "string" || url.trim().length === 0) return null;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) return null;

  const match = SHORTCODE_PATH.exec(parsed.pathname);
  return match ? match[1] : null;
}

/** True when both URLs resolve to the same Instagram media shortcode. */
export function sameInstagramPermalink(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = instagramPermalinkShortcode(a);
  const right = instagramPermalinkShortcode(b);
  return left !== null && left === right;
}
