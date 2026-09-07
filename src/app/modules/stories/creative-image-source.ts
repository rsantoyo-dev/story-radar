import "server-only";
import { request } from "node:https";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { lookupPublicAddress } from "../sources/rss/fetch-rss-feed";
import { buildCreativeBrandAssetObjectKey, putPrivateR2Object, readPrivateR2ImageFile } from "./r2-storage";
import type { GenerationReferences } from "./creative-brand-generation";

/** Only server-stored Fal output URLs; no redirects or arbitrary client URLs. */
export async function readGeneratedImage(urlValue: string): Promise<File> {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || !(url.hostname === "fal.media" || url.hostname.endsWith(".fal.media")) || url.port || url.username || url.password) {
    throw new Error("The stored image URL is not a supported Fal source.");
  }
  const bytes = await new Promise<Buffer>((resolve, reject) => {
    const req = request(url, { signal: AbortSignal.timeout(20_000), lookup: lookupPublicAddress }, response => {
      if (response.statusCode !== 200) { response.destroy(); reject(new Error("The source image is unavailable or expired.")); return; }
      let size = 0; const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 20 * 1024 * 1024) response.destroy(new Error("The source image is too large."));
        else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", () => reject(new Error("The source image could not be downloaded.")));
    req.end();
  });
  const image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "error" });
  const metadata = await image.metadata();
  if (!["png", "jpeg", "webp"].includes(metadata.format || "")) throw new Error("Unsupported source image.");
  const png = await image.png().toBuffer();
  if (png.length > 20 * 1024 * 1024) throw new Error("The source image is too large.");
  return new File([new Uint8Array(png)], "image.png", { type: "image/png" });
}

export async function storeEditBase(topicId: string, assetId: string, version: number, url: string): Promise<NonNullable<GenerationReferences["base"]>> {
  const file = await readGeneratedImage(url);
  const body = new Uint8Array(await file.arrayBuffer());
  const objectKey = buildCreativeBrandAssetObjectKey({ topicId, assetId: randomUUID() });
  await putPrivateR2Object({ objectKey, body, contentType: file.type, signal: AbortSignal.timeout(20_000) });
  return { assetId, version, objectKey, sha256: createHash("sha256").update(body).digest("hex"), contentType: file.type, fileName: file.name };
}
export async function readEditBase(base: NonNullable<GenerationReferences["base"]>): Promise<File> {
  const file = await readPrivateR2ImageFile({ ...base, signal: AbortSignal.timeout(20_000) });
  if (createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex") !== base.sha256) throw new Error("The edit source does not match its snapshot.");
  return file;
}
