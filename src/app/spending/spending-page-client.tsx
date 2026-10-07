"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { DemoCreditAccount } from "@/app/modules/credits/demo-credit.repository";
import type { SpendingEntry, SpendingLine, SpendingPeriod, SpendingReport } from "@/app/modules/credits/spending.repository";
import { resetDemoCreditBalance } from "@/app/demo-credit-indicator";
import styles from "@/app/radar-dashboard.generated.module.css";

const PERIODS: { value: SpendingPeriod; label: string }[] = [
  { value: "reset", label: "Since last reset" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

const STATUS_LABELS: Record<SpendingEntry["status"], string> = {
  charged: "Charged",
  uncertain: "Result unknown · not charged",
  unpriced: "No price yet · not charged",
  unbilled: "Before metering · not charged",
};

function credits(micros: number): string {
  if (micros > 0 && micros < 100) return "<0.01";
  return (micros / 10_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function usd(micros: number): string {
  const dollars = micros / 1_000_000;
  if (dollars > 0 && dollars < 0.01) return `US$${dollars.toFixed(4)}`;
  return `US$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Our provider cost for a line: what was charged plus what was spent without a charge. */
function cost(line: SpendingLine): number {
  return line.chargedCostMicros + line.unbilledCostMicros;
}

function margin(line: SpendingLine): string {
  const value = line.chargedMicros - line.chargedCostMicros;
  if (line.chargedMicros <= 0) return "—";
  return `${usd(value)} · ${Math.round((value / line.chargedMicros) * 100)}%`;
}

function readSecret(): string {
  if (typeof window === "undefined") return "";
  try { return window.sessionStorage.getItem("story-radar:collector-secret") ?? ""; }
  catch { return ""; }
}

export function SpendingPageClient({ signedIn = false }: { signedIn?: boolean }) {
  const [secret] = useState(readSecret);
  const [period, setPeriod] = useState<SpendingPeriod>("reset");
  const [topicId, setTopicId] = useState("");
  const [report, setReport] = useState<SpendingReport>();
  const [account, setAccount] = useState<DemoCreditAccount>();
  const [entries, setEntries] = useState<SpendingEntry[]>([]);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (offset = 0) => {
    const query = new URLSearchParams({ period, offset: String(offset), ...(topicId ? { topicId } : {}) });
    const headers = { Authorization: `Bearer ${secret}` };
    const [reportResponse, accountResponse] = await Promise.all([
      fetch(`/api/radar/credits/spending?${query}`, { cache: "no-store", headers }),
      offset === 0 ? fetch("/api/radar/credits", { cache: "no-store", headers }) : Promise.resolve(undefined),
    ]);
    const body = await reportResponse.json() as SpendingReport & { error?: string };
    if (!reportResponse.ok) throw new Error(body.error ?? "Spending is unavailable right now.");
    if (accountResponse?.ok) setAccount(await accountResponse.json() as DemoCreditAccount);
    setReport(body);
    setEntries((current) => offset === 0 ? body.entries : [...current, ...body.entries]);
    setError(undefined);
  }, [period, topicId, secret]);

  useEffect(() => {
    if (!secret && !signedIn) {
      Promise.resolve().then(() => setError("Connect with the collector secret on the dashboard to see spending."));
      return;
    }
    let active = true;
    Promise.resolve().then(() => load()).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Spending is unavailable right now.");
    });
    return () => { active = false; };
  }, [load, secret, signedIn]);

  const reset = () => {
    if (!window.confirm("Reset the demo balance to 1,000 credits? Past activity stays in the history; spending restarts from now.")) return;
    setBusy(true);
    resetDemoCreditBalance(secret)
      .then(() => { setNotice("Balance reset to 1,000 credits. Spending since reset starts at 0."); setPeriod("reset"); return load(); })
      .catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : "The demo balance could not be reset."))
      .finally(() => setBusy(false));
  };

  const totals = report?.totals;
  const perStory = totals && totals.stories > 0 ? totals.chargedMicros / totals.stories : 0;

  return <main className={styles.spendingPage}>
    <header className={styles.spendingHeader}>
      <Link href="/" className={styles.spendingBack}>← Press Craftor</Link>
      <div>
        <h1>Spending</h1>
        <p>Every AI, search and maps call is a product with a price: our provider cost plus the {report ? report.markupBasisPoints / 100 : 25}% markup, paid from a prepaid balance. 1 credit = US$0.01.</p>
      </div>
    </header>

    {error ? <div className={styles.spendingError} role="alert"><strong>Spending is unavailable</strong><p>{error}</p><Link href="/">Back to dashboard</Link></div> : null}

    {!error ? <section className={styles.spendingControls} aria-label="Filters">
      <div role="group" aria-label="Period" className={styles.spendingPeriods}>
        {PERIODS.map((option) => <button key={option.value} type="button" aria-pressed={period === option.value}
          onClick={() => setPeriod(option.value)}>{option.label}</button>)}
      </div>
      <label className={styles.spendingTopic}>
        <span>Brand</span>
        <select value={topicId} onChange={(event) => setTopicId(event.target.value)}>
          <option value="">All brands</option>
          {report?.topicOptions.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
        </select>
      </label>
      {account?.canReset ? <button type="button" className={styles.spendingReset} disabled={busy} onClick={reset}>{busy ? "Resetting…" : "Reset balance to 1,000"}</button> : null}
    </section> : null}
    {notice ? <p className={styles.spendingNotice} role="status">{notice}</p> : null}

    {!error && !report ? <p className={styles.spendingLoading} role="status">Loading spending…</p> : null}

    {report && totals ? <>
      <dl className={styles.spendingSummary}>
        <div><dt>Available balance</dt><dd>{account ? credits(account.availableMicros) : "—"} <small>credits</small></dd></div>
        <div><dt>Credits used</dt><dd>{credits(totals.chargedMicros)} <small>{usd(totals.chargedMicros)}</small></dd></div>
        <div><dt>Our provider cost</dt><dd>{usd(totals.chargedCostMicros)} <small>of the charged work</small></dd></div>
        <div><dt>Gross margin</dt><dd>{margin(totals)}</dd></div>
        <div><dt>Stories with spend</dt><dd>{totals.stories} <small>{totals.stories ? `${credits(perStory)} credits each on average` : ""}</small></dd></div>
        <div><dt>Not charged</dt><dd>{usd(totals.unbilledCostMicros + totals.uncertainCostMicros)} <small>{totals.unpricedCount ? `${totals.unpricedCount} unpriced calls` : "cost we absorbed"}</small></dd></div>
      </dl>
      {report.period === "reset" && report.periodStart ? <p className={styles.spendingNote}>Period started {new Date(report.periodStart).toLocaleString("en-US")}. Discovery work (evaluation, research, duplicate checks) belongs to a brand rather than a story, so per-story totals cover production only.</p> : null}

      <section className={styles.spendingSection} aria-labelledby="spending-products">
        <h2 id="spending-products">Products</h2>
        <div className={styles.spendingTableWrap}>
          <table className={styles.spendingTable}>
            <thead><tr><th scope="col">Product</th><th scope="col">Stage</th><th scope="col">Units</th><th scope="col">Avg price</th><th scope="col">Credits</th><th scope="col">Our cost</th><th scope="col">Margin</th></tr></thead>
            <tbody>{report.products.length ? report.products.map((product) => <tr key={product.label}>
              <th scope="row">{product.label}</th><td>{product.group}</td><td>{product.count}</td>
              <td>{product.count ? credits(product.chargedMicros / product.count) : "—"}</td>
              <td>{credits(product.chargedMicros)}</td><td>{usd(cost(product))}</td><td>{margin(product)}</td>
            </tr>) : <tr><td colSpan={7}>No metered activity in this period.</td></tr>}</tbody>
          </table>
        </div>
      </section>

      <section className={styles.spendingSection} aria-labelledby="spending-stories">
        <h2 id="spending-stories">Stories</h2>
        <div className={styles.spendingTableWrap}>
          <table className={styles.spendingTable}>
            <thead><tr><th scope="col">Story</th><th scope="col">Brand</th><th scope="col">Calls</th><th scope="col">Credits</th><th scope="col">Our cost</th><th scope="col">Margin</th></tr></thead>
            <tbody>{report.stories.length ? report.stories.map((story) => <tr key={story.storyId}>
              <th scope="row"><Link href={`/topics/${story.topicId}/stories/${story.storyId}?tab=visuals`}>{story.title}</Link></th>
              <td>{story.topicName}</td><td>{story.count}</td><td>{credits(story.chargedMicros)}</td><td>{usd(cost(story))}</td><td>{margin(story)}</td>
            </tr>) : <tr><td colSpan={6}>No story spending in this period.</td></tr>}</tbody>
          </table>
        </div>
      </section>

      <section className={styles.spendingSection} aria-labelledby="spending-brands">
        <h2 id="spending-brands">Brands</h2>
        <div className={styles.spendingTableWrap}>
          <table className={styles.spendingTable}>
            <thead><tr><th scope="col">Brand</th><th scope="col">Stories</th><th scope="col">Calls</th><th scope="col">Credits</th><th scope="col">Our cost</th><th scope="col">Margin</th></tr></thead>
            <tbody>{report.topics.length ? report.topics.map((topic) => <tr key={topic.topicId}>
              <th scope="row">{topic.name}</th><td>{topic.stories}</td><td>{topic.count}</td><td>{credits(topic.chargedMicros)}</td><td>{usd(cost(topic))}</td><td>{margin(topic)}</td>
            </tr>) : <tr><td colSpan={6}>No brand spending in this period.</td></tr>}</tbody>
          </table>
        </div>
      </section>

      <section className={styles.spendingSection} aria-labelledby="spending-history">
        <h2 id="spending-history">History</h2>
        <ul className={styles.spendingHistory}>
          {entries.length ? entries.map((entry) => <li key={entry.id}>
            <span>
              <strong>{entry.product}</strong>
              <small>{new Date(entry.at).toLocaleString("en-US")} · {entry.topicName}{entry.storyTitle ? ` · ${entry.storyTitle}` : ""}</small>
              <small>{entry.provider}/{entry.model} · {STATUS_LABELS[entry.status]}{entry.costMicros !== null ? ` · our cost ${usd(entry.costMicros)}` : ""}</small>
            </span>
            <b>{entry.chargedMicros !== null ? `−${credits(entry.chargedMicros)}` : "—"}</b>
          </li>) : <li><span>No activity in this period.</span></li>}
        </ul>
        {report.hasMoreEntries ? <button type="button" className={styles.spendingMore} onClick={() => {
          void load(entries.length).catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : "Could not load more activity."));
        }}>Load more</button> : null}
      </section>
    </> : null}
  </main>;
}
