# Draft 2 — Choosing the writer and the judge

Built 2026-10-16 from the editor's ask: "before starting, a dropdown for the
generator and one for the evaluator, so the user chooses the model."

## What the editor sees

A **Models** card on the overview (above the autopilot) and at the top of the
Facts screen, with two selects:

- **Writer**: who writes the Opening, the Closing, the Deck, the visual script
  and the caption.
- **Judge**: who judges them (and proposes its own candidates).

Each select offers "Default" (today's cast from the environment: Claude
Sonnet 5.5 writes, `DRAFT2_MODEL_JUDGE` or Sol judges) and the models the cost
meter prices, each with its list price per million tokens:

| Model | Input | Output |
| --- | --- | --- |
| Claude Sonnet 5.5 | $2 | $10 |
| Claude Opus 5.5 | $4 | $20 |
| GPT-6.1 Sol | $2 | $10 |
| GPT-6 Luna | $0.10 | $0.50 |

The descriptions give what the roles cost in the last real stories (writing
about $1.10 a story, about three quarters of the text cost; Luna judging about
$0.06 in about 90,000 output tokens), and a warning shows when one model
writes and judges ("the gate is only as strict as the judge").

The Facts, the Focus, the Spine, the Review and the image reviews keep their
own models.

## How it works

- The choice lives on the session (`draft2_sessions.models`, migration 0112,
  `Draft2ModelChoice`: `{ writer?, judge? }`, each `{ provider, model }`).
  Before the story has a session, the canvas holds it and sends it with the
  Facts request, which creates the session with it; it is also remembered in
  the browser as the default for the next story.
- Changing it on a session (`PATCH /api/radar/draft2/session`) applies to the
  next runs; a run in progress keeps the models it started with (every run
  records `writer` and `judge`).
- The funnel runner takes the session's choice over today's cast for a new run
  (`runFunnelStep`). Any provider can play either role: an OpenAI writer
  writes at medium effort with the context in its instructions; a Claude judge
  gets its evaluation schema without enums inside arrays
  (`funnelSchemaWithoutArrayEnums`), since Anthropic's strict schemas compile
  to a size-limited grammar; the parser maps an unknown issue code to OTHER
  and drops a proposal with a value outside the contract.
- Only the offered models are accepted (`parseDraft2ModelChoice`); the
  screens name the chosen models (`castWithChoice`).

## Measured before choosing (2026-10-15/16)

The corn story's $1.48 of text: Claude Sonnet writing $1.11, Claude reviewing
the facts $0.12, Sol extracting them $0.13, Sol reviewing the images $0.07,
Luna judging every funnel round $0.06 (93,000 output tokens). Opus was not
used. Judging with Sol or Sonnet costs twenty times Luna's price per token;
Sol writing costs the same as Sonnet per token, and when Sol wrote the
openings (2026-10-09/10, revisions 1 to 5) no run reached 95 and Claude's
ideas came out flatter after Sol developed them, which is why the roles were
swapped.
