/**
 * PUB-10: where a frozen package is delivered. One shared publishing pipeline
 * (candidate → frozen package → durable job) serves every channel; only the
 * connection, the Graph host and the provider calls differ.
 *
 * - `instagram-direct`: the topic's Instagram Login connection (graph.instagram.com).
 * - `instagram-page`: the Instagram Business account linked to the topic's
 *   Facebook Page, published with the Page token through graph.facebook.com.
 * - `facebook-page`: a post on the topic's Facebook Page.
 *
 * Browser-safe: no server imports.
 */
export const PUBLICATION_CHANNELS = ["instagram-direct", "instagram-page", "facebook-page"] as const;
export type PublicationChannel = (typeof PUBLICATION_CHANNELS)[number];

export const DEFAULT_PUBLICATION_CHANNEL: PublicationChannel = "instagram-direct";

export const PUBLICATION_CHANNEL_LABELS: Record<PublicationChannel, string> = {
  "instagram-direct": "Instagram (direct connection)",
  "instagram-page": "Instagram via Facebook Page",
  "facebook-page": "Facebook Page",
};

export function parsePublicationChannel(value: unknown): PublicationChannel | undefined {
  return typeof value === "string" && (PUBLICATION_CHANNELS as readonly string[]).includes(value)
    ? (value as PublicationChannel)
    : undefined;
}

/** The platform a reader sees the post on, for user-facing messages. */
export function publicationPlatformLabel(channel: PublicationChannel): "Instagram" | "Facebook" {
  return channel === "facebook-page" ? "Facebook" : "Instagram";
}

/** The account a destination publishes as: the Page for facebook-page, else the Instagram account. */
export function destinationAccountId(destination: {
  channel?: PublicationChannel;
  pageId?: string | null;
  igUserId: string | null;
}): string | null {
  return destination.channel === "facebook-page" ? (destination.pageId ?? null) : destination.igUserId;
}
