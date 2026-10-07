"use client";

import { useState, type FormEvent } from "react";

import { signIn } from "@/app/modules/auth/auth-client";
import { Button, Divider, FormField, InlineNotice } from "@/app/ui/primitives";

export function LoginForm({ next, google, email }: { next: string; google: boolean; email: boolean }) {
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState<"google" | "email" | null>(null);
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");

  async function withGoogle() {
    setBusy("google");
    setError("");
    const result = await signIn.social({ provider: "google", callbackURL: next, errorCallbackURL: "/login?error=google" });
    if (result?.error) {
      setError(result.error.message ?? "Google sign-in could not start.");
      setBusy(null);
    }
  }

  async function withEmail(event: FormEvent) {
    event.preventDefault();
    const value = address.trim().toLowerCase();
    if (!value) return;
    setBusy("email");
    setError("");
    const result = await signIn.magicLink({ email: value, callbackURL: next, errorCallbackURL: "/login?error=link" });
    setBusy(null);
    if (result?.error) setError(result.error.message ?? "The sign-in email could not be sent.");
    else setSentTo(value);
  }

  if (sentTo) {
    return <InlineNotice tone="success" title="Check your inbox">
      We sent a sign-in link to {sentTo}. It works once and expires in 15 minutes.
    </InlineNotice>;
  }

  return <>
    {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
    {google ? <Button variant="primary" busy={busy === "google"} disabled={busy !== null} onClick={() => void withGoogle()}>
      Continue with Google
    </Button> : null}
    {google && email ? <Divider>or</Divider> : null}
    {email ? <form onSubmit={(event) => void withEmail(event)}>
      <FormField label="Work email" description="We email you a one-time link. No password needed.">
        <input type="email" autoComplete="email" inputMode="email" value={address} onChange={(event) => setAddress(event.target.value)} required />
      </FormField>
      <Button type="submit" busy={busy === "email"} disabled={busy !== null || !address.trim()}>Email me a sign-in link</Button>
    </form> : null}
    {!google && !email ? <InlineNotice tone="warning">Sign-in is not configured yet. Add Google credentials or RESEND_API_KEY and AUTH_EMAIL_FROM.</InlineNotice> : null}
  </>;
}
