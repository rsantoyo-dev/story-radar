export class StoryContentRecoveryInputError extends Error {}
export type StoryContentRecoveryInput = { sourceUrl: string; text?: string; confirmed: true };

export function parseStoryContentRecoveryInput(value: unknown): StoryContentRecoveryInput {
  if (!value || typeof value !== "object") throw new StoryContentRecoveryInputError("Provide a source URL and confirm the article.");
  const input = value as Record<string, unknown>;
  if (input.confirmed !== true) throw new StoryContentRecoveryInputError("Confirm that this source contains the same article.");
  let url: URL;
  try { url = new URL(String(input.sourceUrl ?? "")); } catch { throw new StoryContentRecoveryInputError("Enter a valid source URL."); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new StoryContentRecoveryInputError("Use an HTTP(S) source URL without credentials.");
  if (url.href.length > 2048) throw new StoryContentRecoveryInputError("The source URL is too long.");
  if (input.text !== undefined && (typeof input.text !== "string" || input.text.length > 100_000)) throw new StoryContentRecoveryInputError("Article text must be at most 100,000 characters.");
  const text = typeof input.text === "string" ? input.text.trim() : undefined;
  if (input.text !== undefined && (!text || text.length < 300 || text.split(/\s+/u).length < 50)) throw new StoryContentRecoveryInputError("Paste at least 50 words and 300 characters of article text.");
  return { sourceUrl: url.href, ...(text ? { text } : {}), confirmed: true };
}
