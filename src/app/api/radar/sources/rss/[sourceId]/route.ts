import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import { deleteUnlinkedRssSource, getRssSourceById } from "@/app/modules/topics/topic-catalog.repository";

type Context = { params: Promise<{ sourceId: string }> };

export async function DELETE(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  try {
    const { sourceId } = await context.params;
    if (!await getRssSourceById(sourceId)) return noStoreJson({ error: "Feed not found" }, 404);
    if (!await deleteUnlinkedRssSource(sourceId)) {
      return noStoreJson({ error: "Unlink this feed from every topic before deleting it" }, 409);
    }
    return noStoreJson({ deleted: true });
  } catch (error) {
    console.error("Failed to delete workspace RSS feed", error);
    return noStoreJson({ error: "Unable to delete feed" }, 500);
  }
}
