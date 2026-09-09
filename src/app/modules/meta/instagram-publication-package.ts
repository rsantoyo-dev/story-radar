/**
 * PUB-03 pure helpers: the Instagram image limits, the deliverable-package
 * hash, delivery tokens and the human-readable description of the technical
 * transforms applied when freezing a slide. No I/O, unit-tested directly.
 */

import { createHash, randomBytes } from "node:crypto";

export class PublicationPackageValidationError extends Error {}

export type PublicationMediaType = "image" | "carousel";

export type MetaImageLimits = {
  /** Exact aspect ratio Instagram feed carousels/photos use in this MVP. */
  width: number;
  height: number;
  maxBytes: number;
  /** Source formats we accept before re-encoding to JPEG. */
  sourceFormats: readonly string[];
  minCarouselSlides: number;
  maxCarouselSlides: number;
};

const DEFAULT_LIMITS: MetaImageLimits = {
  width: 1080,
  height: 1350,
  maxBytes: 8 * 1024 * 1024,
  sourceFormats: ["jpeg", "png", "webp"],
  minCarouselSlides: 2,
  maxCarouselSlides: 10,
};

export function getMetaImageLimits(): MetaImageLimits {
  const maxBytes = Number(process.env.IG_PUBLISH_MAX_IMAGE_BYTES);
  return {
    ...DEFAULT_LIMITS,
    ...(Number.isInteger(maxBytes) && maxBytes > 0 ? { maxBytes } : {}),
  };
}

export function assertPublishableImage(
  image: { width?: number | null; height?: number | null; byteSize: number; format?: string | null },
  limits: MetaImageLimits = getMetaImageLimits(),
): void {
  const { width, height, byteSize, format } = image;
  if (!format || !limits.sourceFormats.includes(format)) {
    throw new PublicationPackageValidationError(
      `The image format ${format ?? "(unknown)"} is not one of ${limits.sourceFormats.join(", ")}.`,
    );
  }
  if (width !== limits.width || height !== limits.height) {
    throw new PublicationPackageValidationError(
      `The image must be exactly ${limits.width}×${limits.height} (4:5); got ${width ?? "?"}×${height ?? "?"}.`,
    );
  }
  if (byteSize <= 0 || byteSize > limits.maxBytes) {
    throw new PublicationPackageValidationError(
      `The delivery JPEG is ${(byteSize / 1024 / 1024).toFixed(2)} MB; Instagram allows up to ${(limits.maxBytes / 1024 / 1024).toFixed(0)} MB.`,
    );
  }
}

export function resolvePublicationMediaType(
  slideCount: number,
  limits: MetaImageLimits = getMetaImageLimits(),
): PublicationMediaType {
  if (slideCount === 1) return "image";
  if (slideCount >= limits.minCarouselSlides && slideCount <= limits.maxCarouselSlides) {
    return "carousel";
  }
  throw new PublicationPackageValidationError(
    slideCount < 1
      ? "A publication package needs at least one approved image."
      : `Instagram carousels allow ${limits.minCarouselSlides}–${limits.maxCarouselSlides} images; this set has ${slideCount}.`,
  );
}

export function computePackageHash(input: {
  caption: string;
  hashtags: readonly string[];
  orderedSlideSha256: readonly string[];
  igUserId: string | null;
  connectionVersion: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        contract: "instagram-publication-package-v1",
        caption: input.caption,
        hashtags: [...input.hashtags],
        slides: [...input.orderedSlideSha256],
        igUserId: input.igUserId,
        connectionVersion: input.connectionVersion,
      }),
    )
    .digest("hex");
}

/** URL-safe, unguessable capability for the public delivery route. */
export function newDeliveryToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Describes the technical transform applied to a slide. A resize would alter
 * the approved representation beyond authorized encoding, so it is not a note —
 * the caller must treat `resized: true` as a blocker.
 */
export function describeImageTransform(input: {
  sourceFormat: string;
  resized: boolean;
  quality: number;
}): string {
  if (input.resized) {
    return "BLOCKED: the approved image is not 1080×1350 and would need resizing.";
  }
  const from = input.sourceFormat.toUpperCase();
  return from === "JPEG"
    ? `JPEG re-encoded at q${input.quality} 4:4:4; EXIF/GPS metadata removed; no rescaling, crop or rotation.`
    : `${from} → JPEG q${input.quality} 4:4:4; EXIF/GPS metadata removed; no rescaling, crop or rotation.`;
}
