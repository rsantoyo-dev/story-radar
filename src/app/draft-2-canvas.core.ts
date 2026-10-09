/**
 * Pure helpers behind the Draft 2 canvas: the links between the story page
 * and the canvas, and the reading view of the source text. Kept free of React
 * and the DOM so they are tested directly.
 */

const RETURN_CONTEXT_PATTERN = /^[0-9a-f-]{36}$/i;

type StoryLinkContext = { from?: string; returnContext?: string };

function contextSearch(context: StoryLinkContext): URLSearchParams {
  const search = new URLSearchParams();
  if (context.from?.startsWith("#")) search.set("from", context.from);
  if (context.returnContext && RETURN_CONTEXT_PATTERN.test(context.returnContext)) search.set("returnContext", context.returnContext);
  return search;
}

/** The canvas of a story, keeping the dashboard return context the story page received. */
export function draft2Href(topicId: string, storyId: string, context: StoryLinkContext = {}): string {
  const search = contextSearch(context).toString();
  return `/topics/${encodeURIComponent(topicId)}/stories/${encodeURIComponent(storyId)}/draft-2${search ? `?${search}` : ""}`;
}

/** Back from the canvas to the story's studio, on its script tab. */
export function storyHref(topicId: string, storyId: string, context: StoryLinkContext = {}): string {
  const search = contextSearch(context);
  search.set("tab", "script");
  return `/topics/${encodeURIComponent(topicId)}/stories/${encodeURIComponent(storyId)}?${search}`;
}

/** The host of the source URL, without "www.", for the story's meta line. */
export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function wordCount(text: string | undefined): number {
  return text?.trim() ? text.trim().split(/\s+/).length : 0;
}

/** Paragraphs of the stored text: blank-line separated, single line breaks kept inside one paragraph. */
export function paragraphs(text: string | undefined): string[] {
  return (text ?? "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

export const CONTENT_STATUS_LABELS: Record<string, string> = {
  full: "Full article",
  "likely-full": "Likely full article",
  excerpt: "Excerpt only",
  missing: "No content",
};

export function contentStatusLabel(status: string): string {
  return CONTENT_STATUS_LABELS[status] ?? status;
}

/** The steps the canvas will grow into, in the order they will be built. */
export const DRAFT_2_STEPS = [
  { key: "facts", title: "Facts", detail: "Verified facts with the qualifier each one must keep." },
  { key: "cover", title: "Cover", detail: "Candidate covers judged on the story's tension, not on safety." },
  { key: "closing", title: "Closing", detail: "A closing that resolves the cover's promise and gives the reader a decision." },
  { key: "deck", title: "Deck", detail: "The slides written once to deliver the cover and reach the closing." },
  { key: "review", title: "Review", detail: "Deterministic checks and a calibrated judge before approval." },
] as const;
