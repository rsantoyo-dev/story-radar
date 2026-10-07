/**
 * Retention classes for private R2 objects.
 *
 * The class is the first path segment after the configured prefix, so one R2
 * lifecycle rule per class expires everything under it
 * (`scripts/r2-lifecycle-rules.mjs` declares the days; `npm run r2:lifecycle`
 * applies them). Objects outside `retention/` (brand assets, characters,
 * documents, legacy keys) are never touched by these rules.
 *
 * | Class       | Kept for            | What goes here                               |
 * | ----------- | ------------------- | -------------------------------------------- |
 * | `7d`        | 7 days              | Frozen delivery JPEGs not (yet) published    |
 * | `180d`      | 180 days            | Approved generated images, edit bases        |
 * | `permanent` | until deleted by app | Delivery JPEGs of published packages         |
 */
export const R2_RETENTION_CLASSES = ["7d", "180d", "permanent"] as const;
export type R2RetentionClass = (typeof R2_RETENTION_CLASSES)[number];

/** `<prefix>/retention/<class>/`, the literal prefix a lifecycle rule filters on. */
export function retentionPrefix(objectPrefix: string, retention: R2RetentionClass): string {
  return `${normalizePrefix(objectPrefix)}/retention/${retention}/`;
}

export function retentionObjectKey(
  objectPrefix: string,
  retention: R2RetentionClass,
  segments: readonly string[],
): string {
  if (!segments.length) throw new Error("An R2 object key needs at least one segment");
  for (const segment of segments) {
    if (!/^[a-zA-Z0-9_.-]{1,160}$/.test(segment) || segment === "." || segment === "..") {
      throw new Error(`Invalid R2 key segment: ${segment}`);
    }
  }
  return `${retentionPrefix(objectPrefix, retention)}${segments.join("/")}`;
}

/** The retention class encoded in a key, or undefined for keys outside `retention/`. */
export function retentionClassOf(objectPrefix: string, objectKey: string): R2RetentionClass | undefined {
  return R2_RETENTION_CLASSES.find((retention) =>
    objectKey.startsWith(retentionPrefix(objectPrefix, retention)),
  );
}

export function approvedImageArchiveSegments(input: {
  topicId: string;
  assetId: string;
  version: number;
}): string[] {
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new Error("The asset version must be a positive integer");
  }
  return ["creative-approved", "topics", input.topicId, input.assetId, `v${input.version}.png`];
}

export function editBaseSegments(input: { topicId: string; id: string }): string[] {
  return ["edit-bases", "topics", input.topicId, `${input.id}.png`];
}

export function deliverySegments(
  kind: "publication-delivery" | "published",
  input: { topicId: string; packageId: string; unitOrder: number },
): string[] {
  if (!Number.isInteger(input.unitOrder) || input.unitOrder < 1) {
    throw new Error("The slide order must be a positive integer");
  }
  return [kind, "topics", input.topicId, input.packageId, `${input.unitOrder}.jpg`];
}

/** Only images fal generated are archived; other sources already live in R2. */
export function isFalImageUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "fal.media" || url.hostname.endsWith(".fal.media")) &&
      !url.port &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function normalizePrefix(objectPrefix: string): string {
  const normalized = objectPrefix.replace(/^\/+|\/+$/g, "");
  if (!normalized) throw new Error("The R2 object prefix is required");
  return normalized;
}
