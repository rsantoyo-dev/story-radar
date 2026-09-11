# Article content recovery

Failed direct/Reader preparation opens the content viewer with recovery controls.
The original story URL is retained.

- Find alternative sources searches for republications of the same article using
  the configured OpenAI key/model and existing daily AI budget/accounting. Only
  URLs actually present in provider search sources are offered. These remain
  candidates; the editor checks author, date and event before confirming.
- Read source URL uses the existing SSRF-protected direct/Reader extractors.
- Save pasted article requires a source URL, explicit confirmation and at least
  50 words/300 characters, capped at 100,000 characters. Existing access-wall
  and extraction checks apply. Enrichment method `manual` distinguishes input
  from fetched content; both original and extraction URLs are visible.
- Fetching/validation happens before saved enrichment is touched. Drafts and
  assets are not rewritten or approved. Re-evaluate and review against the new
  evidence. This uses the existing shared story content model, not a separate
  per-topic revision store.

Migration `0061_empty_dragon_man.sql` adds only the manual enrichment method.
The recovery API retains collector authorization and active-topic membership
checks. No publisher access controls are bypassed.

Manual QA: blocked preparation opens recovery; candidate can be selected and
read after confirmation; failed alternative extraction retains existing text;
pasted text displays its manual provenance; existing drafts stay unchanged.
