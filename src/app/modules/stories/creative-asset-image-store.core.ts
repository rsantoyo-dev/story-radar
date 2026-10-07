import { isFalImageUrl } from "./r2-retention";

/**
 * Where a generated image's bytes live. fal keeps every generated image for
 * 30 days; an approved one is also copied to R2 (180-day class) so approval,
 * download, publishing and edits keep working after fal deletes it.
 *
 * This core has no storage dependencies so it can be tested directly;
 * `creative-image-source.ts` wires it to R2 and fal.
 */
export type AssetImageRef = {
  topicId: string;
  assetId: string;
  version: number;
  imageUrl?: string | null;
};

export type AssetImageStoreDependencies = {
  archiveKey: (ref: AssetImageRef) => string;
  exists: (objectKey: string) => Promise<boolean>;
  /** Undefined when the object does not exist. */
  readArchive: (objectKey: string) => Promise<File | undefined>;
  writeArchive: (objectKey: string, file: File) => Promise<void>;
  /** Downloads the generated image from fal. */
  readSource: (url: string) => Promise<File>;
};

export type ArchiveOutcome = "archived" | "present" | "not-archivable";

export function createAssetImageStore(deps: AssetImageStoreDependencies) {
  /** Copies the image to R2 unless it is already there. Idempotent. */
  async function archive(ref: AssetImageRef): Promise<ArchiveOutcome> {
    if (!isFalImageUrl(ref.imageUrl)) return "not-archivable";
    const objectKey = deps.archiveKey(ref);
    if (await deps.exists(objectKey)) return "present";
    const file = await deps.readSource(ref.imageUrl);
    await deps.writeArchive(objectKey, file);
    return "archived";
  }

  /**
   * The R2 copy when there is one, otherwise fal. R2 problems (not
   * configured, unreachable) fall back to fal rather than failing a read
   * that fal can still serve.
   */
  async function read(ref: AssetImageRef): Promise<File> {
    let archiveError: unknown;
    try {
      const archived = await deps.readArchive(deps.archiveKey(ref));
      if (archived) return archived;
    } catch (error) {
      archiveError = error;
    }
    if (!ref.imageUrl) {
      throw archiveError instanceof Error ? archiveError : new Error("This image has no stored file.");
    }
    return deps.readSource(ref.imageUrl);
  }

  return { archive, read };
}
