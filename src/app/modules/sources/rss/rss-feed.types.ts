export type ContentStatus =
  | "excerpt"
  | "full"
  | "likely-full"
  | "missing"
  | "unavailable";

export type FeedContentSource = "rss" | "article";

/** The field that supplied the content, when a feed field was available. */
export type FeedContentField =
  | "content:encoded"
  | "content"
  | "description"
  | "summary"
  | "snippet";

export type FeedContent = {
  /** Canonical plain-text body used for storage, search, and rendering. */
  text?: string;
  source: FeedContentSource;
  field?: FeedContentField;
  status: ContentStatus;
};

/** Backwards-compatible local name for feed content. */
export type RssFeedContent = FeedContent;

export type RssFeedItem = {
  externalId: string;
  title: string;
  url: string;
  content: RssFeedContent;
  publishedAt?: Date;
};

export type RssFeedResult = {
  sourceId: string;
  sourceName: string;
  fetchedAt: Date;
  items: RssFeedItem[];
};
