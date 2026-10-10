import type { Draft2Skill } from "./draft2-skills";

/**
 * The focus skill: what a story is for, decided after its facts are verified
 * and before any hook is written. Claude decides it; the editor reviews it
 * and may change any field; the Opening follows it (hooks skill, "Focus").
 */
export const FOCUS_SKILL: Draft2Skill = {
  name: "focus",
  version: "1",
  text: `# The focus of a story

The focus is the brief every later step follows: which editorial line the
story serves, whom it speaks to, how it is framed and told, what it should
earn and in what voice. Decide each field from the verified facts and the
publication's configuration. The editor reviews the focus and may change any
field; it is guidance for the writing, never evidence.

## Fields
- line: the editorial line the story serves, among the Topic's lines; their
  objective and themes say what each is for. Prefer a line that found the
  story (foundBy) unless another's objective plainly fits it better. lineId
  is null only when the Topic has no line.
- audience: the part of the publication's audience this story speaks to, as
  one concrete phrase (who, where, in what situation), at most 40 words.
  Never wider than the publication's audience.
- framing: "reader-consequence" when a fact establishes a concrete change for
  the audience (what they pay, owe, can do or must decide); "explainer" when
  the value is understanding how something works or what happened;
  "authority" when the news is the decision, the institution or the expert
  itself. When the publication sets a framing (topicDefaults.framing is not
  "auto"), keep it unless the facts cannot support it, and say why.
- readerConsequence: one sentence, in the publication's language, of what
  changes for the audience, resting only on the facts it cites (factIds),
  with every qualifier they carry: a proposal stays proposed, an estimate an
  estimate, an allegation attributed. text is null and factIds empty when no
  fact establishes a consequence; the framing cannot then be
  reader-consequence.
- structure: "list" when the facts enumerate three or more distinct items a
  reader can act on or choose between (events, places, tips, changes), with
  the first fact of each item, in order, in itemFactIds; "steps" when the
  facts give an ordered procedure (a recipe, a setup), with the first fact of
  each step in order; otherwise "arc", one story with one tension, and an
  empty itemFactIds. A story that mentions several things while making one
  point is an arc. When the publication sets a structure, keep it unless the
  facts cannot support it, and say why.
- goal: what the carousel should earn. "followers": a reason to come back
  for the next story, the default when nothing fits better; "saves": a plan,
  a list or a reference worth keeping; "shares": something a reader sends to
  a particular person; "discussion": a question the facts leave genuinely
  open, never a controversy the facts do not show. Start from the
  publication's goal and move only when the story clearly earns another.
- voice: the story's gravity and its tone on the publication's five dials
  (1–100). Gravity: "grave" for war, death, injury, illness or legal
  jeopardy; "serious" for consequential news told plainly; "ordinary" for
  most stories; "light" for play, food, leisure and curiosities. Start from
  the publication's defaults and move each dial only as far as the gravity
  requires: a grave story is told straight (humor near its floor,
  provocation low); a light one may raise humor and energy within the brand
  personality.
- direction: one paragraph, at most 1,500 characters, in the publication's
  language: what to lead with, which facts carry the promise, what to leave
  out or keep for later slides, and what the reader takes away. It guides
  the writer; it never adds a fact.

## Rules
- Use only the verified facts: no consequence, number, date, cause or name
  they do not give. Compare dates with today: an elapsed deadline is
  context, never urgency.
- A famous name is not a reason; relevance to this audience is.
- editorChoices are the editor's decisions. Return each exactly as given and
  decide every other field so it fits them: a "saves" goal changes the
  direction; a "list" structure needs its items; an "explainer" framing
  changes what the reader consequence is for.
- reasons: one sentence per field on why, naming the facts that decide it.
  For a field in editorChoices, say how the other fields fit it.`,
};

export const FOCUS_ROLES = {
  "focus-editor": `You decide the focus of a story for the publication described below, from its verified facts (cite their ids), the publication's defaults (topicDefaults) and its editorial lines (lines, with the ones that found the story in foundBy). The story's title is context, not a fact. Follow the focus skill and return every field with a reason for each.`,
} as const;
