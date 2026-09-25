import "server-only";

import {
  deriveMetaIntegrationHealth,
  requestOriginFromHeaders,
  type MetaIntegrationHealth,
} from "./meta-integration-health";

export class MetaIntegrationConfigError extends Error {}

/**
 * The Instagram App credentials used for OAuth when a topic has not
 * configured its own. This is the "Identificador/Clave secreta de la app de
 * Instagram" shown in the Meta App Dashboard's Instagram product settings —
 * a separate ID/secret pair from the parent Meta App's own App ID/Secret.
 */
export function getDefaultMetaAppCredentials():
  | { appId: string; appSecret: string }
  | undefined {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) return undefined;
  return { appId, appSecret };
}

/**
 * The exact URL registered as the Instagram business login's redirect URI in
 * the Meta App Dashboard. Derived from RADAR_APP_URL rather than duplicated in
 * its own env var, but it must still match byte-for-byte what is configured
 * there, and Instagram requires it to use https — even for localhost.
 */
export function getMetaOAuthRedirectUri(): string {
  return `${requireRadarAppUrl()}/api/radar/meta/callback`;
}

/** Where the browser lands after the OAuth dialog completes or fails. */
export function metaConnectReturnUrl(
  topicId: string,
  outcome: { connected: true } | { error: string },
): string {
  const url = new URL(requireRadarAppUrl());
  url.searchParams.set("metaTopicId", topicId);
  if ("connected" in outcome) {
    url.searchParams.set("metaConnected", "1");
  } else {
    url.searchParams.set("metaError", outcome.error);
  }
  return url.toString();
}

export function requireMetaStateSecretFromEnv(): string {
  const secret = process.env.META_STATE_SECRET?.trim();
  if (!secret) {
    throw new MetaIntegrationConfigError(
      "META_STATE_SECRET is not configured",
    );
  }
  return secret;
}

export function requireMetaTokenEncryptionKeyFromEnv(): string {
  const key = process.env.META_TOKEN_ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new MetaIntegrationConfigError(
      "META_TOKEN_ENCRYPTION_KEY is not configured",
    );
  }
  return key;
}

function requireRadarAppUrl(): string {
  const appUrl = process.env.RADAR_APP_URL?.trim();
  if (!appUrl) {
    throw new MetaIntegrationConfigError("RADAR_APP_URL is not configured");
  }
  return appUrl.replace(/\/+$/u, "");
}

/**
 * Environment self-check for the request's deployment: compares RADAR_APP_URL
 * with the origin that actually served this request and reports which
 * server-side settings are present (never their values).
 */
export function getMetaIntegrationHealth(request: Request): MetaIntegrationHealth {
  return deriveMetaIntegrationHealth({
    configuredAppUrl: process.env.RADAR_APP_URL,
    requestOrigin: requestOriginFromHeaders(request.headers, request.url),
    sharedAppConfigured: getDefaultMetaAppCredentials() !== undefined,
    stateSecretConfigured: Boolean(process.env.META_STATE_SECRET?.trim()),
    tokenEncryptionKeyConfigured: Boolean(
      process.env.META_TOKEN_ENCRYPTION_KEY?.trim(),
    ),
    publicationWorkerSecretConfigured: Boolean(
      process.env.INSTAGRAM_PUBLISH_WORKER_SECRET?.trim(),
    ),
  });
}
