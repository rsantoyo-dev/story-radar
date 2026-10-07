import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { safeReturnPath } from "@/app/modules/auth/access.core";
import { getSessionUser } from "@/app/modules/auth/access";
import { AuthConfigError, isGoogleSignInConfigured } from "@/app/modules/auth/auth";
import { isEmailSignInConfigured } from "@/app/modules/auth/auth-email";
import { CenteredPanel, InlineNotice } from "@/app/ui/primitives";

import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Press Craftor" };

const ERRORS: Record<string, string> = {
  google: "Google sign-in did not complete. Try again.",
  link: "That sign-in link is invalid or expired. Request a new one.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; error?: string | string[] }> }) {
  const query = await searchParams;
  const next = safeReturnPath(query.next);
  let signedIn = false;
  let configError: string | undefined;
  try {
    signedIn = Boolean(await getSessionUser(await headers()));
  } catch (error) {
    if (!(error instanceof AuthConfigError)) throw error;
    configError = error.message;
  }
  if (configError) {
    // A missing server setting must read as one, not as a crashed page.
    return <CenteredPanel title="Sign-in is not available on this server">
      <InlineNotice tone="error" title="Server configuration">{configError}. The operator needs to set it in the deployment and redeploy.</InlineNotice>
    </CenteredPanel>;
  }
  if (signedIn) redirect(next);
  const error = typeof query.error === "string" ? ERRORS[query.error] : undefined;

  return <CenteredPanel title="Sign in to Press Craftor">
    <p>Use your Google account or get a one-time link by email.</p>
    {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
    <LoginForm next={next} google={isGoogleSignInConfigured()} email={isEmailSignInConfigured()} />
  </CenteredPanel>;
}
