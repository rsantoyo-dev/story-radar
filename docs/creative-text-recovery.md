# Creative text recovery and spending

Current draft execution uses the **Unified correction path** described below: one correction per tier, with no intermediate Luna copy-repair loop when an independent reviewer is configured. Two-attempt counters described in historical policy sections remain safety ceilings, not a requirement to execute every slot.

Creative Studio now keeps a cumulative USD text budget for each Topic + Story. It does not reset when a user regenerates a brief or draft, changes format, retries a failed request, or starts a new day. `CREATIVE_STORY_TEXT_BUDGET_USD` defaults to `1`; changing it changes the ceiling, without erasing spend. The existing daily run limit still applies to generation. Editorial correction is bounded to two Terra patch attempts followed, when needed, by two Sol patch attempts. Each changed copy receives a separate read-only Terra audit. Initial reviewer availability can fall back to Sol. The same cumulative budget and request deadline can stop the process before all attempts are used.

Apply migration `0075_chemical_swarm.sql` using `npm run db:migrate` before deploying this code. It adds three tables; existing drafts, briefs, assets and approval history are retained. To roll back application code, retain these tables and their accounting history.

## Resume instead of regenerate

Use **Repair and review saved draft** on an unapproved primary draft. Save any manual edits first. This uses the saved brief, facts, qualifiers, carousel plan and draft; it does not refetch raw sources or regenerate the brief. It patches the pending findings and then runs the independent critic. Fact references and stable slide IDs are retained. Human approval is still required, and a rejected or unavailable critic cannot be bypassed.

A recovery request has a stable UUID and expected draft version. Concurrent workers cannot claim the same draft. A patched checkpoint survives critic failure; a reviewed checkpoint survives a draft persistence failure. Retrying the same request resumes its checkpoint. A completed request does not call the model again. An abandoned worker can be reclaimed after ten minutes; a lease token fences its late writes. If a person changes the draft version, an old checkpoint remains historical and cannot overwrite that change.

Fresh generation saves the first parsed draft before editorial refinement, so a subsequent review/provider/budget error leaves a recoverable draft. Replacing an existing draft retains the prior saved version until the replacement succeeds. Provider calls themselves are not replayed idempotently: a timeout can mean the provider already charged. Its reservation remains counted; repeating the failed stage may incur a second charge, still subject to the cumulative ceiling.

The feature does not enable a schedule or autonomous publication. The recovery service can be invoked by a future workflow worker with the same persisted request ID.

## What the displayed cost means

Metered scope: Creative Studio focus suggestion, brief, primary draft, companion script, and their nested author/reviewer/repair calls, including recovery. Images, story ingestion, scoring, research and separate documentary workflows are excluded. Earlier calls cannot be reconstructed from token receipts that were only logged, and are not retroactively estimated.

Before each call, a database transaction locks the Topic and reserves a conservative token estimate: UTF-8 request bytes plus overhead, and the output ceiling. On confirmed usage the ledger settles to estimated token cost. Explicit request rejection releases the reservation; a transport error, unknown usage or failed settlement keeps it counted. This controls estimated spend, not the provider's invoice; provider-side billing limits remain the authority for a hard account-wide dollar cap.

Cost per accepted carousel is total metered text cost in the Topic divided by distinct metered carousel draft IDs that have passed a current independent review or received human approval. It includes unsuccessful attempts and upstream briefs; multiple revisions of the same accepted draft do not increase the denominator. It is a production efficiency metric, not an invoice allocated to one carousel. Companions and other creative formats contribute text cost. Unknown/reserved amounts are shown separately and are not included in the settled average. Historical drafts with no metered calls do not increase the denominator.

## Pricing

`CREATIVE_TEXT_PRICES_JSON` may contain verified USD-per-million-token rates keyed by `provider/model`, for example:

```json
{"openai/gpt-5.6-luna":{"input":0.2,"output":1.2,"cached":0.02}}
```

Rates are snapshotted per call. Unknown providers/models fail closed until configured; configure Groq/Cloudflare rates before enabling those fallback models. A configured zero rate is allowed when verified for the account, but provider quota limits still apply. Google uses the paid rate conservatively for both API keys; the application cannot infer whether an account is eligible for free-tier billing. Actual free-tier charges may therefore be lower than the estimate. Gemini reasoning is added to candidate output; OpenAI reasoning is already included in output tokens. Where a response does not expose cached tokens to the adapter, input is conservatively charged at the uncached rate.

