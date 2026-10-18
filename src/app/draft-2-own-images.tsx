"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ActionRow, Button, FormField } from "@/app/ui/primitives";
import { OWN_FITS, OWN_SCENE_MIN_SECTION, readsAs, type Draft2OwnFit } from "@/app/modules/draft2/draft2-images.types";
import { publishablePhoto, type StoryPhotoRights } from "@/app/modules/stories/story-materials.types";
import { storyPhotoUrl, useStoryPhotos } from "./story-photos-panel";
import styles from "./draft-2-canvas.generated.module.css";

/** A private image read with the editor's secret, shown small: a photo bank's or a story's photo. */
export function PrivateThumb({ url, secret, alt }: { url: string; secret: string; alt: string }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    fetch(url, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The photo is unavailable.");
        const blob = await response.blob();
        if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setSrc(objectUrl); }
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, secret]);
  return src ? <Image className={styles.candidateThumb} src={src} alt={alt} width={160} height={120} unoptimized /> : <p className={styles.factMeta}>{failed ? "Could not load the photo." : "Loading…"}</p>;
}

const FIT_LABEL: Record<Draft2OwnFit, string> = { cover: "Fill the slide (cropped around its focal point)", contain: "The whole photo, on the brand's colour" };
const RIGHTS_SHORT: Record<StoryPhotoRights, string> = { own: "your own", licensed: "licensed", reference: "reference only" };

type Scope = { topicId: string; storyId: string; secret: string };

/**
 * The editor's own image for a slide (2026-10-18, the editor: "upload one of
 * my own… a gallery of photos I took, and the program did not take them
 * all"): one of the story's photos, or one uploaded here into them, fitted to
 * the slide with its words, the page number and the logo set by the program.
 * A new version, free; only a photo declared own or licensed goes on a slide.
 */
export function OwnImageChooser({ label, scope, saving, locked, onUse }: {
  /** The slide's label, the name of a photo uploaded without one. */
  label: string;
  scope: Scope;
  saving: boolean;
  locked: boolean;
  onUse: (input: { storyPhotoId: string; fit: Draft2OwnFit }) => void;
}) {
  const { photos, error, refresh } = useStoryPhotos(scope);
  const [fit, setFit] = useState<Draft2OwnFit>("cover");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string>();
  const active = photos.filter((photo) => photo.active);
  const disabled = locked || saving || uploading;
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("image");
    if (!(file instanceof File) || !file.size) return;
    data.set("name", file.name.replace(/\.[^.]+$/u, "").slice(0, 150) || label);
    setUploading(true); setMessage(undefined);
    try {
      const response = await fetch(storyPhotoUrl(scope), { method: "POST", headers: { Authorization: `Bearer ${scope.secret.trim()}` }, body: data });
      const result = await response.json().catch(() => ({})) as { id?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error ?? "The photo could not be uploaded.");
      form.reset();
      refresh();
      onUse({ storyPhotoId: result.id, fit });
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "The photo could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }
  return <div className={styles.focusBody}>
    <FormField label="How it fills the slide">
      <select value={fit} disabled={disabled} onChange={(event) => setFit(event.target.value as Draft2OwnFit)}>
        {OWN_FITS.map((entry) => <option key={entry} value={entry}>{FIT_LABEL[entry]}</option>)}
      </select>
    </FormField>
    {active.length ? <ul className={styles.ownPhotoGrid} aria-label="The story's photos">
      {active.map((photo) => <li key={photo.id} className={styles.ownPhoto}>
        <PrivateThumb url={storyPhotoUrl(scope, photo.id)} secret={scope.secret} alt={photo.description || photo.name} />
        <span className={styles.factMeta}>{photo.name} · {RIGHTS_SHORT[photo.publicationRights]}</span>
        <Button size="compact" variant="secondary" busy={saving} disabled={disabled || !publishablePhoto(photo.publicationRights)} onClick={() => onUse({ storyPhotoId: photo.id, fit })}>Use on this slide</Button>
      </li>)}
    </ul> : <p className={styles.factMeta}>{error ?? "The story has no photos yet: upload one below."}</p>}
    {active.some((photo) => !publishablePhoto(photo.publicationRights)) ? <p className={styles.factMeta}>A photo for reference only is never published: declare it your own or licensed in People &amp; places to use it on a slide.</p> : null}
    <form className={styles.focusBody} onSubmit={(event) => { void upload(event); }}>
      <FormField label="Upload a photo" description="JPG, PNG or WebP, up to 15 MB. It joins the story's photos and the photo bank, and goes on this slide.">
        <input name="image" type="file" accept="image/jpeg,image/png,image/webp" required disabled={disabled} />
      </FormField>
      <FormField label="What it shows">
        <input name="description" maxLength={1000} required disabled={disabled} />
      </FormField>
      <FormField label="Who took it, and its license" description="For a licensed photo this is the credit the caption carries.">
        <input name="provenance" maxLength={1000} required disabled={disabled} placeholder="My own photo" />
      </FormField>
      <FormField label="Publication">
        <select name="publicationRights" defaultValue="own" required disabled={disabled}>
          <option value="own">My own photo: it may be published</option>
          <option value="licensed">Licensed: it may be published, with its credit</option>
        </select>
      </FormField>
      <label className={styles.factMeta}><input name="providerTransmissionAllowed" type="checkbox" value="true" required disabled={disabled} /> I have permission to use this photo and to send it to the image-generation provider (to edit it later).</label>
      <ActionRow><Button type="submit" size="compact" variant="secondary" busy={uploading} disabled={disabled}>Upload and use it</Button></ActionRow>
    </form>
    {message ? <p role="alert" className={styles.factMeta}>{message}</p> : null}
  </div>;
}

/**
 * A panorama's scene the editor uploads instead of the drawn one: kept as
 * sent, and every slide is cut from it at once, free. Wide enough for the
 * slides' portrait sections side by side.
 */
export function OwnSceneForm({ slides, saving, locked, onUpload }: { slides: number; saving: boolean; locked: boolean; onUpload: (form: FormData) => void }) {
  const [rights, setRights] = useState<"own" | "licensed">("own");
  const minWidth = Math.ceil((4 * slides * OWN_SCENE_MIN_SECTION) / 5);
  return <form className={styles.focusBody} onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get("image");
    if (!(file instanceof File) || !file.size) return;
    onUpload(data);
  }}>
    <FormField label="Your scene" description={`JPG, PNG or WebP, up to 25 MB, at least ${minWidth} × ${OWN_SCENE_MIN_SECTION} pixels so each of the ${slides} slides is a portrait section of it. The slides are cut from it with their words where they were; the drawn scene stays among the earlier versions.`}>
      <input name="image" type="file" accept="image/jpeg,image/png,image/webp" required disabled={locked || saving} />
    </FormField>
    <FormField label="Publication">
      <select name="rights" value={rights} disabled={locked || saving} onChange={(event) => setRights(event.target.value === "licensed" ? "licensed" : "own")}>
        <option value="own">My own image: it may be published</option>
        <option value="licensed">Licensed: it may be published, with its credit</option>
      </select>
    </FormField>
    {rights === "licensed" ? <FormField label="Credit" description="Who made it and its license, for the caption.">
      <input name="credit" maxLength={300} required disabled={locked || saving} />
    </FormField> : null}
    <ActionRow><Button type="submit" size="compact" variant="secondary" busy={saving} disabled={locked || saving}>Use this scene</Button></ActionRow>
  </form>;
}

