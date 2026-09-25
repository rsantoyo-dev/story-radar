/**
 * Environment self-check for the Instagram integration.
 *
 * The OAuth redirect URI, the post-login return URL and the public delivery
 * links are all derived from RADAR_APP_URL. When that value points somewhere
 * other than the origin actually serving the app (a stale ngrok tunnel copied
 * into a Vercel project, for example), Instagram sends the browser back to the
 * wrong host and Meta downloads images from the wrong host, and nothing in
 * the UI explains why. This module turns that into an explicit, actionable
 * problem list. No "server-only" import: pure logic over already-read values,
 * unit-tested directly; the env and header reads live in server code.
 */

export const META_OAUTH_CALLBACK_PATH = "/api/radar/meta/callback";

export type MetaIntegrationProblemCode =
  | "app-url-missing"
  | "app-url-invalid"
  | "app-url-not-https"
  | "app-url-mismatch"
  | "app-url-tunnel"
  | "shared-app-missing"
  | "state-secret-missing"
  | "token-key-missing"
  | "worker-secret-missing";

export type MetaIntegrationProblem = {
  code: MetaIntegrationProblemCode;
  severity: "error" | "warning" | "info";
  message: string;
};

export type MetaIntegrationHealthInput = {
  /** Raw RADAR_APP_URL value. */
  configuredAppUrl: string | undefined;
  /** Origin the current request was served from, if it could be derived. */
  requestOrigin: string | undefined;
  sharedAppConfigured: boolean;
  stateSecretConfigured: boolean;
  tokenEncryptionKeyConfigured: boolean;
  publicationWorkerSecretConfigured: boolean;
};

export type MetaIntegrationHealth = {
  ok: boolean;
  requestOrigin?: string;
  configuredAppUrl?: string;
  /** Exact value to register as a valid OAuth redirect URI in the Meta App Dashboard. */
  redirectUri?: string;
  appUrlMatchesRequest?: boolean;
  problems: MetaIntegrationProblem[];
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

/** Parses a URL and returns its origin, or undefined when it is not absolute. */
export function normalizeOrigin(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed).origin;
  } catch {
    return undefined;
  }
}

/**
 * Origin the browser used to reach this request. Behind Vercel (and most
 * reverse proxies) the public host and scheme arrive in the x-forwarded-*
 * headers; without a proxy the Host header and the request URL are enough.
 * Only the first value of a comma-separated forwarded header is used.
 */
export function requestOriginFromHeaders(
  headers: Headers,
  requestUrl: string,
): string | undefined {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return undefined;
  }
  const forwardedHost = firstHeaderValue(headers.get("x-forwarded-host"));
  const host = forwardedHost ?? headers.get("host")?.trim() ?? url.host;
  const forwardedProto = firstHeaderValue(headers.get("x-forwarded-proto"));
  const proto = forwardedProto ?? url.protocol.replace(/:$/u, "");
  if (!host || (proto !== "http" && proto !== "https")) return undefined;
  return normalizeOrigin(`${proto}://${host}`);
}

function firstHeaderValue(value: string | null): string | undefined {
  const first = value?.split(",")[0]?.trim();
  return first || undefined;
}

export function deriveMetaIntegrationHealth(
  input: MetaIntegrationHealthInput,
): MetaIntegrationHealth {
  const problems: MetaIntegrationProblem[] = [];
  const rawAppUrl = input.configuredAppUrl?.trim();
  const configuredOrigin = normalizeOrigin(rawAppUrl);
  const requestOrigin = normalizeOrigin(input.requestOrigin);

  if (!rawAppUrl) {
    problems.push({
      code: "app-url-missing",
      severity: "error",
      message:
        "RADAR_APP_URL is not configured. Instagram cannot send the browser back after login and Meta cannot download delivery files.",
    });
  } else if (!configuredOrigin) {
    problems.push({
      code: "app-url-invalid",
      severity: "error",
      message: `RADAR_APP_URL (${rawAppUrl}) is not an absolute URL.`,
    });
  } else {
    const configured = new URL(configuredOrigin);
    if (configured.protocol !== "https:") {
      problems.push({
        code: "app-url-not-https",
        severity: "error",
        message: `RADAR_APP_URL must use https (Instagram rejects http redirect URIs); it is ${configuredOrigin}.`,
      });
    }
    if (requestOrigin && requestOrigin !== configuredOrigin) {
      const requestHost = new URL(requestOrigin).hostname;
      if (isLoopbackHost(requestHost)) {
        problems.push({
          code: "app-url-tunnel",
          severity: "info",
          message: `You are browsing on ${requestOrigin} while RADAR_APP_URL is ${configuredOrigin}. That is the tunnel setup: Instagram will return the browser to ${configuredOrigin}, so keep that tunnel running.`,
        });
      } else {
        problems.push({
          code: "app-url-mismatch",
          severity: "error",
          message:
            `This app is served from ${requestOrigin} but RADAR_APP_URL is ${configuredOrigin}. ` +
            `Instagram will send the browser back to ${configuredOrigin} and Meta will fetch delivery files from there. ` +
            `Set RADAR_APP_URL=${requestOrigin} in this deployment's environment, redeploy, and register ` +
            `${requestOrigin}${META_OAUTH_CALLBACK_PATH} as a valid OAuth redirect URI in the Meta App Dashboard.`,
        });
      }
    }
  }

  if (!input.sharedAppConfigured) {
    problems.push({
      code: "shared-app-missing",
      severity: "warning",
      message:
        "META_APP_ID / META_APP_SECRET are not configured. Only topics with their own Instagram App (Advanced) can connect.",
    });
  }
  if (!input.stateSecretConfigured) {
    problems.push({
      code: "state-secret-missing",
      severity: "error",
      message: "META_STATE_SECRET is not configured; the OAuth state cannot be signed.",
    });
  }
  if (!input.tokenEncryptionKeyConfigured) {
    problems.push({
      code: "token-key-missing",
      severity: "error",
      message: "META_TOKEN_ENCRYPTION_KEY is not configured; Instagram tokens cannot be stored.",
    });
  }
  if (!input.publicationWorkerSecretConfigured) {
    problems.push({
      code: "worker-secret-missing",
      severity: "warning",
      message:
        "INSTAGRAM_PUBLISH_WORKER_SECRET is not configured. Publication orders only advance while an editor keeps the panel open; no scheduler can resume them.",
    });
  }

  return {
    ok: !problems.some((problem) => problem.severity === "error"),
    ...(requestOrigin ? { requestOrigin } : {}),
    ...(configuredOrigin ? { configuredAppUrl: configuredOrigin } : {}),
    ...(configuredOrigin
      ? { redirectUri: `${configuredOrigin}${META_OAUTH_CALLBACK_PATH}` }
      : {}),
    ...(requestOrigin && configuredOrigin
      ? { appUrlMatchesRequest: requestOrigin === configuredOrigin }
      : {}),
    problems,
  };
}
