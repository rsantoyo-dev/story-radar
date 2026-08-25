export const SOCIAL_PUBLICATION_PLATFORMS = [
  "instagram",
  "linkedin",
  "tiktok",
  "facebook",
  "x",
  "youtube",
  "newsletter",
] as const;

export type SocialPublicationPlatform =
  (typeof SOCIAL_PUBLICATION_PLATFORMS)[number];

export const SOCIAL_PUBLICATION_STATUSES = [
  "draft",
  "scheduled",
  "published",
] as const;

export type SocialPublicationStatus =
  (typeof SOCIAL_PUBLICATION_STATUSES)[number];

/**
 * The current publication state for one selected story on one platform.
 * A topic may track the same canonical story independently from another topic.
 */
export type StorySocialPublication = {
  id: string;
  topicId: string;
  storyId: string;
  platform: SocialPublicationPlatform;
  status: SocialPublicationStatus;
  scheduledAt?: Date;
  publishedAt?: Date;
  postUrl?: string;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type UpsertStorySocialPublicationInput = {
  platform: SocialPublicationPlatform;
  status: SocialPublicationStatus;
  scheduledAt?: Date;
  publishedAt?: Date;
  postUrl?: string;
  note?: string;
};

export function isSocialPublicationPlatform(
  value: unknown,
): value is SocialPublicationPlatform {
  return (
    typeof value === "string" &&
    (SOCIAL_PUBLICATION_PLATFORMS as readonly string[]).includes(value)
  );
}

export function isSocialPublicationStatus(
  value: unknown,
): value is SocialPublicationStatus {
  return (
    typeof value === "string" &&
    (SOCIAL_PUBLICATION_STATUSES as readonly string[]).includes(value)
  );
}
