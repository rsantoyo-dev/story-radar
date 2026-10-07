"use client";

import { useEffect, useMemo, useState } from "react";

import { formatMoney, type CreditPack } from "@/app/modules/billing/billing.core";
import type { PurchaseSummary } from "@/app/modules/billing/credit-purchases";
import styles from "@/app/radar-dashboard.generated.module.css";

type BillingState = {
  configured: boolean;
  livemode: boolean;
  canBuy: boolean;
  packs: CreditPack[];
  purchases: PurchaseSummary[];
};

const STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  partially_refunded: "Partly refunded",
  refunded: "Refunded",
};

/**
 * Credit packs from Stripe and the workspace's recent purchases. Buying opens
 * Stripe Checkout; credits arrive when Stripe confirms the payment.
 */
export function BuyCredits({ secret, refreshKey }: { secret: string; refreshKey: number }) {
  const headers = useMemo<Record<string, string>>(() => secret ? { Authorization: `Bearer ${secret}` } : {}, [secret]);
  const [billing, setBilling] = useState<BillingState>();
  const [error, setError] = useState<string>();
  const [buying, setBuying] = useState<string>();

  useEffect(() => {
    let active = true;
    fetch("/api/radar/billing", { cache: "no-store", headers })
      .then(async (response) => {
        const body = await response.json() as BillingState & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Credit packs are unavailable right now.");
        if (active) { setBilling(body); setError(undefined); }
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Credit packs are unavailable right now."); });
    return () => { active = false; };
  }, [headers, refreshKey]);

  const buy = (pack: CreditPack) => {
    setBuying(pack.priceId);
    setError(undefined);
    fetch("/api/radar/billing/checkout", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ priceId: pack.priceId }),
    })
      .then(async (response) => {
        const body = await response.json() as { url?: string; error?: string };
        if (!response.ok || !body.url) throw new Error(body.error ?? "The payment page could not be opened.");
        window.location.assign(body.url);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "The payment page could not be opened.");
        setBuying(undefined);
      });
  };

  if (billing && !billing.configured) return null;

  return <section className={styles.spendingSection} aria-labelledby="spending-buy">
    <h2 id="spending-buy">Buy credits</h2>
    {billing && !billing.livemode ? <span className={styles.spendingTestMode}>Test mode · no real charges</span> : null}
    <p>Credits never expire and are shared by every brand in this workspace. Payment is handled by Stripe; we never see your card.</p>
    {error ? <p className={styles.spendingNotice} role="alert">{error}</p> : null}
    {!billing && !error ? <p className={styles.spendingLoading} role="status">Loading credit packs…</p> : null}
    {billing ? billing.packs.length ? <ul className={styles.spendingPacks}>
      {billing.packs.map((pack) => <li key={pack.priceId}>
        <strong>{pack.name}</strong>
        <b>{pack.credits.toLocaleString("en-US")} <small>credits</small></b>
        <small>{formatMoney(pack.unitAmount, pack.currency)} · {formatMoney(Math.round(pack.unitAmount / pack.credits * 100), pack.currency)} per 100 credits</small>
        {pack.description ? <small>{pack.description}</small> : null}
        {billing.canBuy
          ? <button type="button" className={styles.spendingBuy} disabled={Boolean(buying)} onClick={() => buy(pack)}>
            {buying === pack.priceId ? "Opening checkout…" : `Buy for ${formatMoney(pack.unitAmount, pack.currency)}`}
          </button>
          : null}
      </li>)}
    </ul> : <p>No credit packs are for sale yet.</p> : null}
    {billing && !billing.canBuy ? <p>Only a workspace owner or admin can buy credits.</p> : null}
    {billing?.purchases.length ? <ul className={styles.spendingHistory} aria-label="Recent purchases">
      {billing.purchases.map((purchase) => <li key={purchase.id}>
        <span>
          <strong>{purchase.credits.toLocaleString("en-US")} credits</strong>
          <small>{new Date(purchase.paidAt ?? purchase.createdAt).toLocaleString("en-US")} · {STATUS_LABELS[purchase.status] ?? purchase.status}{purchase.livemode ? "" : " · test"}</small>
        </span>
        <b>{formatMoney(purchase.amountTotal, purchase.currency)}{purchase.amountRefunded ? ` (−${formatMoney(purchase.amountRefunded, purchase.currency)})` : ""}</b>
      </li>)}
    </ul> : null}
  </section>;
}
