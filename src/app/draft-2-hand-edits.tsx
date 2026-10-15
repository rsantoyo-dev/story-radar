"use client";
import { useState } from "react";
import { ActionRow, Button, FormField, InlineNotice } from "@/app/ui/primitives";
import type { Draft2OwnOpening } from "@/app/modules/draft2/draft2-edits.types";
import type { FunnelEditorEdit } from "@/app/modules/draft2/draft2-funnel";
import styles from "./draft-2-canvas.generated.module.css";

/** One text of a step's chosen version the editor may change by hand. */
export type HandEditField = { slide: string; field: string; label: string; value: string; multiline?: boolean };
export type HandEditChange = { slide: string; field: string; text: string };

const fieldKey = (field: { slide: string; field: string }) => `${field.slide}.${field.field}`;

/**
 * The chosen version's texts, editable by hand once the step is finished.
 * Saving changes them in place, in this step and in the copies the later
 * steps keep; each change comes back with what the program finds on it
 * (shown, never blocking) and can be undone.
 */
export function HandEdits({ fields, edits, locked, busy, onSave, onUndo }: {
  fields: readonly HandEditField[];
  edits: readonly FunnelEditorEdit[] | undefined;
  locked: boolean;
  busy: boolean;
  /** Resolves true once every change is saved. */
  onSave: (changes: HandEditChange[]) => Promise<boolean>;
  onUndo: (editId: string) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const value = (field: HandEditField) => draft[fieldKey(field)] ?? field.value;
  const changes = fields
    .filter((field) => draft[fieldKey(field)] !== undefined && draft[fieldKey(field)].trim() !== field.value.trim())
    .map((field) => ({ slide: field.slide, field: field.field, text: draft[fieldKey(field)] }));
  const labelOf = (edit: FunnelEditorEdit) => fields.find((field) => fieldKey(field) === fieldKey(edit))?.label ?? `${edit.slide} · ${edit.field}`;
  const recent = [...(edits ?? [])].reverse().slice(0, 8);
  const set = (field: HandEditField, text: string) => setDraft({ ...draft, [fieldKey(field)]: text });
  return <details className={styles.focusField}>
    <summary>Edit by hand</summary>
    <p className={styles.factMeta}>Change any text of the chosen version. It changes in place, here and in the steps after it that keep it; the program says what it finds on each change, and you can undo it.</p>
    {fields.map((field) => <FormField key={fieldKey(field)} label={field.label}>
      {field.multiline
        ? <textarea rows={field.field === "text" ? 8 : 3} value={value(field)} disabled={locked || busy} onChange={(event) => set(field, event.target.value)} />
        : <input value={value(field)} disabled={locked || busy} onChange={(event) => set(field, event.target.value)} />}
    </FormField>)}
    <ActionRow>
      <Button size="compact" variant="secondary" busy={busy} disabled={locked || busy || !changes.length} onClick={() => { void onSave(changes).then((saved) => { if (saved) setDraft({}); }); }}>
        {changes.length > 1 ? `Save my ${changes.length} changes` : "Save my change"}
      </Button>
    </ActionRow>
    {recent.length ? <ul className={styles.issueList}>{recent.map((edit) => <li key={edit.id}>
      <strong>{labelOf(edit)}</strong>{edit.undoneAt ? " · undone" : ""}: “{edit.after || "(empty)"}”, was “{edit.before || "(empty)"}”
      {edit.findings.length && !edit.undoneAt ? <InlineNotice tone="warning" title="The program found">{edit.findings.join(" ")}</InlineNotice> : null}
      {edit.undoneAt ? null : <div><Button size="compact" variant="quiet" disabled={locked || busy} onClick={() => onUndo(edit.id)}>Undo</Button></div>}
    </li>)}</ul> : null}
  </details>;
}

const EMPTY_OPENING: Draft2OwnOpening = { cover: { headline: "", subheadline: "" }, slide2: { headline: "", body: "" } };

/**
 * The editor's own opening: used as it is (it becomes the chosen opening),
 * or developed by the writer in one more round, which keeps the idea, cites
 * the facts and writes what is missing; the judge scores it beside the
 * others, as the editor wrote it and as the writer edited it.
 */
export function OwnOpening({ writer, locked, busy, onSubmit }: {
  writer: string;
  locked: boolean;
  busy: boolean;
  /** Resolves true once the opening is saved (and, to develop it, its round started). */
  onSubmit: (mode: "use" | "develop", opening: Draft2OwnOpening) => Promise<boolean>;
}) {
  const [opening, setOpening] = useState<Draft2OwnOpening>(EMPTY_OPENING);
  const complete = Boolean(opening.cover.headline.trim() && opening.cover.subheadline.trim() && opening.slide2.headline.trim() && opening.slide2.body.trim());
  const submit = (mode: "use" | "develop") => { void onSubmit(mode, opening).then((saved) => { if (saved) setOpening(EMPTY_OPENING); }); };
  return <details className={styles.focusField}>
    <summary>Your own opening</summary>
    <p className={styles.factMeta}>A hook or a whole opening of yours. Use it as it is: it becomes the chosen opening, and the program says what it finds on it. Or have {writer} develop it in one more round: it keeps your idea, cites the facts and writes what is missing, and the judge scores it beside the others, as you wrote it and as {writer} edited it. To develop an idea, the cover’s headline is enough.</p>
    <FormField label="Cover headline">
      <input value={opening.cover.headline} disabled={locked || busy} onChange={(event) => setOpening({ ...opening, cover: { ...opening.cover, headline: event.target.value } })} />
    </FormField>
    <FormField label="Cover subheadline">
      <input value={opening.cover.subheadline} disabled={locked || busy} onChange={(event) => setOpening({ ...opening, cover: { ...opening.cover, subheadline: event.target.value } })} />
    </FormField>
    <FormField label="Slide 2 headline">
      <input value={opening.slide2.headline} disabled={locked || busy} onChange={(event) => setOpening({ ...opening, slide2: { ...opening.slide2, headline: event.target.value } })} />
    </FormField>
    <FormField label="Slide 2 text">
      <textarea rows={3} value={opening.slide2.body} disabled={locked || busy} onChange={(event) => setOpening({ ...opening, slide2: { ...opening.slide2, body: event.target.value } })} />
    </FormField>
    <ActionRow>
      <Button size="compact" variant="secondary" busy={busy} disabled={locked || busy || !opening.cover.headline.trim()} onClick={() => submit("develop")}>Develop it with {writer}</Button>
      <Button size="compact" variant="quiet" disabled={locked || busy || !complete} onClick={() => submit("use")}>Use it as it is</Button>
    </ActionRow>
  </details>;
}
