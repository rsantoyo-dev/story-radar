# Draft 2 · v4 "draft first"

2026-10-23. The editor: "los carruseles deben salir 9.5 sobre 10 en todo
sentido de primera mano… en menos de 15 minutos", and the idea behind it:
after the Spine, write the whole carousel with a strong model and correct
from it, instead of building it part by part. v4 is a recipe on the same
engine (`session.pipeline`), beside v3 and v2, chosen in the Models card
before the facts. It changes nothing for a v2 or v3 session.

## Why

Fifty-four sessions with images (14 days, 40 published):

- Each part judged alone scores about 91 (Opening 91, Closing 93, Deck 91);
  the whole carousel, read by the Review, scores 74. The Review's patches sit
  between the parts: repetitions on slide 2 and the penultimate (22), truth
  slips on the penultimate and the last (17). The Closing is written before
  the Deck, which fills the middle afterwards.
- The light judge (Luna) judges 47 runs of 54; originality is 77–78 on every
  part, and the gate (95) is almost never met, so every funnel runs all its
  rounds.
- The visual script is the weakest part (87; OFF_BEAT 32, INVENTED_DETAIL
  27), written after and apart from the words: a show under a dome got an
  open midday sky.
- Median US$1.59 and 24 model-minutes per run.

Phase 0 calibrated the judge against the publication's auditor: four
published carousels, clean and with the auditor's real findings seeded back
(24), read by four judges (`scratchpad/calibrate-judges.mts`, US$2.37).
Found: Luna at low 15/24, missing the guard a crime story needed; Sol at high
20/24 but 200 s a call; Sonnet 5.5 at high about 22/24 in 44 s; Opus 5.5 at
high about 21/24 in 50 s. Both strong judges also named real defects of the
published versions (a "vous" in a "tu" post, a claim no fact gave, the phrase
that sent the dome's image outdoors).

## The recipe

Facts → People and places → Focus → Spine → Accounts to tag, as in v3. Then:

1. **Draft** (the Opening step of a v4 session, `draft2-draft.ts`). One call
   to Opus 5.5 at high effort writes the whole carousel: three covers on
   three levers (the first its own pick), slide 2, the middle slides as the
   deck's shape asks, the closing, **each slide's image intent** (what is
   seen and why, tied to that slide's words) and **the caption with its first
   comment**. Skills: drafts, hooks, levers, decks, closings, fairness,
   reader and the story's creative skills, with what each tells the three
   writers it replaces. The program checks every part as its funnel would;
   what it finds goes back to the writer once, and the program keeps the
   draft with fewer findings. The cover the draft goes on with is the first
   the program finds nothing on. The words are stored as the Opening, the
   Closing and the Deck (one version each, with the snapshots the later steps
   read), the intents and the caption on the opening run (`draft`), so hand
   edits, the images, the caption and the publication work unchanged; earlier
   runs stay as summaries. A server pass with less than 150 s left pauses it
   for the next pass.
2. **Visual script**: v3's, one round. Each slide's beat is the draft's image
   intent (over the spine's image line), so the script writes the direction
   in the brand's style from a subject chosen with the words, instead of
   reinterpreting them (the dome show's midday sky came from that).
3. **Review of the whole carousel**, after the visual script and before any
   image: Sonnet 5.5 at high effort reads each slide's words beside its image
   direction, with the calibrated reading (skills/review.ts,
   `REVIEW_V4_SECTION`). Besides its text patches it may patch up to four
   image directions (owner "visual", field "direction"), checked against the
   script it quoted and the brand's avoid list. The autopilot applies the
   necessary kinds (truth, repetition, detail) as before; a direction patch
   changes the chosen script's slide, which the images then follow. A new
   script asks for a new reading (`reviewCurrent` with its `visualId`).
4. Images, as in v3.
5. **Caption**: the caption the draft wrote, checked by the program against
   the finished images (credits, source line, the accounts confirmed, the
   rules); what it finds goes back to the caption writer once, and the
   program keeps the version with fewer findings. No writer from scratch and
   no judge: the whole-carousel review read it with the slides. Stored as a
   caption run of one version, so the Caption screen, the first comment and
   the publication work as they do.

Next, in the same shape: the review reads the drafted caption beside the
slides and may patch it (owner "caption"), as it patches image directions.

Estimated: about 10–12 minutes and US$1.1–1.4 a run (to be measured).

## Phase 3: beside v3

v4 becomes the default only after it is run beside v3 on the next stories
and the auditor reads both without knowing which is which: at least 95 on
the auditor's reading, 15 minutes, US$1.5. Until then a story is drafted in
v4 by choosing it in the Models card before the facts; choosing v3 again
returns to the funnels.

## Models and knobs

- `DRAFT2_MODEL_DRAFT_WRITER`: another Claude for the draft (default
  `claude-opus-5-5`).
- `DRAFT2_MODEL_REVIEW_JUDGE`: the review's editor, as before (default the
  Anthropic default, Sonnet 5.5); v4 runs it at high effort.
- Migration 0120 lets a session's pipeline be "v4".

## Addendum, 2026-10-24: the first whole-carousel run, and what it taught

ART[O] (two free exhibitions, Saint-Jean), a fresh v4 session, server job to
the caption: 7.5 model-minutes, US$1.32. The draft (136 s + a 50 s fix,
US$0.55) wrote the words, each slide's image intent and the caption; the
review (84) patched one text and one image direction before any image; five
images of six passed at once; the drafted caption passed the program's nets
with no call. The auditor read it at 7/10: the end of the exhibitions
("jusqu'au 25 octobre") stood on the last slide alone two days before it; the
cover gave a total of two exhibitions to one; slide 2 named the exhibition and
the organization called after it in one line; a quote joined two sentences;
the story's subject (faces made of waste) was never seen, since no verified
photo exists. The rules that came out of it: `DEADLINE_OFF_COVER` and a
scheduling refusal after the end date, `QUOTE_NOT_VERBATIM`,
`NAME_COLLISION`, typography settled at parse, `subjectsUnseen` on the visual
run, and the drafts (v3), review v4 (v2) and image-judge skill lines.

The Draft screen (`/draft-2/draft`, between the Spine and the Opening) shows
the whole carousel as the steps stand: each slide's words, its image intent
on a v4 session, the program's findings and its texts editable in place (a
change goes to the owning step); the three covers to choose; the caption and
first comment as drafted. On a v4 session "Write the draft" writes the whole
carousel; on any session the screen reads the parts as one carousel.

Testing goes step by step from here (the editor's choice, 2026-10-24): each
step run from its own button, read, and the code fixed before the next.
