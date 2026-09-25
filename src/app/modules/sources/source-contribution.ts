/** A source adapter's factual handoff before editorial evaluation. */
export type SourceContribution = {
  sourceType: "rss" | "article" | "document";
  externalId: string;
  acquiredAt: Date;
  provenance: {
    sourceUrl: string;
    contentHash?: string;
    originalFilename?: string;
  };
  content: {
    title?: string;
    text?: string;
    mimeType: string;
  };
  metadata: Record<string, string | number | boolean | null>;
};

export function sourceContribution(input: {
  sourceType: SourceContribution["sourceType"];
  sourceUrl: string;
  acquiredAt: Date;
  title?: string;
  text?: string;
  mimeType: string;
  contentHash?: string;
  originalFilename?: string;
  metadata?: SourceContribution["metadata"];
}): SourceContribution {
  const sourceUrl = new URL(input.sourceUrl);
  if (!["http:", "https:"].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password) {
    throw new Error("Source provenance requires a public HTTP(S) URL without credentials");
  }
  if (!Number.isFinite(input.acquiredAt.getTime())) throw new Error("Acquisition time is invalid");
  sourceUrl.hash = "";
  const normalizedUrl = sourceUrl.href;
  const contentHash = input.contentHash?.trim().toLowerCase();
  if (contentHash && !/^[a-f0-9]{64}$/.test(contentHash)) throw new Error("Content hash is invalid");
  if (!input.mimeType.trim()) throw new Error("Source content type is required");

  return {
    sourceType: input.sourceType,
    externalId: `${input.sourceType}:${input.originalFilename && contentHash ? contentHash : normalizedUrl}`,
    acquiredAt: input.acquiredAt,
    provenance: {
      sourceUrl: normalizedUrl,
      ...(contentHash ? { contentHash } : {}),
      ...(input.originalFilename ? { originalFilename: input.originalFilename } : {}),
    },
    content: {
      ...(input.title?.trim() ? { title: input.title.trim() } : {}),
      ...(input.text?.trim() ? { text: input.text.trim() } : {}),
      mimeType: input.mimeType.trim().toLowerCase(),
    },
    metadata: { ...input.metadata },
  };
}
