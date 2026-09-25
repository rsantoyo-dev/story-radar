import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import { listWorkspaceSourceCatalog } from "@/app/modules/sources/workspace-source-catalog.repository";

export async function GET(request: Request) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    return noStoreJson(await listWorkspaceSourceCatalog());
  } catch (error) {
    console.error("Failed to load workspace sources", error);
    return noStoreJson({ error: "Unable to load workspace sources" }, 500);
  }
}
