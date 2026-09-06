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
 * "operational" means insights were proven live by a real verification call,
 * not merely that OAuth once claimed the scope was granted — Meta can accept
 * a scope request without the app actually having Advanced Access for it.
 * A dead or expired token always outranks a scope/verification problem,
 * since reconnecting is the fix for that regardless of anything else.
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

  const hasInsightsScope = row.grantedPermissions.includes(
    INSTAGRAM_INSIGHTS_SCOPE,
  );
  const verifiedOk = Boolean(row.lastVerifiedAt) && !row.lastVerificationError;
  if (hasInsightsScope && verifiedOk) return "operational";

  return "connected-without-insights";
}
