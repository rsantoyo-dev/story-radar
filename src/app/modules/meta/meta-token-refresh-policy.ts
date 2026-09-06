/**
 * Instagram long-lived tokens are valid 60 days and refreshable once the
 * current token is at least 24h old and not yet expired. A 10-day window
 * leaves a comfortable margin past that 24h minimum while still giving many
 * request cycles of opportunity before expiry. A successful refresh extends
 * tokenExpiresAt by another ~60 days, which pushes the row back outside this
 * window on its own — no separate "last attempt" column is needed to avoid
 * refreshing on every request once inside the window.
 */
const REFRESH_WINDOW_MS = 10 * 24 * 60 * 60 * 1_000;

export function isMetaTokenRefreshEligible(
  row: { accessTokenEncrypted: string | null; tokenExpiresAt: Date | null },
  now: Date,
): boolean {
  if (!row.accessTokenEncrypted || !row.tokenExpiresAt) return false;
  const msUntilExpiry = row.tokenExpiresAt.getTime() - now.getTime();
  return msUntilExpiry > 0 && msUntilExpiry <= REFRESH_WINDOW_MS;
}
