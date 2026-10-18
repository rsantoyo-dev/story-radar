import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic } from "@/app/api/radar/radar-topic";
import { noStoreJson } from "@/app/api/radar/creative-route-error";
import { placeOwnDraft2Scene } from "@/app/modules/draft2/draft2-images";
import { DRAFT2_UUID_PATTERN, draft2ErrorResponse } from "../../draft2-route";

export const runtime = "nodejs";

/** The largest scene the editor may upload. */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * A panorama's scene the editor uploads (multipart: sessionId, rights "own" or
 * "licensed", credit for a licensed one, image a JPG, PNG or WebP): the scene's next version, and every
 * slide cut from it at once. No model is called; returns the session.
 */
export async function POST(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  if (Number(request.headers.get("content-length")) > MAX_BYTES + 64 * 1024) return noStoreJson({ error: "The scene exceeds 25 MB." }, 413);
  const form = await request.formData().catch(() => null);
  const sessionId = typeof form?.get("sessionId") === "string" ? String(form!.get("sessionId")) : "";
  const rights = form?.get("rights");
  const image = form?.get("image");
  if (!DRAFT2_UUID_PATTERN.test(sessionId)) return noStoreJson({ error: "sessionId is required" }, 400);
  if (rights !== "own" && rights !== "licensed") return noStoreJson({ error: "Declare the scene your own or licensed to publish it." }, 400);
  const credit = typeof form?.get("credit") === "string" ? String(form!.get("credit")).replace(/\s+/gu, " ").trim().slice(0, 300) : "";
  if (rights === "licensed" && !credit) return noStoreJson({ error: "Say who made the scene and its license, for the caption's credit." }, 400);
  if (!(image instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(image.type) || image.size === 0 || image.size > MAX_BYTES) return noStoreJson({ error: "Upload a JPG, PNG or WebP scene up to 25 MB." }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    const session = await placeOwnDraft2Scene({ topicId, sessionId, image: new Uint8Array(await image.arrayBuffer()), name: image.name, rights, ...(rights === "licensed" ? { credit } : {}) });
    return noStoreJson({ session });
  } catch (error) {
    return draft2ErrorResponse(error, "use your scene");
  }
}
