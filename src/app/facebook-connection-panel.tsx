"use client";

import { useEffect, useState } from "react";

import type { FacebookPageChoice, TopicFacebookConnectionStatus } from "./modules/meta/meta-connection.types";
import { Button, ChannelCard, ChoiceList, Dialog, InlineNotice, LoadingState } from "./ui/primitives";

/** The status route's JSON: dates arrive as ISO strings. */
type FacebookStatus = Omit<TopicFacebookConnectionStatus, "tokenExpiresAt" | "connectedAt" | "lastVerifiedAt"> & {
  tokenExpiresAt?: string;
  connectedAt?: string;
  lastVerifiedAt?: string;
};

type Selection =
  | { state: "loading" }
  | { state: "ready"; pages: FacebookPageChoice[]; expiresAt: string }
  | { state: "expired" };

type Busy = "connect" | "verify" | "disconnect" | "confirm" | undefined;

/**
 * Connects this topic to a Facebook Page through Facebook Login for Business
 * (PUB-09) — a destination added next to the direct Instagram connection,
 * never replacing it. After Meta redirects back, the dashboard passes the
 * pending `selectionId` and this panel asks the editor which Page to use; the
 * server only accepts a Page from its own stored list. Nothing here publishes.
 */
export function FacebookConnectionPanel({
  topicId,
  secret,
  disabled,
  selectionId,
  onSelectionHandled,
}: {
  topicId: string;
  secret: string;
  disabled: boolean;
  selectionId?: string;
  onSelectionHandled?: () => void;
}) {
  const [status, setStatus] = useState<FacebookStatus>();
  const [busy, setBusy] = useState<Busy>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [selection, setSelection] = useState<Selection>();
  const [chosenPageId, setChosenPageId] = useState<string>();
  const authenticated = secret.trim().length > 0;

  useEffect(() => {
    if (!authenticated || !topicId) return;
    const controller = new AbortController();
    requestJson<FacebookStatus>(facebookUrl(topicId), secret, { signal: controller.signal })
      .then((next) => { if (!controller.signal.aborted) setStatus(next); })
      .catch((requestError) => { if (!controller.signal.aborted) setError(getErrorMessage(requestError)); });
    return () => controller.abort();
  }, [authenticated, secret, topicId]);

  useEffect(() => {
    if (!authenticated || !topicId || !selectionId) return;
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) setSelection({ state: "loading" }); });
    requestJson<{ pages: FacebookPageChoice[]; expiresAt?: string; expired: boolean }>(
      `${facebookUrl(topicId)}/selections/${encodeURIComponent(selectionId)}`,
      secret,
      { signal: controller.signal },
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.expired || !result.expiresAt) {
          setSelection({ state: "expired" });
          return;
        }
        setSelection({ state: "ready", pages: result.pages, expiresAt: result.expiresAt });
        if (result.pages.length === 1) setChosenPageId(result.pages[0].pageId);
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        setSelection(undefined);
        setError(getErrorMessage(requestError));
        onSelectionHandled?.();
      });
    return () => controller.abort();
  }, [authenticated, secret, topicId, selectionId, onSelectionHandled]);

  function closeSelection() {
    setSelection(undefined);
    setChosenPageId(undefined);
    onSelectionHandled?.();
  }

  async function handleConnect() {
    if (!authenticated || busy) return;
    setBusy("connect");
    setError(undefined);
    setNotice(undefined);
    try {
      const { authorizeUrl } = await requestJson<{ authorizeUrl: string }>(`${facebookUrl(topicId)}/connect`, secret, { method: "POST" });
      // Full-page navigation: Facebook's login dialog cannot run inside a fetch.
      window.location.href = authorizeUrl;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setBusy(undefined);
    }
  }

  async function handleConfirm() {
    if (!authenticated || busy || !selectionId || !chosenPageId) return;
    setBusy("confirm");
    setError(undefined);
    try {
      const next = await requestJson<FacebookStatus>(
        `${facebookUrl(topicId)}/selections/${encodeURIComponent(selectionId)}/confirm`,
        secret,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId: chosenPageId }) },
      );
      setStatus(next);
      closeSelection();
      if (next.lastVerificationError) setError(next.lastVerificationError);
      else setNotice(`Facebook Page connected: ${next.pageName ?? next.pageId}.`);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      closeSelection();
    } finally {
      setBusy(undefined);
    }
  }

  async function handleVerify() {
    if (!authenticated || busy) return;
    setBusy("verify");
    setError(undefined);
    setNotice(undefined);
    try {
      const next = await requestJson<FacebookStatus>(`${facebookUrl(topicId)}/verify`, secret, { method: "POST" });
      setStatus(next);
      if (next.lastVerificationError) setError(next.lastVerificationError);
      else setNotice("Facebook Page access verified.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(undefined);
    }
  }

  async function handleDisconnect() {
    if (!authenticated || busy) return;
    if (!window.confirm("Disconnect this topic's Facebook Page? The direct Instagram connection is not affected.")) return;
    setBusy("disconnect");
    setError(undefined);
    setNotice(undefined);
    try {
      setStatus(await requestJson<FacebookStatus>(facebookUrl(topicId), secret, { method: "DELETE" }));
      setNotice("Facebook Page disconnected.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(undefined);
    }
  }

  const controlsDisabled = disabled || Boolean(busy) || !authenticated;
  const details = status?.connected ? [
    { label: "Page", value: status.pageName ?? status.pageId ?? "—" },
    { label: "Linked Instagram", value: status.linkedIgUsername ? `@${status.linkedIgUsername}` : status.linkedIgUserId ?? "None found" },
    { label: "Page tasks", value: status.pageTasks.length ? status.pageTasks.join(", ") : "—" },
    { label: "Last verified", value: status.lastVerifiedAt ? new Date(status.lastVerifiedAt).toLocaleString() : "Not yet" },
    ...(status.tokenExpiresAt ? [{ label: "Renew before", value: new Date(status.tokenExpiresAt).toLocaleDateString() }] : []),
  ] : [];

  return <>
    <ChannelCard
      platform="Facebook Page"
      account={status?.connected ? status.pageName : status ? "No Facebook Page connected yet for this topic." : undefined}
      capabilities={status?.capabilities}
      details={details}
      actions={<>
        <Button variant={status?.connected ? "secondary" : "primary"} disabled={controlsDisabled} busy={busy === "connect"} onClick={handleConnect}>
          {busy === "connect" ? "Redirecting…" : status?.connected ? "Change Page" : "Connect Facebook Page"}
        </Button>
        {status?.connected ? <Button disabled={controlsDisabled} busy={busy === "verify"} onClick={handleVerify}>
          {busy === "verify" ? "Verifying…" : "Verify Page access"}
        </Button> : null}
        {status?.connected ? <Button variant="destructive" disabled={controlsDisabled} busy={busy === "disconnect"} onClick={handleDisconnect}>
          {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
        </Button> : null}
      </>}
    >
      {!status && !error ? <LoadingState>Checking Facebook connection…</LoadingState> : null}
      {error ? <InlineNotice tone="error" title="Facebook action failed">{error}</InlineNotice> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
      {status?.needsReconnect ? <InlineNotice tone="warning" title="Reconnect required">Facebook rejected the stored Page token. Connect again to refresh it.</InlineNotice> : null}
      {status?.connected ? <InlineNotice tone="info">Publish to this Page{status.linkedIgUsername ? ` and to @${status.linkedIgUsername}` : ""} from a story&rsquo;s Publication tab. Each post is re-checked before it is sent.</InlineNotice> : null}
    </ChannelCard>

    {selection ? <Dialog
      eyebrow="Facebook"
      title="Choose the Page for this topic"
      onClose={closeSelection}
      canClose={busy !== "confirm"}
      footer={selection.state === "ready" ? <>
        <Button variant="quiet" onClick={closeSelection} disabled={busy === "confirm"}>Cancel</Button>
        <Button variant="primary" onClick={handleConfirm} disabled={!chosenPageId} busy={busy === "confirm"}>
          {busy === "confirm" ? "Connecting…" : "Connect this Page"}
        </Button>
      </> : <Button onClick={closeSelection}>Close</Button>}
    >
      {selection.state === "loading" ? <LoadingState>Loading the Pages Facebook shared…</LoadingState> : null}
      {selection.state === "expired" ? <InlineNotice tone="warning" title="This Page choice expired">It was already used or is older than 15 minutes. Start Connect Facebook Page again.</InlineNotice> : null}
      {selection.state === "ready" ? <>
        <p>Facebook shared these Pages. Only the one you choose is stored for this topic.</p>
        <ChoiceList
          legend="Pages"
          name="facebook-page"
          value={chosenPageId}
          onChange={setChosenPageId}
          disabled={busy === "confirm"}
          options={selection.pages.map((page) => ({
            value: page.pageId,
            label: page.pageName,
            description: [
              page.linkedIgUsername ? `Instagram @${page.linkedIgUsername}` : page.linkedIgUserId ? "Linked Instagram account" : "No linked Instagram",
              page.tasks.length ? page.tasks.join(", ") : undefined,
            ].filter(Boolean).join(" · "),
          }))}
        />
      </> : null}
    </Dialog> : null}
  </>;
}

function facebookUrl(topicId: string): string {
  return `/api/radar/topics/${encodeURIComponent(topicId)}/meta/facebook`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred";
}

async function requestJson<T>(input: string, secret: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${secret.trim()}`);
  const response = await fetch(input, { ...init, cache: "no-store", headers });
  const payload = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
  if (!response.ok) throw new Error(payload?.error ?? `Request failed (${response.status})`);
  return payload as T;
}
