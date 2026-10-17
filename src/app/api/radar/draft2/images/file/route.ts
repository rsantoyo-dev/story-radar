import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic } from "@/app/api/radar/radar-topic";
import { noStoreJson } from "@/app/api/radar/creative-route-error";
import { draft2ImageFile, draft2SceneFile } from "@/app/modules/draft2/draft2-images";
import { DRAFT2_UUID_PATTERN, draft2ErrorResponse } from "../../draft2-route";

export const runtime = "nodejs";

/**
 * One finished Draft 2 image: ?sessionId&run&slide&version. Streamed
 * privately; the browser never sees where it is stored. With plate=master, a
 * panorama's scene (its version), drawn with its cuts, or with the cuts the
 * editor is trying (x, y, scale).
 */
export async function GET(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const query = new URL(request.url).searchParams;
  const sessionId = query.get("sessionId") ?? "";
  const runId = query.get("run") ?? "";
  if (query.get("plate") === "master") {
    const version = Number(query.get("version") ?? "1");
    if (!DRAFT2_UUID_PATTERN.test(sessionId) || !DRAFT2_UUID_PATTERN.test(runId) || !Number.isInteger(version) || version < 1) {
      return noStoreJson({ error: "sessionId, run and version are required" }, 400);
    }
    const tried = query.has("x") || query.has("y") || query.has("scale")
      ? { x: Number(query.get("x") ?? 0) || 0, y: Number(query.get("y") ?? 0) || 0, scale: Number(query.get("scale") ?? 1) || 1 }
      : undefined;
    try {
      const topicId = await requireActiveRequestTopic(request);
      const image = await draft2SceneFile({ topicId, sessionId, runId, version, ...(tried ? { offset: tried } : {}) });
      return new Response(Buffer.from(image), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    } catch (error) {
      return draft2ErrorResponse(error, "load the scene");
    }
  }
  const slide = query.get("slide") ?? "";
  const version = Number(query.get("version"));
  if (!DRAFT2_UUID_PATTERN.test(sessionId) || !DRAFT2_UUID_PATTERN.test(runId) || !/^[a-z0-9]{1,24}$/i.test(slide) || !Number.isInteger(version) || version < 1) {
    return noStoreJson({ error: "sessionId, run, slide and version are required" }, 400);
  }
  try {
    const topicId = await requireActiveRequestTopic(request);
    const file = await draft2ImageFile({ topicId, sessionId, runId, slide, version });
    return new Response(await file.arrayBuffer(), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return draft2ErrorResponse(error, "load the Draft 2 image");
  }
}
