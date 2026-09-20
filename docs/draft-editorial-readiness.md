# Draft generation and automated editorial readiness

The generation pipeline aims to produce an independently validated draft without
requiring a person to repair routine copy. Editorial readiness is distinct from
permission to publish: existing Topic, asset and publication approval controls
still apply. No score guarantees audience growth or perfect factual accuracy.

## Current execution

1. Reserve a creative attempt in the database. Reservations serialize per Topic,
   count all attempts against the UTC daily limit, and reject an identical
   in-flight task/input hash. Failed attempts remain counted because a failed
   operation may already have incurred charges.
2. Generate from the creative brief, including its evidence, claim guards,
   qualifiers, format plan, audience and conversion goal.
3. Reject packets consisting only of unfinished excerpts before paid generation.
   Run deterministic repairs and editorial checks. OpenAI reviews and may rewrite
   the draft; a second pass handles unmet targets. Minor defects stay on the
   primary critic and structural defects use the configured structural editor;
   severe defects, explicit escalation and availability fallback can use Sol.
   A valid hook comparison is necessary for acceptance.
4. Preserve the stronger factually safe candidate when a later rewrite is worse.
   A successful fallback retains the first model's failure as recovered history,
   rather than treating it as an ongoing outage.
5. Apply bounded final copy patches if necessary. Cover policy and any other
   post-review text change invalidate the preceding verdict.
6. If the final copy changed, reserve time for one independent, read-only OpenAI
   review. It scores the actual final text and reassesses its hook and payoff.
   Provider-supplied replacement copy is never applied by this review. There is
   no recursive rewrite/review loop. If this review is unavailable, the corrected
   copy is saved with an explicit unresolved validation marker.
7. Daily preparation continues only when the review is current, independently
   accepted, all applicable score thresholds pass, the hook matches the saved
   cover, and no blocker remains. A fallback audit or stale verdict cannot
   substitute for that result.

## Editorial criteria

The existing quality thresholds remain authoritative: factuality 96, overall
90, hook 90, curiosity and resolution 88, relevance and clarity 80, carousel
continuity and swipe reward 80, and applicable CTA quality 75, on a 1–100 scale.
These are model assessments constrained by deterministic findings, not measured
probabilities or a promise of virality.

Human relevance must come from supported circumstances, consequences and
contrasts. Each slide should answer its planned viewer question and earn the next
swipe; the closing must resolve the opening. Questions and CTAs follow the
configured conversion goal, rather than forcing engagement questions into every
Story. Claims, populations, dates, estimates, attribution and uncertainty remain
bound to their evidence. A weak closing cannot pass merely because its CTA was
fixed or a model assigned a high overall score.

## Limits and recovery

- Per draft: at most two OpenAI review/rewrite calls plus one final read-only
  review if post-review copy changed. Final patching remains limited to two
  attempts. Provider-specific transport/fallback limits still apply separately.
- The final read-only review has a 4,096-output-token ceiling instead of the
  12,288-token carousel rewrite allowance. Reasoning tokens share that output
  allowance; they are not an additional quota.
- A generation deadline bounds continuation and reserves time for the final
  reviewer before starting paid final patches.
- Missing evidence, provider outages and exhausted budgets remain explicit
  stopped states. They do not trigger indefinite retries or automatic approval.
- An orphaned `running` reservation is not automatically treated as a failed
  charge-free request. Recovery must establish its outcome before duplicating it.
- Usage records currently aggregate providers within a creative run. They are
  not an OpenAI billing ledger; exact cost attribution requires per-call usage
  records and provider billing reconciliation.
- Structured OpenAI requests emit `[openai-usage]` server-log receipts for start,
  response, HTTP error and uncertain transport outcomes. Draft receipts include
  run/Topic/Story IDs; response receipts include request ID, input/output/reasoning
  tokens, cached input and search-call count. They omit credentials and content.
  Logs are operational diagnostics, not a durable billing database; research and
  embeddings use separate adapters and are not covered by these receipts.
- This change does not introduce unattended publication authorization, remove
  human asset/publication approval requirements, or rewrite saved historical
  drafts. Those are separate workflow capabilities requiring explicit persisted
  policy, immutable publication packages and destination-specific controls.

## Regression coverage

Tests exercise malformed hooks, model fallback recovery, minor-defect escalation,
read-only final verification, an unavailable final reviewer, unchanged evidence
assignments, stale approval rejection, score and hook readiness, stopped daily
progression, concurrent reservations, daily quotas and failed-attempt accounting.
Provider responses are simulated; these tests do not measure real-world audience
performance or certify the quality of a specific generated publication.

### Brief fallback integrity

Brief schemas bind `editorialAngle.taxonomyVersion` to the supplied Topic version
and constrain angle keys to enabled lenses. Runtime validation remains authoritative.
Groq and Cloudflare prompt compaction preserves exact source passages, fact
packets, key facts, taxonomy, carousel plans and validation feedback. If these
required inputs exceed the provider context budget, raw Story text may be reduced
to a contiguous prefix ending at a complete sentence, explicitly marked as partial
source evidence. Verified facts and their citations remain intact. If those required
inputs still cannot fit, generation fails explicitly instead of inserting ellipses
into citations or silently dropping lenses. Optional absent fields remain absent.
Validation retries resume at the provider that returned the previous brief;
failed earlier providers/accounts are not restarted. Cloudflare remains the final
transport fallback. Successful recovery retains the original fallback reason.
These changes do not repair historical truncated evidence or waive factual checks.

Every copy change inside the editorial gate invalidates the full review, even when
its hook comparison remains current. A pending copy-review marker triggers the
bounded final read-only audit even if the outer repair changes nothing. Acceptance
requires three valid, distinct hook candidates; invalid alternatives can retain the
paid draft for repair but cannot authorize automated continuation.

Missing initial slide headlines are retained as explicit empty fields for the
existing deterministic/editorial repair stage, rather than aborting and buying a
second complete script. Provider schemas require non-whitespace headlines; revised
editorial outputs still parse strictly. Missing-headline blockers and independent
review remain mandatory before acceptance. Draft validation retries resume from
the successful provider instead of restarting failed Gemini accounts.
