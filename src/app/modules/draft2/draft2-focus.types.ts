import { CREATIVE_CONVERSION_GOALS, type CreativeConversionGoal, type CreativeProfile } from "../stories/creative-content.types";
import { Draft2InputError, Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";
import type { Draft2Provider } from "./draft2-models";
import { TONE_KEYS, toneLine, toneValue, type ToneKey } from "./skills/tone";

/**
 * Focus, the second Draft 2 step: what the story is for, decided once the
 * facts are verified and before any hook is written. Claude decides every
 * field at once from the facts, the Topic's creative profile and its
 * editorial lines; the editor may change any field, and a field the editor
 * set stays theirs when Claude decides again. The Opening follows the focus
 * and its judge scores how well it does. The focus is guidance, never
 * evidence. Everything here is pure: contracts, the schema, parsing, edits
 * and the program's findings.
 */
export const FOCUS_FIELDS = ["line", "audience", "framing", "readerConsequence", "structure", "goal", "voice", "direction"] as const;
export const FOCUS_FRAMINGS = ["reader-consequence", "explainer", "authority"] as const;
export const FOCUS_STRUCTURES = ["arc", "steps", "list"] as const;
export const FOCUS_GRAVITIES = ["light", "ordinary", "serious", "grave"] as const;
export const FOCUS_GOALS = CREATIVE_CONVERSION_GOALS;
export const FOCUS_AUDIENCE_MAX_CHARACTERS = 300;
export const FOCUS_CONSEQUENCE_MAX_CHARACTERS = 300;
/** v1's editorial focus paragraph had the same ceiling. */
export const FOCUS_DIRECTION_MAX_CHARACTERS = 1_500;
const REASON_MAX_CHARACTERS = 400;
/** A line's objective as the focus keeps it; the longest real one is about 900 characters. */
const LINE_OBJECTIVE_MAX_CHARACTERS = 600;
export const FOCUS_LIST_MIN_ITEMS = 3;
export const FOCUS_STEPS_MIN_ITEMS = 2;
export const FOCUS_MAX_ITEMS = 12;
const MAX_CONSEQUENCE_FACTS = 10;

export type Draft2FocusField = (typeof FOCUS_FIELDS)[number];
export type Draft2FocusFraming = (typeof FOCUS_FRAMINGS)[number];
export type Draft2FocusStructureKind = (typeof FOCUS_STRUCTURES)[number];
export type Draft2FocusGravity = (typeof FOCUS_GRAVITIES)[number];

/** An editorial line of the Topic, as the focus keeps it: the revision it was read at and what the line is for. */
export type Draft2FocusLine = { id: string; revision: number; name: string; objective: string };

export type Draft2FocusVoice = { gravity: Draft2FocusGravity } & Record<ToneKey, number>;

export type Draft2FocusValues = {
  /** The editorial line the story serves; null when the Topic has none. */
  line: Draft2FocusLine | null;
  /** Who the story speaks to: the part of the publication's audience it is for. */
  audience: string;
  framing: Draft2FocusFraming;
  /** What changes for the audience, resting on the facts it cites; the editor's own words cite none. Null when no fact establishes one. */
  readerConsequence: { text: string; factIds: string[] } | null;
  /** arc: one tension; steps: an ordered procedure; list: parallel items. itemFactIds name each step's or item's first fact, in order. */
  structure: { kind: Draft2FocusStructureKind; itemFactIds: string[] };
  goal: CreativeConversionGoal;
  voice: Draft2FocusVoice;
  /** What to lead with, what to leave out, what the reader takes away (v1's editorial focus). */
  direction: string;
};

export type Draft2FocusRole = { provider: Draft2Provider; model: string };

export type Draft2Focus = {
  /** running: Claude is deciding; failed: the last decision failed and the values before it stand. */
  status: "running" | "ready" | "failed";
  /** One more on every decision, edit and reset; an opening records the version it followed. */
  version: number;
  /** The focus as it stands: Claude's values with the editor's changes. */
  values?: Draft2FocusValues;
  /** Claude's own values, kept under the editor's changes so a field can go back to them. */
  ai?: Draft2FocusValues;
  /** One sentence per field Claude decided. */
  reasons?: Partial<Record<Draft2FocusField, string>>;
  /** The fields the editor set; Claude keeps them when it decides again. */
  edited: Draft2FocusField[];
  /** The Topic's editorial lines when the focus was decided: the choices for the line. */
  lineOptions: Draft2FocusLine[];
  decidedBy?: Draft2FocusRole;
  decidedAt?: string;
  updatedAt?: string;
  error?: string;
};

/** The focus an opening run followed, kept on the run. */
export type Draft2FocusSnapshot = { version: number; values: Draft2FocusValues };

export type Draft2FocusFindingCode = "NO_READER_CONSEQUENCE" | "TOO_FEW_ITEMS";
/** What the program finds wrong with a focus; any one keeps the Opening from starting. */
export type Draft2FocusFinding = { field: Draft2FocusField; code: Draft2FocusFindingCode; detail: string };

/** A line as the Topic stores it (editorial-lines.ts), reduced to what the focus reads. */
export type Draft2FocusLineSource = { id: string; revision: number; name: string; objective: string; themes: readonly string[]; archived?: boolean };

const factIdsSchema = { type: "array", items: { type: "string" } };
const dial = { type: "integer", minimum: 1, maximum: 100 };

/** Claude's answer: every field of the focus and a reason for each. */
export const DRAFT2_FOCUS_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    lineId: { type: ["string", "null"] },
    audience: { type: "string" },
    framing: { type: "string", enum: [...FOCUS_FRAMINGS] },
    readerConsequence: {
      type: "object",
      properties: { text: { type: ["string", "null"] }, factIds: factIdsSchema },
      required: ["text", "factIds"],
      additionalProperties: false,
    },
    structure: {
      type: "object",
      properties: { kind: { type: "string", enum: [...FOCUS_STRUCTURES] }, itemFactIds: factIdsSchema },
      required: ["kind", "itemFactIds"],
      additionalProperties: false,
    },
    goal: { type: "string", enum: [...FOCUS_GOALS] },
    voice: {
      type: "object",
      properties: { gravity: { type: "string", enum: [...FOCUS_GRAVITIES] }, ...Object.fromEntries(TONE_KEYS.map((key) => [key, dial])) },
      required: ["gravity", ...TONE_KEYS],
      additionalProperties: false,
    },
    direction: { type: "string" },
    reasons: {
      type: "object",
      properties: Object.fromEntries(FOCUS_FIELDS.map((field) => [field, { type: "string" }])),
      required: [...FOCUS_FIELDS],
      additionalProperties: false,
    },
  },
  required: ["lineId", "audience", "framing", "readerConsequence", "structure", "goal", "voice", "direction", "reasons"],
  additionalProperties: false,
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : undefined;
const oneOf = <T extends string>(values: readonly T[], value: unknown): T | undefined => values.find((candidate) => candidate === value);

