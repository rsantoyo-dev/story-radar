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

/**
 * The Facebook Login for Business product's own App ID/Secret — a separate
 * product from the Instagram one above, registered on the same or a
 * different Meta App, never sharing META_APP_ID/META_APP_SECRET's slot (see
 * PUB-09).
 */
export function getDefaultMetaFacebookAppCredentials():
  | { appId: string; appSecret: string }
  | undefined {
  const appId = process.env.META_FACEBOOK_APP_ID?.trim();
  const appSecret = process.env.META_FACEBOOK_APP_SECRET?.trim();
  if (!appId || !appSecret) return undefined;
  return { appId, appSecret };
}

/** Optional: a Facebook Login for Business "Login Configuration" id, if the console requires one instead of a raw scope list. */
export function getMetaFacebookLoginConfigId(): string | undefined {
  return process.env.META_FACEBOOK_LOGIN_CONFIG_ID?.trim() || undefined;
}

export function getMetaFacebookOAuthRedirectUri(): string {
  return `${requireRadarAppUrl()}/api/radar/meta/facebook/callback`;
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

/**
 * Where the browser lands after the Facebook Login for Business dialog
 * completes. A successful connect does not mean "done" the way Instagram's
 * does — the editor still has to pick a Page — so this hands back an opaque
 * selectionId (never a token) the dashboard uses to open the picker, instead
 * of a bare "connected" flag.
 */
export function metaFacebookConnectReturnUrl(
  topicId: string,
  outcome: { selectionId: string } | { error: string },
): string {
  const url = new URL(requireRadarAppUrl());
  url.searchParams.set("metaTopicId", topicId);
  url.searchParams.set("metaChannel", "facebook");
  if ("selectionId" in outcome) {
    url.searchParams.set("metaFacebookSelectionId", outcome.selectionId);
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
    facebookAppConfigured: getDefaultMetaFacebookAppCredentials() !== undefined,
    stateSecretConfigured: Boolean(process.env.META_STATE_SECRET?.trim()),
    tokenEncryptionKeyConfigured: Boolean(
      process.env.META_TOKEN_ENCRYPTION_KEY?.trim(),
    ),
    publicationWorkerSecretConfigured: Boolean(
      process.env.INSTAGRAM_PUBLISH_WORKER_SECRET?.trim(),
    ),
  });
}
