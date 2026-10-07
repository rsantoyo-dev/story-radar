/**
 * Sign-in email content and the Resend request, without server dependencies
 * so it can be tested directly. `auth-email.ts` sends it.
 */
export type SignInEmail = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

export function buildSignInEmail(input: {
  from: string;
  to: string;
  url: string;
  appName?: string;
  expiresInMinutes: number;
}): SignInEmail {
  const appName = input.appName ?? "Press Craftor";
  const url = new URL(input.url);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("Sign-in links must use https");
  }
  const href = escapeHtml(url.toString());
  return {
    from: input.from,
    to: input.to,
    subject: `Your ${appName} sign-in link`,
    text: [
      `Use this link to sign in to ${appName}:`,
      url.toString(),
      "",
      `It expires in ${input.expiresInMinutes} minutes and works once.`,
      "If you did not ask to sign in, you can ignore this email.",
    ].join("\n"),
    html: [
      `<p>Use this link to sign in to ${escapeHtml(appName)}:</p>`,
      `<p><a href="${href}">Sign in to ${escapeHtml(appName)}</a></p>`,
      `<p>It expires in ${input.expiresInMinutes} minutes and works once.</p>`,
      "<p>If you did not ask to sign in, you can ignore this email.</p>",
    ].join(""),
  };
}

/** Resend's REST API: https://resend.com/docs/api-reference/emails/send-email */
export function resendRequest(apiKey: string, email: SignInEmail): { url: string; init: RequestInit } {
  return {
    url: "https://api.resend.com/emails",
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: email.from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