/** The ids of verified facts in a list, once each and in order; anything else is dropped. */
function knownFactIds(value: unknown, facts: ReadonlySet<string>, max: number): string[] {
  const ids: string[] = [];
  for (const entry of Array.isArray(value) ? value : []) {
    if (typeof entry === "string" && facts.has(entry.trim()) && !ids.includes(entry.trim())) ids.push(entry.trim());
  }
  return ids.slice(0, max);
}

/** A line of the Topic as the focus keeps it. */
export function focusLine(line: Draft2FocusLineSource): Draft2FocusLine {
  const objective = line.objective.replace(/\s+/g, " ").trim();
  return { id: line.id, revision: line.revision, name: line.name, objective: objective.length > LINE_OBJECTIVE_MAX_CHARACTERS ? `${objective.slice(0, LINE_OBJECTIVE_MAX_CHARACTERS - 1).trimEnd()}…` : objective };
}

/** The editor's fields as Claude receives them: the answer's own shape, so it can keep them exactly. */
export function editorChoicesOf(focus: Pick<Draft2Focus, "values" | "edited" | "lineOptions">): Record<string, unknown> {
  const values = focus.values;
  if (!values) return {};
  const choices: Record<string, unknown> = {};
  for (const field of focus.edited) {
    if (field === "line") {
      // A line archived since the editor chose it is no longer a choice.
      if (values.line && focus.lineOptions.some((line) => line.id === values.line?.id)) choices.lineId = values.line.id;
    } else choices[field] = values[field];
  }
  return choices;
}

/**
 * Claude's answer as the focus's values and reasons. A malformed answer, a
 * value outside the contract or a line the Topic does not have is a response
 * error, never persisted; fact ids that are not verified facts are dropped,
 * and a reader consequence left with none is no consequence. The editor's
 * fields replace whatever the answer says for them; for a structure the
 * editor chose, the items come from Claude when it answered the same kind,
 * which is how a list the editor asked for gets its items.
 */