Built-in reference rates checked September 20, 2026:

- [OpenAI Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna): $0.20 input / $1.20 output / $0.02 cached.
- [OpenAI Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra): $2 / $12 / $0.20.
- [OpenAI Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol): $4 / $20 / $0.40 promotional rates. Built-in OpenAI rates require refreshing by November 22, 2026; configure verified rates to continue. Long-context estimates use the higher tier above 272K input tokens.
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing): Gemini 3.6, 3.7 and 3.8 Flash $0.75 / $3.75 / $0.075 through December 2026, doubled from January 2027.

No credentials, source text or generated output are stored in the call ledger. Recovery checkpoints intentionally persist draft/brief content in the application's scoped database so it can be resumed and audited.

## Premium editorial correction policy

Draft prompt versions: meme v27, carousel v47, sequence v6. Initial writing is unchanged: the configured author generates the draft, and the critic evaluates that exact copy without rewriting. An already accepted draft does not incur corrective calls.

Acceptance requires hook **96/100** (strictly above 9.5/10), factuality **98/100**, and all other applicable editorial dimensions **95/100**. These are internal editorial estimates, not guarantees of audience performance or rendered-image quality. Concrete factual defects still block regardless of score. Existing human approval and explicit editorial overrides remain separate from automated readiness.

Repairs use the configured structural model (Terra by default), at most twice, then the configured severe model (Sol), at most twice. They may patch only supported text within the implicated slide/publication scopes; they cannot change facts, IDs, order, roles or brand references. A separate read-only critic request evaluates every changed candidate against source excerpts and the complete carousel plan; the correcting request cannot award its own approval. The default reviewer is Terra, including after a Terra patch: independence here means a separate audit invocation, not a guarantee from using a different model.

A no-op or a correction that fails to improve the reviewed result ends that tier early. A regression restores the prior reviewed version. Failed provider requests stop with a concrete cause rather than spinning through four edits during an outage. Attempt counts, early-stop flags, pending verification and the prior verified version are saved in the existing draft/checkpoint JSON; resuming does not reset the correction allowance. No new database migration is needed.

If a crash happens after a patch is saved, resume verifies that patch rather than rewriting again. A crash before the patch result is saved still consumes its reserved attempt; unknown charges remain reserved in the text ledger. A manual edit invalidates pending AI verification and is audited as the current copy, while retaining the prior attempt counts. A new generation can start a new draft correction allowance, but never resets the accumulated Story budget.

Invalid patch output is distinct from a valid no-op: a locally rejected patch records its validation reason and gives the same tier its remaining attempt, with that reason supplied as feedback. It still counts toward the two-attempt limit. A valid no-op or independently verified non-improvement can stop a tier early. Stop diagnostics include actual attempt counts, below-threshold scores and concrete unresolved blockers. Older generic stop messages are expanded when read, without changing the saved review, approval, spend or attempt allowances.
For the legacy generic-stop state only, resuming can reopen an early-stopped tier's unused allowance because the old adapter did not distinguish invalid patches from valid no-ops. Existing attempt counts are never reset: a draft with one Terra and one Sol attempt can make at most one additional attempt with each. New stop states do not reopen early-stopped tiers.

## Narrative planning before copy repair

New carousel briefs (brief prompt v35, carousel draft v47) receive a Terra plan review before script writing. The review receives the shared carousel policy, all local plan errors, and, on correction, the exact rejected response. Invalid proposals are corrected on the same evidence and brief, with at most two Terra and two Sol calls. These corrections consume the existing downstream repair allowance; they do not add four new draft repairs. A valid initial keep consumes no repair slot. Operational failures (quota, budget, transport) stop immediately instead of using editorial attempts. A planner can shorten a proposed carousel to 3–8 slides when evidence cannot support a longer arc. Revised hooks and questions must pass the factual-scope checks as well as plan validation. The reviewer may keep the plan or revise its angle, proposed hook, question sequence and assignments of existing facts. A kept plan is not rewritten. The review decision, reason, model, evidence fingerprint and original plan/angle/hook are stored within the existing `carouselPlan` JSON. Source statements, excerpts, qualifiers, format preferences, acquisition classification and brand configuration are not changed. Narrative validation errors in an otherwise parsed and source-grounded initial carousel brief are deferred only when a configured preflight reviewer will resolve them. Invalid shapes and factual errors remain blocking. Failed preflight validation stops brief creation only after its bounded corrections; an invalid keep cannot bypass validation. Within this request, the brief and evidence are reused. If all planning corrections fail, no approved brief is persisted: retrying that failed brief still starts a new run under the same cumulative Story budget. This is not a durable brief checkpoint or a guarantee that every source supports an acceptable plan.

