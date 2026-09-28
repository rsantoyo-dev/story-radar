# Workspace credits and metered usage

**ID:** FEAT-BILL-001  
**Status:** Architecture proposed; no wallet, deductions, or payment flow implemented  
**Date:** September 28, 2026  
**Product:** Press Craftor

## Outcome

An editor can see how much AI production capacity remains, understand the estimated cost before starting paid work, and inspect what each completed action consumed. The first version is a **simulation**: the existing `default` workspace starts with **1,000 demo credits**, equivalent to **US$10 of reference value**. An operator can restore the available demo balance to 1,000 credits without deleting its history. Credits cannot be bought, withdrawn, transferred, or treated as cash.

When authentication and workspace isolation arrive, the same ledger belongs to the authenticated workspace. Topics and Editorial Lines share their workspace's balance; usage retains its Topic, Story, operation, and eventual user attribution. There is no per-user wallet while the application has only a shared collector credential.

## Current boundary and dependencies

- `workspaces` already defines tenancy; the seeded `default` workspace is used before authentication. `topics.workspace_id` supplies the eventual ownership link.
- `creative_text_calls` records per-call Creative Studio text reservations, usage, and estimated USD cost in microdollars. The Story text budget is an **internal safety limit**, separate from a workspace credit balance. See [creative text recovery](../creative-text-recovery.md) and [`creative-text-meter.ts`](../../src/app/modules/stories/creative-text-meter.ts).
- Creative Studio text covers focus, brief, draft, companion, review, repair, and recovery calls. Images, ingestion, evaluation, research, maps, and separate documentary workflows are outside that meter. Aggregate token counters cannot establish a provider-specific charge for every historical call. Historical work must not be charged retroactively.
- [AUTH-08](../stories/AUTH-08.md) proposes a future `workspace_credit_entries` ledger and **US$1** signup grant. This feature's **US$10 demo grant** is a separate development policy, not an implicit change to the future signup offer. Reconcile the signup amount and ledger schema with AUTH-08 before implementing either story; there must be one credit ledger.
- Authentication, route authorization, and workspace data isolation remain owned by [FEAT-AUTH-001](authentication.md). Do not expose a reset endpoint or claim per-user accounting before those controls exist.

## Units and price policy

| Rule | Value |
|---|---|
| Stored money unit | Integer USD microdollars (`1 USD = 1,000,000 micros`); never floating-point account arithmetic. |
| Display conversion | `1 credit = 10,000 micros = US$0.01`; `1,000 credits = US$10`. Fractional credits are valid. |
| Demo opening grant | `10,000,000 micros`, recorded once for the `default` workspace. |
| Initial markup | Configurable **25% on reference provider cost**; `charge_micros = ceil(provider_cost_micros × 125 / 100)` using integer arithmetic. This is a trial policy, not a promise of future pricing. |
| Example | A US$0.08 provider cost becomes US$0.10, or **10 credits**. A US$0.002 provider cost becomes US$0.0025, or **0.25 credits**. |
| Display precision | Show the headline balance to two credit decimals and detailed activity to at least four. If a nonzero charge rounds below 0.01 credit, show `<0.01` rather than `0`. |

The provider-cost calculator uses a versioned, server-side price catalog for the actual provider, model, processing tier, and billable unit. Text pricing distinguishes input, cached input, output, and provider-specific reasoning rules; image, search, map, and storage requests may use per-request or other units. A free or zero-priced operation must have an explicit zero rate. An unknown rate cannot silently become zero or consume guessed credits. Snapshot the rate and markup policy on each usage event so later changes do not rewrite history. Provider invoice totals may differ from metered reference costs; keep those figures distinct.

The 25% uplift gives a **20% gross margin on the simulated charge before other costs**, not a guarantee that hosting, storage, support, taxes, or failed work are covered. Measure those costs before setting a real commercial price.

## Domain records

| Record | Responsibility |
|---|---|
| `workspace_credit_entries` | Immutable signed postings: demo/signup grant, usage debit, refund, and operator adjustment. Store workspace, operation when applicable, actor, reason, unique idempotency key, amount in micros, and timestamp. A reset is an adjustment entry, never deletion or rewriting. Extend the planned AUTH-08 table rather than creating a second ledger. |
| `credit_operations` | One editor-visible paid action, with workspace/Topic/Story, action and actor, client request key, authorized maximum, held amount, lifecycle status, timestamps, and eventual charge. It groups all paid provider attempts, including bounded automatic retries. |
| `provider_usage_events` | One provider request or billable result, linked to its operation and existing source receipt where available. Store provider/model, usage quantities and unit types, price snapshot, reference cost, attempt identity, and `measured`, `estimated`, `rejected`, or `uncertain` status. Never store prompts, generated content, API keys, or tokens here. |

The append-only ledger is the audit authority; a materialized balance, if added for efficient reads, is a transactionally maintained projection that can be rebuilt and checked against postings. `available = posted balance − active holds`. Enforce nonnegative available balance for every new reservation, except a separately authorized operator adjustment. Every write is scoped to the workspace resolved on the server; a Topic ID supplied by a browser does not establish ownership.

## Paid-action lifecycle

```text
Editor starts paid action
  → resolve workspace, Topic, actor, and stable action key
  → price a conservative maximum and show it before confirmation
  → atomically reserve at most that amount from available credits
  → execute bounded provider calls; save one usage event per attempt
  → settle the confirmed charge, post one debit, release the unused hold
  → show the actual charge and updated balance in activity
```

The authorization covers **one action maximum**, not an unlimited loop. A provider cost above that maximum is retained as an internal overage and cannot silently increase the user's charge. If the action needs more paid work, stop before another call and request a new explicit action. User-initiated retries get new action keys; resuming the same in-flight operation reuses its key and receipts.

