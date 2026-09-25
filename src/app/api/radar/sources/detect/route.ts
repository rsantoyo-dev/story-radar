import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { jsonObject, noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import { detectUploadedPdf, detectUrlSource, SourceDetectionError } from "@/app/modules/sources/detect-source";

export const maxDuration = 120;

export async function POST(request: Request) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  try {
    const detected = request.headers.get("content-type")?.includes("multipart/form-data")
      ? await detectFile(request)
      : await detectUrlSource((await jsonObject(request)).url as string);
    return noStoreJson({
      sourceType: detected.contribution.sourceType,
      sourceUrl: detected.contribution.provenance.sourceUrl,
      title: detected.contribution.content.title,
      preview: detected.preview,
      fingerprint: detected.fingerprint,
      metadata: detected.contribution.metadata,
    });
  } catch (error) {
    if (error instanceof SourceDetectionError || error instanceof TypeError) {
      return noStoreJson({ error: error.message }, 400);
    }
    console.error("Failed to detect source", error);
    return noStoreJson({ error: "Unable to detect this source" }, 502);
  }
}

async function detectFile(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new SourceDetectionError("Choose a PDF file");
  return detectUploadedPdf(file);
}
