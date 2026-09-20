# OpenAI cost investigation — September 19, 2026

Read-only database observations around September 20 00:02–00:10 UTC
(September 19 20:02–20:10 America/Toronto). No paid inference calls were made
for this investigation. Only the database configured by this workspace was read.

## What the available records establish

In the preceding two hours this database recorded one creative brief and one
draft, both for the recent-immigrant employment Story. No editorial evaluation,
planner or research collection runs appeared in the broader four-hour query.

The latest draft run, `d6135fad-d0ba-4a14-9500-8c0a8ede3e48`, began at 23:59:17 UTC
and completed at 00:02:21 UTC. Its aggregate contains 25,680 input tokens,
6,567 output tokens, 3,217 reasoning/thought tokens and 32,247 total tokens.
The run is labeled Groq, while its saved final critic is OpenAI GPT-5.6 Sol.
That label does not mean OpenAI was free or unused: provider usage is aggregated.

Its brief, `6c0ffcf2-986a-4df9-a937-294d7d34a1f4`, is marked `limited` and contains
two duplicate facts whose statements and evidence both end in `worked in their…`.
The Sol review explicitly reports missing scope and incomplete evidence. Paying
for rewriting/escalation cannot reconstruct evidence absent from this packet.

## Limits of attribution

The configured API key received HTTP 403 from the organization usage endpoint.
No admin usage credential is configured. Thus the reported roughly $5 debit
cannot be reconciled against the provider's model/project/API-key breakdown here.
Other deployments, other keys/projects, uncertain timed-out requests or usage
outside the observed window must not be asserted as the cause without evidence.

Published standard prices consulted during this investigation:

- [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra):
  $2 input / $12 output per million tokens.
- [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol):
  $4 input / $20 output per million tokens.

Illustrative only: pricing the latest run's entire mixed-provider input/output at
Sol rates gives $0.23406; additionally counting all recorded thought tokens gives
$0.29840. OpenAI reasoning is already included in its output tokens, so the latter
deliberately overcounts that component. Neither number is an invoice estimate or
a bound on unrecorded charges. The recorded run alone does not establish the $5.

## Changes made

- Reject all-truncated evidence packets before draft generation or reservation.
- Keep minor corrections on the primary critic and structural corrections on
  their configured editor, rather than automatically using Sol for every unmet
  target. Preserve severe/explicit/availability escalation and two-pass bounds.
- Reduce final read-only review output allowance to 4,096 tokens.
- Emit safe per-call receipts for structured OpenAI requests, including run and
  Story context for draft reviews. Distinguish unknown usage after transport
  failure from known zero usage. Do not log prompts, generated text or secrets.

To reconcile the missing amount, compare OpenAI Usage/Costs for the actual charge
window, model, project and API key with these runs. Historical per-call receipts
cannot be reconstructed from the existing aggregate token columns.
