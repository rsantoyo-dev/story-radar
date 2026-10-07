"use client";

import { useState, type FormEvent } from "react";

import { Button, CenteredPanel, FormField, InlineNotice } from "@/app/ui/primitives";

import { SignOutButton } from "./sign-out-button";

/**
 * A new workspace has no brand yet: the first step is naming one. Everything
 * else (sources, identity, channels) is set up from the dashboard after.
 */
export function FirstTopicSetup({ email, workspaceName }: { email: string; workspaceName: string }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(event: FormEvent) {
    event.preventDefault();
    const value = name.trim();
    if (!value) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/radar/topics", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: value }),
    }).catch(() => undefined);
    if (response?.ok) {
      window.location.reload();
      return;
    }
    const body = await response?.json().catch(() => ({})) as { error?: string } | undefined;
    setError(body?.error ?? "The brand could not be created. Try again.");
    setBusy(false);
  }

  return <CenteredPanel title="Create your first brand">
    <p>{workspaceName} is ready. A brand is one publication or channel: its sources, look and voice, and where it publishes.</p>
    {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
    <form onSubmit={(event) => void create(event)}>
      <FormField label="Brand name" description="You can rename it later.">
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="e.g. Hello Brooklyn" required autoFocus />
      </FormField>
      <Button type="submit" variant="primary" busy={busy} disabled={busy || !name.trim()}>Create brand</Button>
    </form>
    <p>Signed in as {email}.</p>
    <SignOutButton />
  </CenteredPanel>;
}
