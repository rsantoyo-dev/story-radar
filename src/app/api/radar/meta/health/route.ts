import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import { getMetaIntegrationHealth } from "@/app/modules/meta/meta-integration.config";

/**
 * Deployment self-check for the Instagram integration. Reports whether
 * RADAR_APP_URL matches the origin serving this request, the exact OAuth
 * redirect URI to register in the Meta App Dashboard, and which server-side
 * settings are present. Values of secrets are never returned.
 */
export async function GET(request: Request) {
  const unauthorized = authorizeRadarCollector(request);
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
