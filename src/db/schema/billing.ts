import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { workspaces } from "./workspaces";

/**
 * The Stripe customer that pays for a workspace, one per Stripe mode so test
 * customers are never reused with a live key.
 */
export const billingCustomers = pgTable(
  "billing_customers",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    livemode: boolean("livemode").notNull(),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.livemode] }),
    uniqueIndex("billing_customers_stripe_customer_idx").on(table.stripeCustomerId),
  ],
);

/**
 * One credit pack bought through Stripe Checkout. The credits and price are
 * snapshotted when the checkout starts, so a later price change in Stripe
 * never changes what an earlier purchase granted. Kept forever as history.
 */
export const billingPurchases = pgTable(
  "billing_purchases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    livemode: boolean("livemode").notNull(),
    stripeCheckoutSessionId: text("stripe_checkout_session_id").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripePriceId: text("stripe_price_id").notNull(),
    credits: integer("credits").notNull(),
    /** In the currency's minor unit (cents), as Stripe reports it. */
    amountTotal: integer("amount_total").notNull(),
    amountRefunded: integer("amount_refunded").default(0).notNull(),
    currency: text("currency").notNull(),
    status: text("status").default("open").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("billing_purchases_checkout_session_idx").on(table.stripeCheckoutSessionId),
    uniqueIndex("billing_purchases_payment_intent_idx").on(table.stripePaymentIntentId),
    index("billing_purchases_workspace_time_idx").on(table.workspaceId, table.createdAt),
    check("billing_purchases_credits_check", sql`${table.credits} > 0`),
    check(
      "billing_purchases_amounts_check",
      sql`${table.amountTotal} >= 0 AND ${table.amountRefunded} >= 0 AND ${table.amountRefunded} <= ${table.amountTotal}`,
    ),
    check(
      "billing_purchases_status_check",
      sql`${table.status} IN ('open', 'paid', 'expired', 'partially_refunded', 'refunded')`,
    ),
  ],
);

export type BillingPurchase = typeof billingPurchases.$inferSelect;
