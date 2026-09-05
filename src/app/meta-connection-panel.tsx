"use client";

import { useEffect, useState } from "react";

import styles from "./creative-draft-workspace.generated.module.css";

type MetaConnectionStatus = {
  connected: boolean;
  igUsername?: string;
  pageName?: string;
  tokenExpiresAt?: string;
  connectedAt?: string;
  hasCustomApp: boolean;
};

type Busy = "connect" | "disconnect" | "save-app" | "clear-app" | undefined;

/**
 * Lets an admin connect this topic to its own Instagram Business account.
 * Publishing itself is a separate, later feature — this panel only manages
 * the connection so a future "Publish to Instagram" action has an account to
 * publish to. Nothing here posts anything.
 */
export function MetaConnectionPanel({
  topicId,
  secret,
  disabled,
}: {
  topicId: string;
  secret: string;
  disabled: boolean;
}) {
  const [status, setStatus] = useState<MetaConnectionStatus>();
  const [busy, setBusy] = useState<Busy>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const authenticated = secret.trim().length > 0;

  useEffect(() => {
    if (!authenticated || !topicId) return;
    const controller = new AbortController();

    requestJson<MetaConnectionStatus>(metaUrl(topicId), secret, {
      signal: controller.signal,
    })
      .then((next) => {
        if (controller.signal.aborted) return;
        setStatus(next);
        setError(undefined);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(getErrorMessage(requestError));
      });

    return () => controller.abort();
  }, [authenticated, secret, topicId]);

  async function handleConnect() {
    if (!authenticated || busy) return;
    setBusy("connect");
    setError(undefined);
    setNotice(undefined);
    try {
      const { authorizeUrl } = await requestJson<{ authorizeUrl: string }>(
        `${metaUrl(topicId)}/connect`,
        secret,
        { method: "POST" },
      );
      // Full-page navigation: Facebook's login dialog cannot run inside a fetch.
      window.location.href = authorizeUrl;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setBusy(undefined);
    }
  }

  async function handleDisconnect() {
    if (!authenticated || busy) return;
    if (
      !window.confirm(
        "Disconnect this topic's Instagram account? You can reconnect it anytime.",
      )
    ) {
      return;
    }
    setBusy("disconnect");
    setError(undefined);
    try {
      setStatus(
        await requestJson<MetaConnectionStatus>(metaUrl(topicId), secret, {
          method: "DELETE",
        }),
      );
      setNotice("Instagram account disconnected.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(undefined);
    }
  }

  async function handleSaveApp() {
    if (!authenticated || busy || !appId.trim() || !appSecret.trim()) return;
    setBusy("save-app");
    setError(undefined);
    try {
      setStatus(
        await requestJson<MetaConnectionStatus>(`${metaUrl(topicId)}/app`, secret, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appId: appId.trim(),
            appSecret: appSecret.trim(),
          }),
        }),
      );
      setAppSecret("");
      setNotice("Custom Instagram App saved. Connect (or reconnect) to use it.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(undefined);
    }
  }

  async function handleClearApp() {
    if (!authenticated || busy) return;
    setBusy("clear-app");
    setError(undefined);
    try {
      setStatus(
        await requestJson<MetaConnectionStatus>(`${metaUrl(topicId)}/app`, secret, {
          method: "DELETE",
        }),
      );
      setAppId("");
      setAppSecret("");
      setNotice("Custom Instagram App removed; this topic now uses the shared app.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(undefined);
    }
  }

  const controlsDisabled = disabled || Boolean(busy) || !authenticated;

  return (
    <section
      className={styles.brandOverlayPanel}
      aria-labelledby="meta-connection-title"
    >
      <header className={styles.brandOverlayHeader}>
        <div>
          <strong id="meta-connection-title">Instagram</strong>
          <p>
            Connect this topic to its own Instagram Business account. Publishing
            an approved draft stays a separate, manual action — nothing here
            posts anything automatically.
          </p>
        </div>
        {status ? (
          <span
            className={`${styles.metaStatusChip} ${
              status.connected ? styles.metaStatusConnected : ""
            }`}
          >
            {status.connected
              ? `Connected · @${status.igUsername ?? "unknown"}`
              : "Not connected"}
          </span>
        ) : null}
      </header>

      {error ? <p className={styles.brandAssetHint}>{error}</p> : null}
      {notice ? <p className={styles.brandAssetHint}>{notice}</p> : null}

      <div className={styles.metaConnectionBody}>
        {status?.connected ? (
          <dl className={styles.metaConnectionDetails}>
            <div>
              <dt>Account</dt>
              <dd>@{status.igUsername ?? "—"}</dd>
            </div>
            <div>
              <dt>Facebook Page</dt>
              <dd>{status.pageName ?? "—"}</dd>
            </div>
            {status.tokenExpiresAt ? (
              <div>
                <dt>Renew before</dt>
                <dd>{new Date(status.tokenExpiresAt).toLocaleDateString()}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className={styles.brandAssetHint}>
            No Instagram account connected yet for this topic.
          </p>
        )}

        <div className={styles.metaConnectionActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={controlsDisabled}
            onClick={handleConnect}
          >
            {busy === "connect"
              ? "Redirecting…"
              : status?.connected
                ? "Reconnect"
                : "Connect Instagram account"}
          </button>
          {status?.connected ? (
            <button
              type="button"
              className={styles.unapproveButton}
              disabled={controlsDisabled}
              onClick={handleDisconnect}
            >
              {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </button>
          ) : null}
        </div>
      </div>

      <details className={styles.profilePanel}>
        <summary>
          <span>
            <span>Advanced</span>
            <small>Use a different Instagram App for this topic</small>
          </span>
        </summary>
        <div className={styles.profileBody}>
          <p className={styles.brandAssetHint}>
            {status?.hasCustomApp
              ? "This topic uses its own Instagram App instead of the shared one."
              : "This topic uses the shared Instagram App configured for the whole workspace."}
          </p>
          <p className={styles.brandAssetHint}>
            From the Meta App Dashboard&rsquo;s Instagram product settings —
            &ldquo;Identificador/Clave secreta de la app de Instagram&rdquo; —
            not the parent Meta App&rsquo;s own App ID.
          </p>
          <div className={styles.metaAppFields}>
            <label className={styles.field}>
              <span>Instagram App ID</span>
              <input
                value={appId}
                onChange={(event) => setAppId(event.target.value)}
                disabled={controlsDisabled}
                placeholder="e.g. 2312686802828352"
              />
            </label>
            <label className={styles.field}>
              <span>Instagram App secret</span>
              <input
                type="password"
                value={appSecret}
                onChange={(event) => setAppSecret(event.target.value)}
                disabled={controlsDisabled}
                placeholder="Paste the Instagram app secret"
                autoComplete="off"
              />
            </label>
          </div>
          <div className={styles.metaConnectionActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={controlsDisabled || !appId.trim() || !appSecret.trim()}
              onClick={handleSaveApp}
            >
              {busy === "save-app" ? "Saving…" : "Save custom app"}
            </button>
            {status?.hasCustomApp ? (
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={controlsDisabled}
                onClick={handleClearApp}
              >
                {busy === "clear-app" ? "Removing…" : "Use shared app instead"}
              </button>
            ) : null}
          </div>
        </div>
      </details>
    </section>
  );
}

function metaUrl(topicId: string): string {
  return `/api/radar/topics/${encodeURIComponent(topicId)}/meta`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred";
}

async function requestJson<T>(
  input: string,
  secret: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${secret.trim()}`);
  const response = await fetch(input, { ...init, cache: "no-store", headers });
  const payload = (await response.json().catch(() => undefined)) as
    | { error?: string }
    | undefined;

  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed (${response.status})`);
  }

  return payload as T;
}
