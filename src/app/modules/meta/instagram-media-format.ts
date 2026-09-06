/**
 * Maps an Instagram media object's `media_type` / `media_product_type` to the
 * editorial format the IG-03 gallery filters and labels by. Pure — unit-tested.
 */

export const INSTAGRAM_MEDIA_FORMATS = [
  "image",
  "carousel",
  "reel",
  "video",
] as const;
export type InstagramMediaFormat = (typeof INSTAGRAM_MEDIA_FORMATS)[number];

export function isInstagramMediaFormat(
  value: unknown,
): value is InstagramMediaFormat {
  return INSTAGRAM_MEDIA_FORMATS.includes(value as InstagramMediaFormat);
}

export function instagramMediaFormat(node: {
  mediaType: string | null | undefined;
  mediaProductType?: string | null | undefined;
}): InstagramMediaFormat {
  const type = (node.mediaType ?? "").toUpperCase();
  const product = (node.mediaProductType ?? "").toUpperCase();
  if (type === "CAROUSEL_ALBUM") return "carousel";
  if (type === "VIDEO") return product === "REELS" ? "reel" : "video";
  return "image";
}
