/**
 * Single source of truth for the four connection states IG-01 requires the
 * UI to distinguish. No "server-only" import: this is a pure function over
 * already-loaded row data, unit-tested directly.
 */

export type MetaConnectionState =
  | "disconnected"
  | "connected-without-insights"
  | "operational"
  | "needs-reconnect";

export const INSTAGRAM_INSIGHTS_SCOPE = "instagram_business_manage_insights";

export type MetaConnectionStateInput = {
  igUserId: string | null;
  accessTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
  grantedPermissions: string[];
  lastVerifiedAt: Date | null;
  lastVerificationError: string | null;
};

/**
 * "operational" means insights were proven live by a real verification call.
 * That call IS the evidence — a clean verification proves insights work even
 * when the OAuth response never echoed `permissions` (Meta sometimes omits
 * it), so the granted-scope list is not required on top of it; conversely a
 * granted scope without a passing verification is not enough (Meta can accept
 * a scope request without the app having Advanced Access for it). A dead or
 * expired token always outranks this, since reconnecting is the fix.
 */
export function deriveMetaConnectionState(
  row: MetaConnectionStateInput,
  now: Date,
): MetaConnectionState {
  const connected = Boolean(row.igUserId && row.accessTokenEncrypted);
  if (!connected) return "disconnected";

  const tokenExpired = Boolean(
    row.tokenExpiresAt && row.tokenExpiresAt.getTime() <= now.getTime(),
  );
  if (tokenExpired) return "needs-reconnect";

  const verifiedOk = Boolean(row.lastVerifiedAt) && !row.lastVerificationError;
  if (verifiedOk) return "operational";

  return "connected-without-insights";
}