For an existing unapproved carousel, concrete structural findings (buried hook, repetition, missing payoff or unanswered questions) can replace one normal repair attempt with one narrative replan. It returns a revised plan and matching script, with the same slide count and known evidence IDs. It uses the model for that attempt's tier and is charged against the same Story budget. A malformed structural proposal records its rejection as a plan failure so the next remaining slot can fix the plan, rather than attempting a text patch incapable of fixing structure. All attempts remain consumed across resumes. Once a valid replan is applied, another restructuring cycle is not added. A preflight that revised the plan consumes that allowance and its recorded Terra/Sol repair slots. Legacy preflight revisions without counts retain their original one-Terra-slot accounting.

The draft's `narrativeRevision` stores the original plan, prior script, revised plan, angle, hook, model, reason and evidence fingerprint. The original brief row is never overwritten during saved-draft recovery. Every subsequent critic, copy repair, manual save and approval resolves the draft's current plan against the original evidence. Changed evidence is an explicit validation failure. The existing version guard, pending-verification checkpoint and regression rollback apply to the plan and script together. Slide IDs and character references are retained; documentary-photo selections on slides whose fact assignments change are cleared, while prior selections remain in history. Asset invalidation and human approval still apply.

Exact repetition between headline/support or between earlier supporting copy and the closing adds concrete findings and caps the relevant score. Semantic novelty and source-grounded payoff remain critic responsibilities; neither fact IDs nor a planner's decision constitute factual verification. The workspace shows a revised draft's current plan separately from its original brief.

The configured author and reasoning effort are unchanged. This implementation does not establish whether a different writer would improve this publication: use a paired evaluation of the same evidence and plan, with human-rated examples, before changing the author globally. A stored provider/model attribution is more reliable than assuming Luna authored every script: the configured chain can use Gemini, paid Gemini, Luna and other fallbacks.

## Avoiding repeated work

A current independent review of unchanged saved copy is reused on recovery. A stale review, a deterministic copy change, or a reviewer outage requires a new review; pending corrections still require verification. Regressions pass the rejected critic findings to the next model while restoring the better copy. Local final-copy patches start on the author transport that already succeeded instead of restarting a failed provider chain. Structural/factual brief retries and malformed draft retries include the previous response, not just an error string. None of these changes raises the Story budget or weakens publication approval.

Immutable fact packets are validated before any narrative-planning request. A missing number or unsupported inference in a fact's own excerpt must be handled by the upstream evidence stage; planners cannot repair those fields. Matching an excerpt after whitespace normalization never bypasses its numeric or inference checks. A number elsewhere in the source is not automatically evidence for the fact's selected excerpt.

Invalid writer `openingExploration` is discarded with a saved `openingExplorationError` diagnostic, rather than forcing a full-script regeneration. Actual slide fact assignments remain strict. The independent critic must still return a valid hook comparison and verify the final cover; writer alternatives never constitute approval.

## Unified correction path

When an independent OpenAI reviewer is configured, draft production now runs the configured author, deterministic normalization (including required cover titles), one independent audit, and a single targeted Terra correction plus verification when needed. Sol receives at most one further correction opportunity when actionable findings remain. The legacy two-call Luna final-copy repair loop is not entered on this path. Each tier is marked stopped after its correction response, including invalid responses, so recovery cannot silently repeat it. Existing two-attempt counters remain hard historical ceilings, and preflight planning attempts still count against them. This policy limits correction calls, not the total number of author, planning and audit calls.

An unavailable independent reviewer preserves the saved draft and stops. No secondary non-independent grounding/rewriting loop is run merely to end in an unapprovable draft. Legacy workflows without an independent reviewer retain their compatibility path and cannot gain independent approval from it.

Structural routing includes role/goal conflicts, fact overuse, missing assigned evidence, fact-budget violations and new closing facts. A preflight revision does not count as a successful script replan: a later script defect may use one remaining correction slot for a plan-and-script revision. Historical attempt counts, saved versions, independent final verification and the cumulative spending limit remain intact. Timing improvements must be measured on future runs; mocked tests establish call order and ceilings, not production latency or quality scores.
