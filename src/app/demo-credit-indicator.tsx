"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { DemoCreditAccount, DemoCreditEntry, DemoCreditHistory } from "./modules/credits/demo-credit.repository";
import styles from "./radar-dashboard.generated.module.css";

function credits(micros: number, detail = false): string {
  if (micros !== 0 && Math.abs(micros) < 100 && !detail) return "<0.01";
  return (micros / 10_000).toLocaleString("en-US", {
    minimumFractionDigits: detail ? 4 : 2,
    maximumFractionDigits: detail ? 4 : 2,
  });
}

function entryLabel(entry: DemoCreditEntry): string {
  switch (entry.kind) {
    case "demo_grant": return "Opening demo balance";
    case "demo_reset": return "Demo balance reset";
    case "signup_grant": return "Signup grant";
    case "refund": return "Refund";
    case "purchase": return entry.reason || "Credits bought";
    case "purchase_reversal": return entry.reason || "Purchase refunded";
    case "usage_debit": return entry.usageKind && entry.usageKind !== "text" ? KIND_LABELS[entry.usageKind] ?? entry.usageKind : entry.operation || "Creative Studio text";
  }
}

const KIND_LABELS: Record<string, string> = { text: "Text", image: "Image", search: "Web search", map: "Maps", embedding: "Embeddings", reader: "Article reader" };

/** Daily spend for the last 30 days, the 7-day pace and how long the balance lasts at it. */
function SpendHistory({ history, availableMicros }: { history: DemoCreditHistory; availableMicros: number }) {
  const max = Math.max(...history.days.map((day) => day.micros), 0);
  const perDay = history.last7DaysMicros / 7;
  const lastsDays = perDay > 0 ? Math.floor(availableMicros / perDay) : undefined;
  return <>
    <h3>Last 30 days</h3>
    <p>{perDay > 0
      ? <>Pace: <strong>{credits(perDay)} credits/day</strong> over the last 7 days{lastsDays !== undefined ? <> · the balance lasts about <strong>{lastsDays} {lastsDays === 1 ? "day" : "days"}</strong> at this pace</> : null}.</>
      : "No spending in the last 7 days."}</p>
    {max > 0 ? <figure className={styles.demoCreditsChart} aria-label="Credits spent per day, last 30 days">
      <small>{credits(max)} max/day</small>
      <ol>{history.days.map((day) => <li key={day.day} title={`${day.day}: ${credits(day.micros)} credits`} aria-label={`${day.day}: ${credits(day.micros)} credits`}>
        <span style={{ height: `${day.micros > 0 ? Math.max(4, Math.round((day.micros / max) * 100)) : 0}%` }} />
      </li>)}</ol>
      <figcaption><span>{history.days[0]?.day}</span><span>{history.days.at(-1)?.day} (UTC)</span></figcaption>
    </figure> : null}
    {history.byKind.length ? <dl className={styles.demoCreditsKinds}>{history.byKind.map((entry) => <div key={entry.kind}>
      <dt>{KIND_LABELS[entry.kind] ?? entry.kind}</dt><dd>{credits(entry.micros)}</dd>
    </div>)}</dl> : null}
    {history.unpricedCount ? <p><small>{history.unpricedCount} {history.unpricedCount === 1 ? "request has" : "requests have"} no configured price yet and {history.unpricedCount === 1 ? "was" : "were"} not charged.</small></p> : null}
  </>;
}

async function loadDemoCredits(secret: string, signal?: AbortSignal): Promise<DemoCreditAccount> {
  const response = await fetch("/api/radar/credits", {
    cache: "no-store",
    headers: { Authorization: `Bearer ${secret}` },
    signal,
  });
  if (!response.ok) throw new Error("Could not load demo credits");
  return await response.json() as DemoCreditAccount;
}

/**
 * Restores 1,000 demo credits. One key per click: a retried request returns the
 * same reset instead of posting a second one. Past activity is kept.
 */
export async function resetDemoCreditBalance(secret: string): Promise<void> {
  const response = await fetch("/api/radar/credits/reset", {
    method: "POST",
    cache: "no-store",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ key: `demo_reset:${crypto.randomUUID()}`, reason: "Reset from the dashboard" }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "The demo balance could not be reset.");
  }
}

