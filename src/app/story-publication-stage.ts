/** A selected Story may have separate current tracking and confirmed sends. */
export type StoryPublicationStageInput = {
  publications?: readonly {
    platform: string;
    status: "draft" | "scheduled" | "published";
    publishedAt?: string | Date;
    postUrl?: string;
  }[];
  confirmedPublications?: readonly {
    platform: string;
    publishedAt: string | Date;
    postUrl?: string;
  }[];
};

export type PublishedDestination = {
  platform: string;
  publishedAt?: string | Date;
  postUrl?: string;
  source: "confirmed" | "manual";
};

function publicationTime(value: string | Date | undefined): number {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

export function storyPublicationStage(story: StoryPublicationStageInput): {
  active: boolean;
  publishedDestinations: PublishedDestination[];
  pendingPlatforms: string[];
} {
  const publishedByPlatform = new Map<string, PublishedDestination>();
  const recordPublished = (publication: PublishedDestination) => {
    const previous = publishedByPlatform.get(publication.platform);
    if (!previous || publicationTime(publication.publishedAt) >= publicationTime(previous.publishedAt)) {
      publishedByPlatform.set(publication.platform, publication);
    }
  };

  for (const publication of story.publications ?? []) {
    if (publication.status === "published") recordPublished({ ...publication, source: "manual" });
  }
  for (const publication of story.confirmedPublications ?? []) {
    recordPublished({ ...publication, source: "confirmed" });
  }

  // A published result wins over a stale draft/schedule on the same platform.
  // Another platform with a pending record keeps the Story in Production.
  const pendingPlatforms = [...new Set((story.publications ?? [])
    .filter((publication) => publication.status !== "published" && !publishedByPlatform.has(publication.platform))
    .map((publication) => publication.platform))];

  return {
    active: publishedByPlatform.size === 0 || pendingPlatforms.length > 0,
    publishedDestinations: [...publishedByPlatform.values()].sort(
      (a, b) => publicationTime(b.publishedAt) - publicationTime(a.publishedAt),
    ),
    pendingPlatforms,
  };
}
