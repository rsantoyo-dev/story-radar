/**
 * Where the browser lands after a Meta dialog: the origin the editor signs in
 * and works from (BETTER_AUTH_URL), not the public address Meta redirects to
 * (RADAR_APP_URL). In production they are one URL; in local development the
 * redirect goes through an ngrok tunnel while the editor's session lives on
 * localhost, and landing on the tunnel's origin left them signed out, with
 * the sign-in refused as an invalid origin (2026-10-15).
 */
export function metaReturnBaseUrl(env: { BETTER_AUTH_URL?: string; RADAR_APP_URL?: string }): string | undefined {
  const value = env.BETTER_AUTH_URL?.trim() || env.RADAR_APP_URL?.trim();
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}
