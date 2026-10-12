import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic } from "@/app/api/radar/radar-topic";
import { noStoreJson } from "@/app/api/radar/creative-route-error";
import { draft2ImagesArchive } from "@/app/modules/draft2/draft2-images";
import { DRAFT2_UUID_PATTERN, draft2ErrorResponse } from "../../draft2-route";

export const runtime = "nodejs";
// Up to ten slides, each read and checked against its record before it joins the archive.
export const maxDuration = 120;

/** The carousel's images as one ZIP: ?sessionId. Each slide's shown image in order; one not approved as it stands is a "-review" copy. */
export async function GET(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const sessionId = new URL(request.url).searchParams.get("sessionId") ?? "";
  if (!DRAFT2_UUID_PATTERN.test(sessionId)) return noStoreJson({ error: "sessionId must be a valid UUID" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    const { fileName, archive } = await draft2ImagesArchive({ topicId, sessionId });
    return new Response(new Uint8Array(archive), {
      headers: { "Content-Type": "application/zip", "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="${fileName}"`, "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    return draft2ErrorResponse(error, "download the Draft 2 images");
  }
}
