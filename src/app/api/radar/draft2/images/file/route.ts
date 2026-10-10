import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic } from "@/app/api/radar/radar-topic";
import { noStoreJson } from "@/app/api/radar/creative-route-error";
import { draft2ImageFile } from "@/app/modules/draft2/draft2-images";
import { DRAFT2_UUID_PATTERN, draft2ErrorResponse } from "../../draft2-route";

export const runtime = "nodejs";

/** One finished Draft 2 image: ?sessionId&run&slide&version. Streamed privately; the browser never sees where it is stored. */
export async function GET(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const query = new URL(request.url).searchParams;
  const sessionId = query.get("sessionId") ?? "";
  const runId = query.get("run") ?? "";
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
