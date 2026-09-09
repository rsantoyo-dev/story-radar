import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic, topicRequestErrorResponse } from "@/app/api/radar/radar-topic";
import { getCreativeProfile } from "@/app/modules/stories/creative-profile.repository";
import { googleMapsConfig, MapsPreviewError, parseMapsPreviewInput } from "@/app/modules/stories/google-maps-provider";
import { prepareGoogleMapsPreview } from "@/app/modules/stories/google-maps-preview";

export const runtime = "nodejs";
export const maxDuration = 60;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "Vary": "Authorization" } });
const errorReply = (error: unknown) => topicRequestErrorResponse(error) ?? reply({ error: error instanceof MapsPreviewError ? error.message : "The map preview could not be prepared." }, error instanceof MapsPreviewError ? error.status : 502);

export async function GET(request: Request) {
  const unauthorized = authorizeRadarCollector(request); if (unauthorized) return unauthorized;
  try {
    await requireActiveRequestTopic(request);
    const config = googleMapsConfig();
    return reply({ enabled: config.enabled, configured: Boolean(config.apiKey), signingConfigured: Boolean(config.signingSecret), maxPhotos: config.maxPhotos, maxPreviewsPerDay: config.maxPreviewsPerDay });
  } catch (error) { return errorReply(error); }
}

export async function POST(request: Request) {
  const unauthorized = authorizeRadarCollector(request); if (unauthorized) return unauthorized;
  try {
    const topicId = await requireActiveRequestTopic(request);
    // Bound streamed input too; a missing Content-Length must not bypass the limit.
    const reader = request.body?.getReader();
    if (!reader) throw new MapsPreviewError("A preview request is required.", 400);
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.length;
        if (size > 4_096) { await reader.cancel(); throw new MapsPreviewError("The preview request is too large.", 413); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    let value: unknown;
    try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new MapsPreviewError("The preview request must be valid JSON.", 400); }
    const input = parseMapsPreviewInput(value);
    const profile = await getCreativeProfile(topicId);
    return reply(await prepareGoogleMapsPreview(topicId, input, profile, { signal: request.signal }));
  } catch (error) { return errorReply(error); }
}
