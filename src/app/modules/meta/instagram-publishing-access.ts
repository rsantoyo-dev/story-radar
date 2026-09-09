import type { PublicationDestination } from "./instagram-publication-candidate";
import { MetaGraphApiError } from "./meta-token-response";
import { classifyMetaGraphError } from "./meta-verification";

export const INSTAGRAM_PUBLISHING_SCOPE = "instagram_business_content_publish";
export const PUBLISHING_ACCESS_TTL_MS = 5 * 60 * 1_000;
export type PublishingAccessState = "disconnected" | "needs-reconnect" | "missing-permission" | "unverified" | "enabled" | "quota-exhausted" | "rate-limited" | "unavailable" | "connection-changed";
export type PublishingQuota = { used: number; total: number; durationSeconds: number; remaining: number };
export type PublishingIdentity = { topicId: string; igUserId: string | null; connectionVersion: string; appConfigurationVersion?: string };
/** Safe response. This is evidence of a read-only preflight, never an authorization to send. */
export type PublishingAccess = {
  state: PublishingAccessState;
  message: string;
  identity: PublishingIdentity;
  apiVersion: string;
  checkedAt: string;
  expiresAt: string;
  quota?: PublishingQuota;
};
export type PublishingAccessContext = {
  topicId: string;
  destination: PublicationDestination;
  accessToken?: string;
};

export function publishingIdentity(topicId: string, destination: PublicationDestination): PublishingIdentity {
  return { topicId, igUserId: destination.igUserId, connectionVersion: destination.connectionVersion, appConfigurationVersion: destination.appConfigurationVersion };
}
export function samePublishingIdentity(a: PublishingIdentity, b: PublishingIdentity): boolean {
  return a.topicId === b.topicId && a.igUserId === b.igUserId && a.connectionVersion === b.connectionVersion && a.appConfigurationVersion === b.appConfigurationVersion;
}
export function publishingPreflightState(destination: PublicationDestination): PublishingAccessState {
  if (!destination.connected || !destination.igUserId) return "disconnected";
  if (destination.expired) return "needs-reconnect";
  // An omitted OAuth permissions field is unknown, not an explicit denial.
  if (destination.grantedPermissionsKnown === false) return "unverified";
  if (!destination.hasPublishingPermission || destination.hasBasicPermission !== true) return "missing-permission";
  return "unverified";
}
export const PUBLISHING_ACCESS_MESSAGES: Record<PublishingAccessState, string> = {
  disconnected: "Connect an Instagram professional account for this topic.",
  "needs-reconnect": "The Instagram authorization is expired or invalid. Reconnect this account.",
  "missing-permission": "Publishing access is missing or denied. Check instagram_business_basic and instagram_business_content_publish, App Review / Advanced Access for customer accounts, or app roles for accounts you manage; then reconnect and verify again.",
  unverified: "Publishing access has not been checked. Insights access does not verify publishing.",
  enabled: "Instagram accepted the live publishing quota check for this account.",
  "quota-exhausted": "Instagram reports no publishing quota remaining. Check again later.",
  "rate-limited": "Instagram limited this check. Wait before verifying again.",
  unavailable: "Publishing access could not be verified. Try again; no content was sent.",
  "connection-changed": "The account or connection changed during verification. Verify the current connection again.",
};

function record(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
export function parsePublishingQuota(payload: unknown): PublishingQuota {
  const data = record(payload) ? payload.data : undefined;
  const item = Array.isArray(data) && data.length === 1 ? data[0] : undefined;
  const config = record(item) ? item.config : undefined;
  if (!record(item) || !record(config) || !nonnegativeInteger(item.quota_usage) || !nonnegativeInteger(config.quota_total) || !nonnegativeInteger(config.quota_duration) || config.quota_duration === 0) {
    throw new MetaGraphApiError("Instagram returned an invalid publishing quota response", 200);
  }
  return { used: item.quota_usage, total: config.quota_total, durationSeconds: config.quota_duration, remaining: Math.max(0, config.quota_total - item.quota_usage) };
}
function nonnegativeInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }

export function publishingFailureState(error: unknown): PublishingAccessState {
  if (!(error instanceof MetaGraphApiError)) return "unavailable";
  const kind = classifyMetaGraphError(error.graphError);
  if (kind === "auth" || error.status === 401) return "needs-reconnect";
  const body = record(error.graphError) ? error.graphError : undefined;
  const nested = body && record(body.error) ? body.error : body;
  if (error.status === 429 || [4, 17, 32, 613, 80002].includes(Number(nested?.code))) return "rate-limited";
  if (kind === "permission" || error.status === 403) return "missing-permission";
  return "unavailable";
}

export async function verifyPublishingAccess(deps: {
  topicId: string;
  apiVersion: string;
  load: () => Promise<PublishingAccessContext>;
  probe: (igUserId: string, token: string) => Promise<PublishingQuota>;
  expectedIdentity?: PublishingIdentity;
  now?: () => number;
}): Promise<PublishingAccess> {
  const now = deps.now ?? Date.now;
  const initial = await deps.load();
  const identity = publishingIdentity(initial.topicId, initial.destination);
  let state = publishingPreflightState(initial.destination);
  let quota: PublishingQuota | undefined;
  if (initial.topicId !== deps.topicId || (deps.expectedIdentity && !samePublishingIdentity(deps.expectedIdentity, identity))) state = "connection-changed";
  if (state === "unverified") {
    try {
      if (!initial.accessToken) throw new Error("Token unavailable");
      quota = await deps.probe(initial.destination.igUserId!, initial.accessToken);
      state = quota.remaining > 0 ? "enabled" : "quota-exhausted";
    } catch (error) { state = publishingFailureState(error); }
  }
  // Even preflight failures belong to the captured connection, never its replacement.
  try {
    const latest = await deps.load();
    if (!samePublishingIdentity(identity, publishingIdentity(latest.topicId, latest.destination)) || latest.destination.expired !== initial.destination.expired || latest.destination.connected !== initial.destination.connected || latest.destination.hasPublishingPermission !== initial.destination.hasPublishingPermission || latest.destination.hasBasicPermission !== initial.destination.hasBasicPermission || latest.destination.grantedPermissionsKnown !== initial.destination.grantedPermissionsKnown) {
      state = "connection-changed"; quota = undefined;
    }
  } catch { state = "unavailable"; quota = undefined; }
  const checked = now();
  return { state, message: PUBLISHING_ACCESS_MESSAGES[state], identity, apiVersion: deps.apiVersion, checkedAt: new Date(checked).toISOString(), expiresAt: new Date(checked + PUBLISHING_ACCESS_TTL_MS).toISOString(), ...(quota ? { quota } : {}) };
}

/** Cached browser output must never be accepted as current server evidence. */
export function publishingAccessIsCurrent(access: PublishingAccess, expected: PublishingIdentity, apiVersion: string, now = Date.now()): boolean {
  const checked = Date.parse(access.checkedAt);
  const expires = Date.parse(access.expiresAt);
  return access.state === "enabled" && samePublishingIdentity(access.identity, expected) && access.apiVersion === apiVersion && checked <= now && now < expires && expires - checked <= PUBLISHING_ACCESS_TTL_MS && expires > checked;
}