export function parseFocusDecision(answer: string, { facts, lines, editorChoices = {} }: { facts: readonly Draft2Fact[]; lines: readonly Draft2FocusLine[]; editorChoices?: Record<string, unknown> }): { values: Draft2FocusValues; reasons: Partial<Record<Draft2FocusField, string>> } {
  let parsed: unknown;
  try { parsed = JSON.parse(answer); } catch { throw new Draft2ResponseError("The focus answer is not valid JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Draft2ResponseError("The focus answer is not an object");
  const { structure: chosenStructure, readerConsequence: chosenConsequence, ...overrides } = editorChoices;
  const body = { ...(parsed as Record<string, unknown>), ...overrides };
  const known = new Set(facts.map((fact) => fact.id));

  const lineId = typeof body.lineId === "string" ? body.lineId.trim() : null;
  const line = lineId ? lines.find((candidate) => candidate.id === lineId) : undefined;
  if (lines.length && !line) throw new Draft2ResponseError(`The focus names an editorial line the Topic does not have (${String(body.lineId)})`);

  const audience = text(body.audience, FOCUS_AUDIENCE_MAX_CHARACTERS);
  const framing = oneOf(FOCUS_FRAMINGS, body.framing);
  const goal = oneOf(FOCUS_GOALS, body.goal);
  const direction = text(body.direction, FOCUS_DIRECTION_MAX_CHARACTERS);
  const structure = record(body.structure);
  const kind = oneOf(FOCUS_STRUCTURES, structure.kind);
  const voice = record(body.voice);
  const gravity = oneOf(FOCUS_GRAVITIES, voice.gravity);
  if (!audience) throw new Draft2ResponseError(`The focus's audience is missing or longer than ${FOCUS_AUDIENCE_MAX_CHARACTERS} characters`);
  if (!direction) throw new Draft2ResponseError(`The focus's direction is missing or longer than ${FOCUS_DIRECTION_MAX_CHARACTERS} characters`);
  if (!framing || !goal || !kind || !gravity) throw new Draft2ResponseError("The focus's framing, goal, structure or gravity is outside the contract");
  if (TONE_KEYS.some((key) => typeof voice[key] !== "number" || !Number.isFinite(voice[key]))) throw new Draft2ResponseError("The focus's voice needs a number for every tone dial");

  const consequence = record(body.readerConsequence);
  const consequenceText = typeof consequence.text === "string" ? consequence.text.trim() : "";
  if (consequenceText.length > FOCUS_CONSEQUENCE_MAX_CHARACTERS) throw new Draft2ResponseError(`The focus's reader consequence is longer than ${FOCUS_CONSEQUENCE_MAX_CHARACTERS} characters`);
  const consequenceFacts = knownFactIds(consequence.factIds, known, MAX_CONSEQUENCE_FACTS);
  const readerConsequence = "readerConsequence" in editorChoices
    ? chosenConsequence as Draft2FocusValues["readerConsequence"]
    : consequenceText && consequenceFacts.length ? { text: consequenceText, factIds: consequenceFacts } : null;
  const answered = { kind, itemFactIds: kind === "arc" ? [] : knownFactIds(structure.itemFactIds, known, FOCUS_MAX_ITEMS) };
  const editorStructure = chosenStructure as Draft2FocusValues["structure"] | undefined;

  const values: Draft2FocusValues = {
    line: line ?? null,
    audience,
    framing,
    readerConsequence,
    structure: editorStructure
      ? { kind: editorStructure.kind, itemFactIds: answered.kind === editorStructure.kind && answered.itemFactIds.length ? answered.itemFactIds : editorStructure.itemFactIds }
      : answered,
    goal,
    voice: { gravity, ...Object.fromEntries(TONE_KEYS.map((key) => [key, toneValue(voice[key])])) } as Draft2FocusVoice,
    direction,
  };
  const given = record((parsed as Record<string, unknown>).reasons);
  const chosen = new Set(Object.keys(editorChoices).map((key) => key === "lineId" ? "line" : key));
  const reasons: Partial<Record<Draft2FocusField, string>> = {};
  for (const field of FOCUS_FIELDS) {
    const reason = text(given[field], REASON_MAX_CHARACTERS);
    if (reason && !chosen.has(field)) reasons[field] = reason;
  }
  return { values, reasons };
}

/**
 * The focus after a decision: Claude's values with the editor's fields kept,
 * Claude's own values under them, one version more. For an edited field,
 * Claude's earlier value stays the one the field can go back to.
 */
export function decidedFocus(focus: Draft2Focus, decision: { values: Draft2FocusValues; reasons: Partial<Record<Draft2FocusField, string>> }, decidedBy: Draft2FocusRole, now: Date): Draft2Focus {
  const edited = focus.edited.filter((field) => field !== "line" || decision.values.line?.id === focus.values?.line?.id);
  const ai = Object.fromEntries(FOCUS_FIELDS.map((field) => [field, edited.includes(field) && focus.ai ? focus.ai[field] : decision.values[field]])) as Draft2FocusValues;
  return {
    ...focus,
    status: "ready",
    version: focus.version + 1,
    values: decision.values,
    ai,
    reasons: decision.reasons,
    edited,
    decidedBy,
    decidedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    error: undefined,
  };
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The editor's value for a field, checked against the contract; a value that does not fit is an input error. */
function editedValue(focus: Draft2Focus, field: Draft2FocusField, value: unknown): Draft2FocusValues[Draft2FocusField] {
  const values = focus.values!;
  const plain = (max: number, label: string, { empty = false } = {}) => {
    if (typeof value !== "string" || value.trim().length > max || (!empty && !value.trim())) throw new Draft2InputError(`The ${label} needs ${empty ? "at most" : "1 to"} ${max.toLocaleString("en-CA")} characters.`);
    return value.trim();
  };
  switch (field) {
    case "line": {
      if (value === null && !focus.lineOptions.length) return null;
      const line = focus.lineOptions.find((candidate) => candidate.id === value);
      if (!line) throw new Draft2InputError("Choose one of the Topic's editorial lines.");
      return line;
    }
    case "audience": return plain(FOCUS_AUDIENCE_MAX_CHARACTERS, "audience");
    case "direction": return plain(FOCUS_DIRECTION_MAX_CHARACTERS, "direction");
    case "readerConsequence": {
      const words = plain(FOCUS_CONSEQUENCE_MAX_CHARACTERS, "reader consequence", { empty: true });
      if (!words) return null;
      // Unchanged words keep the facts they cite; the editor's own words cite none.
      return words === values.readerConsequence?.text ? values.readerConsequence : { text: words, factIds: [] };
    }
    case "framing": {
      const framing = oneOf(FOCUS_FRAMINGS, value);
      if (!framing) throw new Draft2InputError(`The framing is one of ${FOCUS_FRAMINGS.join(", ")}.`);
      return framing;
    }
    case "goal": {
      const goal = oneOf(FOCUS_GOALS, value);
      if (!goal) throw new Draft2InputError(`The goal is one of ${FOCUS_GOALS.join(", ")}.`);
      return goal;
    }
    case "structure": {
      const kind = oneOf(FOCUS_STRUCTURES, value);
      if (!kind) throw new Draft2InputError(`The structure is one of ${FOCUS_STRUCTURES.join(", ")}.`);
      if (kind === "arc") return { kind, itemFactIds: [] };
      // The items Claude found for this kind, when it found any; otherwise Claude picks them when it decides again.
      const found = [values.structure, focus.ai?.structure].find((structure) => structure?.kind === kind);
      return { kind, itemFactIds: found?.itemFactIds ?? [] };
    }
    case "voice": {
      const voice = record(value);
      const gravity = oneOf(FOCUS_GRAVITIES, voice.gravity);
      if (!gravity) throw new Draft2InputError(`The gravity is one of ${FOCUS_GRAVITIES.join(", ")}.`);
      if (TONE_KEYS.some((key) => !Number.isInteger(voice[key]) || Number(voice[key]) < 1 || Number(voice[key]) > 100)) throw new Draft2InputError("Each tone dial is a whole number from 1 to 100.");
      return { gravity, ...Object.fromEntries(TONE_KEYS.map((key) => [key, Number(voice[key])])) } as Draft2FocusVoice;
    }
  }
}

/**
 * The focus after the editor set one field. A value equal to Claude's gives
 * the field back to Claude; any other becomes the editor's, which Claude
 * keeps when it decides again. An unchanged value changes nothing.
 */
export function applyFocusEdit(focus: Draft2Focus, field: Draft2FocusField, value: unknown, now: Date): Draft2Focus {
  if (!focus.values) throw new Draft2InputError("Decide the focus before changing it.");
  const next = editedValue(focus, field, value);
  if (sameValue(next, focus.values[field])) return focus;
  const backToClaude = focus.ai && sameValue(next, focus.ai[field]);
  return {
    ...focus,
    version: focus.version + 1,
    values: { ...focus.values, [field]: next },
    edited: backToClaude ? focus.edited.filter((entry) => entry !== field) : [...new Set([...focus.edited, field])],
    updatedAt: now.toISOString(),
  };
}

/** The focus with one of the editor's fields given back to Claude's value. */
export function resetFocusField(focus: Draft2Focus, field: Draft2FocusField, now: Date): Draft2Focus {
  if (!focus.values || !focus.ai) throw new Draft2InputError("Decide the focus before changing it.");
  if (!focus.edited.includes(field)) return focus;
  return {
    ...focus,
    version: focus.version + 1,
    values: { ...focus.values, [field]: focus.ai[field] },
    edited: focus.edited.filter((entry) => entry !== field),
    updatedAt: now.toISOString(),
  };
}

/** The program's findings on a focus. Any one keeps the Opening from starting until the editor fixes it or Claude decides again. */
export function focusFindings(values: Draft2FocusValues): Draft2FocusFinding[] {
  const findings: Draft2FocusFinding[] = [];
  if (values.framing === "reader-consequence" && !values.readerConsequence?.text) {
    findings.push({ field: "readerConsequence", code: "NO_READER_CONSEQUENCE", detail: "The framing leads with the reader consequence, and the focus has none: write it, choose another framing, or decide again." });
  }
  const { kind, itemFactIds } = values.structure;
  const minimum = kind === "list" ? FOCUS_LIST_MIN_ITEMS : kind === "steps" ? FOCUS_STEPS_MIN_ITEMS : 0;
  if (itemFactIds.length < minimum) {
    findings.push({ field: "structure", code: "TOO_FEW_ITEMS", detail: `A ${kind === "list" ? "list" : "procedure"} needs at least ${minimum} ${kind === "list" ? "items" : "steps"} from the facts, and the focus names ${itemFactIds.length}: decide again for Claude to find them, or choose another structure.` });
  }
  return findings;
}

/** How many items or steps a focus promises; undefined for an arc. The Opening counts it as a stated number. */
export const focusItemCount = (values: Draft2FocusValues): number | undefined => values.structure.kind === "arc" ? undefined : values.structure.itemFactIds.length;

/** The focus as the Opening's models read it: what each value means, dials with their words. */
export function focusForModels(values: Draft2FocusValues) {
  const { line, readerConsequence, structure, voice } = values;
  return {
    ...(line ? { line: { name: line.name, objective: line.objective } } : {}),
    audience: values.audience,
    framing: values.framing,
    readerConsequence: readerConsequence
      ? { text: readerConsequence.text, ...(readerConsequence.factIds.length ? { factIds: readerConsequence.factIds } : { note: "the editor's words: guidance, not a fact" }) }
      : null,
    structure: structure.kind === "arc" ? { kind: "arc" } : { kind: structure.kind, items: structure.itemFactIds.length, itemFactIds: structure.itemFactIds },
    goal: values.goal,
    voice: { gravity: voice.gravity, tone: toneLine(voice) },
    direction: values.direction,
  };
}

/** The profile's structure setting in the focus's terms; "auto" leaves the choice to Claude. */
const PROFILE_STRUCTURE: Record<NonNullable<CreativeProfile["storyStructure"]>, Draft2FocusStructureKind | "auto"> = { auto: "auto", "hook-steps": "steps", "hook-list": "list" };

/**
 * What Claude receives to decide the focus, beside the instructions (the
 * skill and the brand brief, which carry the audience and the tone defaults)
 * and the verified facts.
 */
export function focusDecisionRequest({ title, today, profile, lines, foundBy, editorChoices = {} }: {
  title: string;
  today: string;
  profile: Pick<CreativeProfile, "framingStrategy" | "storyStructure" | "conversionGoal">;
  lines: readonly Draft2FocusLineSource[];
  /** The lines whose collection runs found the story, newest first. */
  foundBy: readonly string[];
  editorChoices?: Record<string, unknown>;
}) {
  return {
    task: "focus",
    story: { title },
    today,
    topicDefaults: { framing: profile.framingStrategy, structure: PROFILE_STRUCTURE[profile.storyStructure ?? "auto"], goal: profile.conversionGoal },
    lines: lines.map((line) => ({ id: line.id, name: line.name, objective: focusLine(line).objective, ...(line.themes.length ? { themes: line.themes } : {}) })),
    ...(foundBy.length ? { foundBy } : {}),
    ...(Object.keys(editorChoices).length ? { editorChoices } : {}),
  };
}

/** Today's date where the publication works (the timezone of a line that found the story), so dates in the facts read as past or upcoming. */
export function focusToday(timezone: string | undefined, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