export function DemoCreditIndicator({ secret }: { secret: string }) {
  const [account, setAccount] = useState<DemoCreditAccount>();
  const [error, setError] = useState(false);
  const [resetState, setResetState] = useState<{ busy?: boolean; message?: string }>({});
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await loadDemoCredits(secret, signal);
      if (!signal?.aborted) { setAccount(result); setError(false); }
    } catch {
      if (!signal?.aborted) { setAccount(undefined); setError(true); }
    }
  }, [secret]);

  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      void loadDemoCredits(secret, controller.signal).then((result) => {
        if (!controller.signal.aborted) { setAccount(result); setError(false); }
      }).catch(() => {
        if (!controller.signal.aborted) { setAccount(undefined); setError(true); }
      });
    };
    load();
    const onFocus = () => { load(); };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    window.addEventListener("focus", onFocus);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [secret]);

  return <details className={styles.demoCredits}>
    <summary aria-label={account ? `${credits(account.availableMicros)} demo credits available; view activity` : "Demo credits; view activity"}>
      <span>Demo credits</span>
      <strong aria-live="polite">{account ? credits(account.availableMicros) : error ? "Unavailable" : "Loading…"}</strong>
    </summary>
    <div className={styles.demoCreditsPanel}>
      <h2>Demo credit activity</h2>
      {error ? <p>Balance is unavailable. Check the credit migration, then try again.</p> : !account ? <p>Loading activity…</p> : <>
        <p>1,000 credits represent US$10 of reference value, including the configured markup. Every AI, search and maps call is metered at the provider&rsquo;s list price; image and maps costs are estimates. Credits do not block work in this demo.</p>
        <dl className={styles.demoCreditsTotals}>
          <div><dt>Available</dt><dd>{credits(account.availableMicros)}</dd></div>
          <div><dt>Pending or uncertain</dt><dd>{credits(account.pendingMicros)}</dd></div>
          <div><dt>{account.periodStart ? "Spent since reset" : "Spent"}</dt><dd>{credits(account.spentMicros)}</dd></div>
          {account.overdrawnMicros > 0 ? <div><dt>Overdrawn</dt><dd>{credits(account.overdrawnMicros)}</dd></div> : null}
        </dl>
        {account.history ? <SpendHistory history={account.history} availableMicros={account.availableMicros} /> : null}
        <h3>Recent activity</h3>
        {account.entries.length ? <ul className={styles.demoCreditsHistory}>
          {account.entries.map((entry) => <li key={entry.id}>
            <span>
              <strong>{entryLabel(entry)}</strong>
              <small>{new Date(entry.createdAt).toLocaleString("en-US")} {entry.model ? `· ${entry.provider}/${entry.model}` : ""}{entry.kind === "demo_reset" && entry.reason ? ` · ${entry.reason}` : ""}</small>
              {entry.kind === "usage_debit" && entry.referenceCostMicros !== null && entry.markupBasisPoints !== null ?
                <small>Provider estimate US${(entry.referenceCostMicros / 1_000_000).toFixed(4)} · +{entry.markupBasisPoints / 100}%</small> : null}
            </span>
            <b>{entry.amountMicros < 0 ? "−" : "+"}{credits(Math.abs(entry.amountMicros), true)}</b>
          </li>)}
        </ul> : <p>No metered activity yet.</p>}
      </>}
      {resetState.message ? <p role="status">{resetState.message}</p> : null}
      <div className={styles.demoCreditsActions}>
        <Link href="/spending" className={styles.demoCreditsLink}>Spending &amp; history</Link>
        <button type="button" className={styles.demoCreditsRefresh} onClick={() => void refresh()}>Refresh balance</button>
        {account?.canReset ? <button type="button" className={styles.demoCreditsRefresh} disabled={resetState.busy} onClick={() => {
          if (!window.confirm("Reset the demo balance to 1,000 credits? Past activity stays in the history; spending restarts from now.")) return;
          setResetState({ busy: true });
          void resetDemoCreditBalance(secret)
            .then(() => { setResetState({ message: "Balance reset to 1,000 credits." }); return refresh(); })
            .catch((cause: unknown) => setResetState({ message: cause instanceof Error ? cause.message : "The demo balance could not be reset." }));
        }}>{resetState.busy ? "Resetting…" : "Reset to 1,000"}</button> : null}
      </div>
    </div>
  </details>;
}