Reserve and settle through an atomic database operation serialized per workspace (for example, a PostgreSQL function that locks the workspace row and updates the ledger/hold in one transaction). The current Neon HTTP client does not offer the interactive transaction pattern this workflow needs in application code. A browser balance check, process-local mutex, or separate read-then-insert statements cannot prevent concurrent overspending. Unique operation and provider-attempt keys prevent repeat charges when HTTP requests or workers retry.

| Outcome | Credit treatment |
|---|---|
| Provider rejects before billable work | Record rejection; release its unused hold; no usage debit. |
| Confirmed paid usage, including bounded AI repair/retry | Record every provider cost; charge within the authorized action maximum. |
| Provider may have charged, but usage/result is unknown | Keep a visible `pending` hold and reconcile the same request; never repeat the provider call solely to discover its result. In the demo, release an unresolved hold after 24 hours and absorb any unknown cost internally; review that deadline before real billing. |
| System failure produces no usable artifact | Retain provider-cost evidence, then issue a compensating credit refund for the user charge. Never remove the original posting. |
| Settlement write fails after a provider result | Resume settlement from the durable operation/attempt identity; no second provider call or second debit. |

The existing `creative_text_calls` receipts remain the source for their measured costs and Story budget. Connect them to the new operation/usage records with unique references; do **not** subtract credits once from `creative_text_calls` and again from a generic meter. The Story budget and workspace wallet both have to permit a new call.

## Demo reset and future signup

The demo reset computes the adjustment needed to bring **available** balance to exactly 1,000 credits and posts it with an idempotency key, timestamp, actor, and reason. It refuses while operations have active or uncertain holds; resolve those first so later settlement cannot surprise the operator. Repeated submission of the same reset request returns the same adjustment. A later, intentional reset is a new adjustment and keeps prior debits visible.

Before login exists, reset is a local/development operator action only, executed server-side; it is not a button authorized by the shared browser collector secret. Once AUTH-04–06 provide authenticated workspace access, show reset only to an explicitly authorized admin in demo mode. The future signup grant remains a separate idempotent entry per workspace. Its amount must be settled with AUTH-08 before auth rollout; existing demo balances are not silently copied to new users.

## Coverage and rollout

| Area | Current evidence | Work before claiming complete credit coverage |
|---|---|---|
| Creative Studio text | Per-call reservation, rate snapshot, and usage in `creative_text_calls` | Link to credit operations; reconcile retries and unknown outcomes without double charging. |
| Editorial evaluation and AI research | Run or response token counts in parts of the pipeline | Capture provider/model and per-attempt usage and pricing at the provider boundary. |
| Image generation and edits through fal | Asset and request history, but no shared wallet meter | Capture billable model, quality/size, image count, provider receipt, and attempt cost. |
| Maps, place previews, search, and other paid APIs | Feature-specific limits or quotas | Inventory the paid endpoints and add their actual unit prices before charging them. |
| Non-billable editing, review, saved previews, publishing | No AI provider call inherent to the action | Keep these at zero credits unless a specific paid sub-action is requested and disclosed. |

Roll out in **observe mode** first: record simulated provider cost and the would-be credit charge, but do not block work. Label the UI `Demo credits · metered activity` and name any areas still unmetered. Then add holds and enforcement only for actions whose provider calls, retries, pricing, and recovery paths are covered. A global low-balance gate requires an audit of *all* paid paths, including automated workflows and workers. Provider-side spending limits remain a separate safety control.

Implementation sequence: (1) shared ledger and demo grant/reset; (2) price catalog and usage-event contract; (3) Creative Studio adapter and reconciliation; (4) evaluation, research, image, and other paid adapters; (5) action estimates, receipts, and enforcement; (6) authenticated workspace handoff and real-money policy, if later authorized. These are slices of one feature, not separate wallets or provider-specific billing systems.

## Interface contract

- Show `1,000 demo credits` in the workspace header or account area, with a link to a concise activity view. The credit count is the primary unit; USD is an explanatory conversion in demo mode.
- Before a paid action, show an estimate or `up to N credits`, the applicable action scope, and a clear insufficient-balance state. Opening a page or saved preview never spends credits.
- After completion, show actual credits used, pending holds, and a readable receipt grouped by action. Keep provider/model and detailed pricing in the activity detail, not the primary editing flow.
- Distinguish `available`, `pending`, `spent`, and `refunded` with text and non-color cues. Update balances after settlement and announce the change accessibly.
- Use English interface copy and the shared UXDSL patterns. The UI must not expose private provider receipts, prompts, credentials, or another workspace's activity.

## Acceptance gates for implementation

1. A seeded demo workspace receives exactly one 1,000-credit grant. Reset reaches 1,000 available credits, preserves history, and is idempotent; active holds block reset.
2. Concurrent reservations cannot make available balance negative. Duplicate action/attempt requests never repeat provider work or ledger debits.
3. Text, image, and any other enabled paid adapter report the correct billable units and rate version; no unpriced provider call is treated as free. Existing historical runs receive no retroactive charge.
4. A measured call settles to the policy charge, releases unused hold, and preserves the provider cost separately. Rejection, timeout, failed settlement, refund, and stale hold paths have focused tests.
5. The displayed estimate is an authorized maximum for that action. The final user charge cannot exceed it; unexpected provider overage is internal.
6. A coverage audit names every paid route, worker, fallback, and retry before a **global** balance gate is enabled. UI language reflects partial coverage while the audit is incomplete.
7. Workspace scoping and operator-only reset are verified after authentication lands. No balance or reset mutation is trusted from the client.

Documentation-only architecture in this change: no credits are granted or deducted, no pricing policy is deployed, and no publication behavior changes.
