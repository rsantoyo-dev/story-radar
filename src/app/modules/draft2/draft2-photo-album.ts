import "server-only";
import sharp from "sharp";
import { loadStoryReferenceImages, resolveStoryReferences } from "../stories/manage-story-photos";

/** The longest side of a photo as the planner and the writer see it: enough to read the scene, a fraction of the file. */
export const ALBUM_PREVIEW_SIZE = 640;

/**
 * A photo carousel's album as the models see it
 * (docs/features/draft2-photo-carousel.md): each of the story's photos as a
 * small JPEG preview, a data URL, in the album's order, so the planner places
 * photos it has seen and the writer tells what each one shows. Only photos
 * the editor allowed to the models reach the album.
 */
export async function albumPreviews(topicId: string, storyId: string, album: readonly { id: string }[]): Promise<string[]> {
  if (!album.length) return [];
  // One photo per resolution: a slide's references are three at most, and an album runs to nine.
  const references = (await Promise.all(album.map((photo) => resolveStoryReferences(topicId, storyId, [{ id: photo.id, purpose: "documentary-portrait" }])))).flat();
  const files = await loadStoryReferenceImages(references);
  return Promise.all(files.map(async (file) => {
    const preview = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 }).rotate().resize({ width: ALBUM_PREVIEW_SIZE, height: ALBUM_PREVIEW_SIZE, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
    return `data:image/jpeg;base64,${preview.toString("base64")}`;
  }));
}
