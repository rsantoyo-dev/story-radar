import "server-only";

import { buildSignInEmail, resendRequest } from "./auth-email.core";

export const MAGIC_LINK_EXPIRES_IN_SECONDS = 15 * 60;

function emailSettings(): { apiKey: string; from: string } | undefined {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_EMAIL_FROM?.trim();
  return apiKey && from ? { apiKey, from } : undefined;
}

/** The login page shows the email form only when this is true. */
export function isEmailSignInConfigured(): boolean {
  return emailSettings() !== undefined;
}

export class AuthEmailError extends Error {}

/** Sends a one-time sign-in link through Resend. Never logs the link. */
export async function sendSignInEmail(to: string, url: string): Promise<void> {
  const settings = emailSettings();
  if (!settings) throw new AuthEmailError("Email sign-in is not configured (RESEND_API_KEY, AUTH_EMAIL_FROM).");
  const email = buildSignInEmail({
    from: settings.from,
    to,
    url,
    expiresInMinutes: MAGIC_LINK_EXPIRES_IN_SECONDS / 60,
  });
  const request = resendRequest(settings.apiKey, email);
  const response = await fetch(request.url, { ...request.init, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new AuthEmailError(`The sign-in email could not be sent (HTTP ${response.status}).`);
  }
}
