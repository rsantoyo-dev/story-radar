import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic } from "@/app/api/radar/radar-topic";
import { noStoreJson } from "@/app/api/radar/creative-route-error";
import { previewDraft2Words } from "@/app/modules/draft2/draft2-images";
import { parseWordsLayout } from "@/app/modules/draft2/draft2-images.types";
import { DRAFT2_UUID_PATTERN, draft2ErrorResponse } from "../../draft2-route";

export const runtime = "nodejs";

/**
 * A slide's words set with the layout the editor is trying ({ sessionId,
 * slide, layout }), on the image the slide shows: a JPEG of the finished
 * slide, nothing stored, no model called. X-Words-Bottom says where the block
 * of words ends, for the editor's box. Without a layout the program chooses
 * one, and X-Words-Layout carries it (URI-encoded JSON).
 */
export async function POST(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { sessionId?: unknown; slide?: unknown; layout?: unknown } | null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const slide = typeof body?.slide === "string" && /^[a-z0-9]{1,24}$/i.test(body.slide) ? body.slide : "";
  if (!DRAFT2_UUID_PATTERN.test(sessionId) || !slide) return noStoreJson({ error: "sessionId and slide are required" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    // No layout: a slide lettered before layouts were kept, the editor's starting point.
    const tried = body?.layout ? parseWordsLayout(body.layout) : undefined;
    const { image, bottom, layout } = await previewDraft2Words({ topicId, sessionId, slide, ...(tried ? { layout: tried } : {}) });
    return new Response(Buffer.from(image), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Words-Bottom": String(bottom), "X-Words-Layout": encodeURIComponent(JSON.stringify(layout)) } });
  } catch (error) {
    return draft2ErrorResponse(error, "preview the words");
  }
}
