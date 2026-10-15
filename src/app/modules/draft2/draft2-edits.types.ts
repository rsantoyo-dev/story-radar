import { Draft2InputError } from "./draft2-facts.types";
import type { FunnelEditorEdit } from "./draft2-funnel";

/**
 * The editor's hand on a finished step (2026-10-15: "every step after it is
 * finished, I should be able to edit manually… a hook I want to introduce,
 * or a hook idea"). A text of the chosen version changed in place, where the
 * run keeps it and in the copies the later steps keep, as the review's
 * patches are; the program's findings shown, never blocking. In the Opening,
 * the editor's own opening used as it is, or set beside the judge's
 * proposals for the writer to develop in one more round. Everything here is
 * pure: the contract and the texts' paths.
 */
export const DRAFT2_EDIT_STEPS = ["opening", "closing", "deck", "caption", "visual"] as const;
export type Draft2EditStep = (typeof DRAFT2_EDIT_STEPS)[number];
/** A slide's word field, a caption's text or hashtags, a script slide's direction. */
export const DRAFT2_EDIT_FIELDS = ["headline", "subheadline", "body", "practical", "cta", "text", "hashtags", "direction"] as const;
export type Draft2EditField = (typeof DRAFT2_EDIT_FIELDS)[number];
/** Instagram's limit for a whole post bounds a caption; a slide's text or a direction is far shorter. */
export const EDIT_CAPTION_MAX_CHARACTERS = 2_200;
export const EDIT_TEXT_MAX_CHARACTERS = 700;
export const OWN_OPENING_MAX_CHARACTERS = 300;

export type Draft2OwnOpening = { cover: { headline: string; subheadline: string }; slide2: { headline: string; body: string } };
export type Draft2EditInput =
  | { action: "edit"; step: Draft2EditStep; slide: string; field: Draft2EditField; text: string }
  | { action: "undo"; step: Draft2EditStep; editId: string }
  | { action: "own-opening"; mode: "use" | "develop"; opening: Draft2OwnOpening };

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const oneOf = <T extends string>(values: readonly T[], value: unknown): T | undefined => values.find((entry) => entry === value);
const words = (value: unknown, max: number, label: string): string => {
  if (typeof value !== "string") return "";
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (text.length > max) throw new Draft2InputError(`Keep ${label} under ${max.toLocaleString("en")} characters.`);
  return text;
};

/** What the canvas sends, checked: the step, the slide and the field it names, and the text. */
export function parseDraft2EditInput(value: unknown): Draft2EditInput {
  const body = record(value);
  if (body.action === "own-opening") {
    const mode = oneOf(["use", "develop"] as const, body.mode);
    if (!mode) throw new Draft2InputError("Say whether to use your opening as it is or to develop it.");
    const cover = record(body.cover);
    const slide2 = record(body.slide2);
    const opening: Draft2OwnOpening = {
      cover: { headline: words(cover.headline, OWN_OPENING_MAX_CHARACTERS, "the cover's headline"), subheadline: words(cover.subheadline, OWN_OPENING_MAX_CHARACTERS, "the subheadline") },
      slide2: { headline: words(slide2.headline, OWN_OPENING_MAX_CHARACTERS, "slide 2's headline"), body: words(slide2.body, OWN_OPENING_MAX_CHARACTERS, "slide 2's text") },
    };
    if (!opening.cover.headline) throw new Draft2InputError("Write at least the cover's headline.");
    if (mode === "use" && (!opening.cover.subheadline || !opening.slide2.headline || !opening.slide2.body)) {
      throw new Draft2InputError("To use your opening as it is, write the cover's subheadline and slide 2 too; to give only a hook or an idea, develop it.");
    }
    return { action: "own-opening", mode, opening };
  }
  const step = oneOf(DRAFT2_EDIT_STEPS, body.step);
  if (!step) throw new Draft2InputError(`step must be one of ${DRAFT2_EDIT_STEPS.join(", ")}.`);
  if (body.action === "undo") {
    if (typeof body.editId !== "string" || !/^[\w.-]{1,40}$/.test(body.editId)) throw new Draft2InputError("Name the change to undo.");
    return { action: "undo", step, editId: body.editId };
  }
  if (body.action !== "edit") throw new Draft2InputError("action must be edit, undo or own-opening.");
  const slide = typeof body.slide === "string" && /^[a-z0-9]{1,24}$/i.test(body.slide) ? body.slide : undefined;
  if (!slide) throw new Draft2InputError("Name the slide, such as cover or s2.");
  const field = oneOf(DRAFT2_EDIT_FIELDS, body.field);
  if (!field) throw new Draft2InputError(`field must be one of ${DRAFT2_EDIT_FIELDS.join(", ")}.`);
  const text = words(body.text, step === "caption" && field === "text" ? EDIT_CAPTION_MAX_CHARACTERS : EDIT_TEXT_MAX_CHARACTERS, "this text");
  if (!text && field !== "practical" && field !== "hashtags") throw new Draft2InputError("A text cannot be left empty; write what it should say.");
  return { action: "edit", step, slide, field, text };
}

/** Hashtags as the editor types them ("#Brossard, #DIX30" or "Brossard DIX30"): each word once, without its "#". */
export function parseHashtags(value: string): string[] {
  const tags: string[] = [];
  for (const entry of value.split(/[\s,]+/u)) {
    const tag = entry.replace(/^#+/u, "").trim();
    if (tag && !tags.some((known) => known.toLowerCase() === tag.toLowerCase())) tags.push(tag);
  }
  return tags;
}

/** The edit an undo names, when it can still be undone: the latest change to its text, not undone yet. */
export function undoableEdit(edits: readonly FunnelEditorEdit[] | undefined, editId: string): FunnelEditorEdit {
  const edit = (edits ?? []).find((entry) => entry.id === editId);
  if (!edit) throw new Draft2InputError(`${editId} is not one of this step's changes.`);
  if (edit.undoneAt) throw new Draft2InputError("This change was already undone.");
  const later = (edits ?? []).find((entry) => entry.at > edit.at && !entry.undoneAt && entry.candidateId === edit.candidateId && entry.slide === edit.slide && entry.field === edit.field);
  if (later) throw new Draft2InputError("A later change to the same text stands; undo it first.");
  return edit;
}

/** The next id of an editor's change in a run: e1, e2… */
export const nextEditId = (edits: readonly FunnelEditorEdit[] | undefined): string => `edit${(edits?.length ?? 0) + 1}`;
