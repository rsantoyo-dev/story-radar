import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import { getMetaIntegrationHealth } from "@/app/modules/meta/meta-integration.config";
import { withApiLog } from "@/app/modules/observability/api-request-log";

/**
 * Deployment self-check for the Instagram integration. Reports whether
 * RADAR_APP_URL matches the origin serving this request, the exact OAuth
 * redirect URI to register in the Meta App Dashboard, and which server-side
 * settings are present. Values of secrets are never returned.
 */
async function route_GET(request: Request) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  return noStoreJson({
    ...getMetaIntegrationHealth(request),
    deployment: {
      ...(process.env.VERCEL_ENV ? { vercelEnv: process.env.VERCEL_ENV } : {}),
      ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? { productionHost: process.env.VERCEL_PROJECT_PRODUCTION_URL }
        : {}),
    },
  });
}

export const GET = withApiLog(route_GET);
