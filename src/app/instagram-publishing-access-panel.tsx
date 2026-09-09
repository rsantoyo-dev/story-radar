"use client";

import { useEffect, useRef, useState } from "react";
import { PUBLISHING_ACCESS_MESSAGES, type PublishingAccess, type PublishingAccessState } from "./modules/meta/instagram-publishing-access";
import styles from "./creative-draft-workspace.generated.module.css";

const LABELS: Record<PublishingAccessState, string> = {
  disconnected: "Account disconnected",
  "needs-reconnect": "Reconnection required",
  "missing-permission": "Publishing permission missing",
  unverified: "Publishing not verified",
  enabled: "Account enabled for publishing",
  "quota-exhausted": "Publishing quota exhausted",
  "rate-limited": "Verification rate limited",
  unavailable: "Verification unavailable",
  "connection-changed": "Connection changed · verify again",
};

export function InstagramPublishingAccessPanel({ topicId, secret, disabled, state }: {
  topicId: string; secret: string; disabled: boolean; state: PublishingAccessState;
}) {
  const [result, setResult] = useState<PublishingAccess>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    function invalidate() { pending.current?.abort(); setResult(undefined); setBusy(false); }
    window.addEventListener("focus", invalidate);
    return () => { pending.current?.abort(); window.removeEventListener("focus", invalidate); };
  }, []);
  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(() => setResult(undefined), Math.max(0, Date.parse(result.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [result]);
  async function verify() {
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError(""); setResult(undefined);
    try {
      const response = await fetch(`/api/radar/topics/${encodeURIComponent(topicId)}/meta/publishing-access`, {
        method: "POST", cache: "no-store", signal: controller.signal,
        headers: { Authorization: `Bearer ${secret.trim()}` },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to verify publishing access");
      if (!controller.signal.aborted) setResult(body);
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to verify publishing access"); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const displayedState = error ? "unavailable" : result?.state ?? state;
  return <section className={styles.publicationCandidate} aria-label="Instagram publishing access">
    <h4>Publishing access</h4>
    <div aria-live="polite">
      <strong>{LABELS[displayedState]}</strong>
      <p>{error || result?.message || PUBLISHING_ACCESS_MESSAGES[state]}</p>
      {result?.quota ? <p>{result.quota.remaining} of {result.quota.total} posts available in the account’s {result.quota.durationSeconds / 3600}-hour quota window.</p> : null}
      {result ? <p>Checked {new Date(result.checkedAt).toLocaleString()} · {result.apiVersion}</p> : null}
    </div>
    <button className={styles.secondaryButton} type="button" disabled={disabled || busy || state === "disconnected"} onClick={verify}>{busy ? "Checking Instagram…" : "Verify publishing access"}</button>
    <p>This checks permission and quota without publishing a test post. Access is checked again when validating a candidate.</p>
    <details><summary>Meta app access requirements</summary>
      <p>For accounts you own or manage, configure Standard Access and the required app/account roles. Serving customer accounts requires Advanced Access and the applicable Meta App Review. A successful quota check is not an App Review certification or a guarantee that a future post will be accepted.</p>
      <a href="https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-ab559ffb-8e2c-4b0a-b43a-5737b6d2f672" target="_blank" rel="noreferrer">Meta publishing requirements</a>
    </details>
  </section>;
}
