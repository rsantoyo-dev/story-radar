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
  { key: "focus", title: "Focus", detail: "What the story is for: its line, audience, framing, structure, goal and voice." },
  { key: "opening", title: "Opening", detail: "Cover and slide 2 judged as one unit: the promise and its first payoff." },
  { key: "closing", title: "Closing", detail: "The ending: the cover's promise paid in full, what it means for the reader, one call to action." },
  { key: "deck", title: "Deck", detail: "The slides between slide 2 and the closing, one idea each: the story from its promise to its end." },
  { key: "inventory", title: "People and places", detail: "Who and where the story names, and the verified photos and maps of them." },
  { key: "visual", title: "Visual script", detail: "The carousel's images as one visual story, in the brand's identity." },
  { key: "review", title: "Review", detail: "Deterministic checks and a calibrated judge before approval." },
] as const;

/** Characters per token, roughly, for JSON in English, French or Spanish: close enough to tell an answer from thinking. */
const CHARACTERS_PER_TOKEN = 3.5;

/** What the trace line reads of one provider call (draft2-facts.types.ts, Draft2TraceEntry). */
type TraceCall = {
  provider: "openai" | "anthropic";
  usage?: { promptTokens: number; outputTokens: number; thoughtsTokens?: number; totalTokens: number };
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  answerCharacters?: number;
  outcome: "ok" | "error";
  note?: string;
  durationMs: number;
};

/**
 * One provider call in the trace: tokens in and out, how the output split
 * between the answer and thinking (Sol reports its reasoning; for Claude it
 * is what the output holds beyond the answer, estimated from its length),
 * the cache, and the error a failed call ended on, with what it still cost.
 */
export function traceUsageLine(call: TraceCall): string {
  const usage = call.usage && call.usage.totalTokens > 0 ? call.usage : undefined;
  let split = "";
  if (usage && call.provider === "openai" && usage.thoughtsTokens) split = ` (${usage.thoughtsTokens} reasoning)`;
  if (usage && call.provider === "anthropic" && call.answerCharacters !== undefined) {
    const answer = Math.round(call.answerCharacters / CHARACTERS_PER_TOKEN);
    split = ` (≈${answer} answer, ≈${Math.max(0, usage.outputTokens - answer)} thinking)`;
  }
  const tokens = usage ? [
    `${usage.promptTokens} in`,
    `${usage.outputTokens} out${split}`,
    ...(call.cachedInputTokens ? [`${call.cachedInputTokens} cached`] : []),
    ...(call.cacheWriteTokens ? [`${call.cacheWriteTokens} written to cache`] : []),
  ] : [];
  const lead = call.outcome === "ok" ? tokens : [call.note ?? "failed", ...tokens];
  return [...lead, `${(call.durationMs / 1000).toFixed(1)} s`].join(" · ");
}