/**
 * How a role's words read on the slide (2026-10-18, the editor: "the text,
 * for example, in bold"): the same words, broken where the editor wants and
 * with **marked** words in the marked style. The words themselves stay the
 * slide's; a change to them is the Deck's.
 */
export function ReadsAsField({ label, words, value, disabled, onChange }: { label: string; words: string; value: string | undefined; disabled: boolean; onChange: (value: string | undefined) => void }) {
  const area = useRef<HTMLTextAreaElement>(null);
  const shown = readsAs(words, value);
  const plain = (text: string) => text.replace(/\*\*/gu, "").replace(/\s+/gu, " ").trim();
  const [draft, setDraft] = useState(shown);
  // The layout's value changed from outside (undo, another slide's style): the field follows it.
  const [seen, setSeen] = useState(value);
  if (value !== seen) { setSeen(value); setDraft(shown); }
  const kept = plain(draft) === plain(words);
  const change = (next: string) => {
    setDraft(next);
    if (plain(next) === plain(words)) onChange(next.trim() === words.trim() ? undefined : next);
  };
  const mark = () => {
    const element = area.current;
    if (!element || element.selectionStart === element.selectionEnd) return;
    const { selectionStart: start, selectionEnd: end } = element;
    change(`${draft.slice(0, start)}**${draft.slice(start, end)}**${draft.slice(end)}`);
  };
  return <div className={styles.focusBody}>
    <FormField label={`How the ${label} reads`} description="Enter breaks the line; select words and mark them to set them in the marked style. Only breaks and marks change here." error={kept ? undefined : "These are no longer the slide's words: only line breaks and ** marks may change. Change the words in the Deck."}>
      <textarea ref={area} rows={3} value={draft} disabled={disabled} onChange={(event) => change(event.target.value)} />
    </FormField>
    <ActionRow>
      <Button size="compact" variant="quiet" disabled={disabled} onClick={mark}>Mark the selection</Button>
      <Button size="compact" variant="quiet" disabled={disabled || draft === words} onClick={() => { setDraft(words); onChange(undefined); }}>As written</Button>
    </ActionRow>
  </div>;
}
