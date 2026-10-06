"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { STORY_REFERENCE_PURPOSES, type PhotoFocus, type StoryReferencePhoto, type StoryReferenceSelection } from "./modules/stories/story-materials.types";
import type { CommonsPersonCandidate } from "./modules/stories/commons-person-photos";
import { Button, FormField, InlineNotice, LoadingState } from "./ui/primitives";
import styles from "./radar-dashboard.generated.module.css";

type Scope = { topicId: string; storyId: string; secret: string };
function photoUrl(scope: Scope, id?: string) {
  return `/api/radar/stories/${encodeURIComponent(scope.storyId)}/photos${id ? `/${encodeURIComponent(id)}` : ""}?topicId=${encodeURIComponent(scope.topicId)}`;
}
export function useStoryPhotos({ topicId, storyId, secret }: Scope) {
  const [photos, setPhotos] = useState<StoryReferencePhoto[]>([]);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(photoUrl({ topicId, storyId, secret }), { headers: { Authorization: `Bearer ${secret.trim()}` }, cache: "no-store", signal: controller.signal })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not load story photos"); return result; })
      .then(result => { setPhotos(result); setError(""); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [topicId, storyId, secret, reload]);
  return { photos, error, refresh: () => setReload(value => value + 1) };
}
async function saveFocus(scope: Scope, photo: StoryReferencePhoto, focus: PhotoFocus | null): Promise<void> {
  const response = await fetch(photoUrl(scope, photo.id), { method: "PATCH", headers: { Authorization: `Bearer ${scope.secret.trim()}`, "Content-Type": "application/json" }, body: JSON.stringify({ focus }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "Could not save the focal point");
}
const FOCUS_STEP = 0.05;
/** The preview's shape (3:2), shared with the stylesheet. */
const PREVIEW_ASPECT = 3 / 2;
/**
 * The photo at its own shape, letterboxed in the 3:2 preview. A click marks
 * where the subject is; documentary crops keep that point. Arrow keys move
 * the point and Enter saves it.
 */
function FocalPointPhoto({ url, photo, onSave, disabled }: { url: string; photo: StoryReferencePhoto; onSave: (focus: PhotoFocus) => void; disabled: boolean }) {
  const [natural, setNatural] = useState<{ width: number; height: number }>();
  const [pending, setPending] = useState<PhotoFocus>();
  const point = pending ?? photo.focus;
  const aspect = natural ? natural.width / natural.height : PREVIEW_ASPECT;
  // The photo box, centred in the preview at the photo's own shape.
  const size = aspect < PREVIEW_ASPECT
    ? { width: `${(aspect / PREVIEW_ASPECT) * 100}%`, height: "100%" }
    : { width: "100%", height: `${(PREVIEW_ASPECT / aspect) * 100}%` };
  const clamp = (value: number) => Math.min(1, Math.max(0, Math.round(value * 1000) / 1000));
  return <div className={styles.storyPhotoFocusFrame}>
    <div role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled} className={styles.storyPhotoFocus}
      aria-label={`Focal point of ${photo.name}: click where the people are. Arrow keys move it, Enter saves.`}
      style={size}
      onClick={event => {
        if (disabled || event.detail === 0) return;
        const box = event.currentTarget.getBoundingClientRect();
        const focus = { x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) };
        setPending(focus);
        onSave(focus);
      }}
      onKeyDown={event => {
        if (disabled) return;
        const moves: Record<string, [number, number]> = { ArrowLeft: [-FOCUS_STEP, 0], ArrowRight: [FOCUS_STEP, 0], ArrowUp: [0, -FOCUS_STEP], ArrowDown: [0, FOCUS_STEP] };
        const current = point ?? { x: 0.5, y: 0.5 };
        if (moves[event.key]) {
          event.preventDefault();
          setPending({ x: clamp(current.x + moves[event.key][0]), y: clamp(current.y + moves[event.key][1]) });
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSave(current);
        }
      }}>
      <Image src={url} alt={photo.description} width={natural?.width ?? 240} height={natural?.height ?? 160} unoptimized
        onLoad={event => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />
      {point ? <span className={styles.storyPhotoFocusMarker} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} aria-hidden="true" /> : null}
    </div>
  </div>;
}
function PhotoPreview({ scope, photo, onFocusSaved, disabled = false }: { scope: Scope; photo: StoryReferencePhoto; onFocusSaved?: () => void; disabled?: boolean }) {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [focusError, setFocusError] = useState("");
  const { topicId, storyId, secret } = scope;
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    fetch(photoUrl({ topicId, storyId, secret }, photo.id), { headers: { Authorization: `Bearer ${secret.trim()}` }, signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("Photo unavailable"); return response.blob(); })
      .then(blob => { if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [topicId, storyId, secret, photo.id]);
  if (!url) return <span>{failed ? "Preview unavailable" : "Loading photo…"}</span>;
  if (!onFocusSaved || !photo.active) return <Image className={styles.storyPhotoPreview} src={url} alt={photo.description} width={240} height={160} unoptimized />;
  async function save(focus: PhotoFocus | null) {
    setSaving(true); setFocusError("");
    try { await saveFocus(scope, photo, focus); onFocusSaved?.(); }
    catch (error) { setFocusError(error instanceof Error ? error.message : "Could not save the focal point"); }
    finally { setSaving(false); }
  }
  return <>
    <FocalPointPhoto url={url} photo={photo} disabled={disabled || saving} onSave={focus => void save(focus)} />
    <small>{saving ? "Saving the focal point…" : photo.focus ? "Focal point set: documentary crops keep it. Regenerate the slides that use this photo to apply it." : "Click where the people are: documentary crops keep that point."}</small>
    {photo.focus ? <button type="button" disabled={disabled || saving} onClick={() => void save(null)}>Automatic framing</button> : null}
    {focusError ? <p role="alert">{focusError}</p> : null}
  </>;
}
export function StoryPhotosPanel(scope: Scope) {
  const { photos, error, refresh } = useStoryPhotos(scope);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = new FormData(form).get("image");
    if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024 || file.size === 0) {
      setMessageIsError(true);
      setMessage("Choose a JPG, PNG, or WebP photo under 15 MB.");
      return;
    }
    setBusy(true); setMessage(""); setMessageIsError(false);
    try {
      const response = await fetch(photoUrl(scope), { method: "POST", headers: { Authorization: `Bearer ${scope.secret.trim()}` }, body: new FormData(form) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Upload failed");
      form.reset(); refresh(); setMessage("Photo saved. Select it on the relevant draft slides before generating images.");
    } catch (error) { setMessageIsError(true); setMessage(error instanceof Error ? error.message : "Upload failed"); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true); setMessage(""); setMessageIsError(false);
    try {
      const response = await fetch(photoUrl(scope, id), { method: "DELETE", headers: { Authorization: `Bearer ${scope.secret.trim()}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not remove photo");
      refresh();
    } catch (error) { setMessageIsError(true); setMessage(error instanceof Error ? error.message : "Could not remove photo"); }
    finally { setBusy(false); }
  }
  return <section className={styles.storyMaterials}>
    <h3>Story reference photos</h3>
    <p>Story evidence photos stay with this Story. They are separate from Topic brand references and fictional characters. Choose their use on each draft slide before image generation. For reused photos, record the photographer, file page, license and any changes in the source field.</p>
    {error ? <p role="alert">{error}</p> : null}
    <div className={styles.storyPhotoGrid}>{photos.map(photo => <article className={styles.storyPhotoCard} key={photo.id}>
      <PhotoPreview scope={scope} photo={photo} onFocusSaved={refresh} disabled={busy} />
      <strong>{photo.name}</strong><p>{photo.description}</p><small>{photo.provenance}</small>
      {photo.active ? <button type="button" disabled={busy} onClick={() => revoke(photo.id)}>Remove from future generation</button> : <span>Removed · history preserved</span>}
    </article>)}</div>
    <CommonsPersonSearch scope={scope} disabled={busy} onImported={refresh} />
    <form className={styles.storyMaterialForm} onSubmit={upload}>
      <label>Photo (JPG, PNG, WebP · up to 15 MB)<input name="image" type="file" accept="image/jpeg,image/png,image/webp" required disabled={busy} /></label>
      <label>Name<input name="name" maxLength={150} required disabled={busy} /></label>
      <label>What does this photo show?<textarea name="description" maxLength={1000} required rows={2} disabled={busy} /></label>
      <label>Source, photographer, license and permission to use<textarea name="provenance" maxLength={1000} required rows={2} disabled={busy} placeholder="Photographer · license and license URL · original file URL · resized for this carousel" /></label>
      <label><input name="providerTransmissionAllowed" type="checkbox" value="true" required disabled={busy} /> I have permission to use this photo and send it to the image-generation provider.</label>
      <button type="submit" disabled={busy}>{busy ? "Saving…" : "Add photo"}</button>
    </form>
    {message ? <p role={messageIsError ? "alert" : "status"}>{message}</p> : null}
  </section>;
}
/**
 * Real people from Wikimedia Commons. The editor chooses the right person; the
 * photo is imported unmodified with its credit and can only be used as a
 * documentary portrait (never sent to the image model).
 */
function CommonsPersonSearch({ scope, disabled, onImported }: { scope: Scope; disabled: boolean; onImported: () => void }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"person" | "place">("person");
  const [people, setPeople] = useState<CommonsPersonCandidate[]>();
  const [busy, setBusy] = useState<"search" | string>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const url = `/api/radar/stories/${encodeURIComponent(scope.storyId)}/photos/commons?topicId=${encodeURIComponent(scope.topicId)}`;
  async function call<T>(input: string, init?: RequestInit): Promise<T> {
    const response = await fetch(input, { ...init, cache: "no-store", headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${scope.secret.trim()}` } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "Wikimedia Commons request failed");
    return result as T;
  }
  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim() || busy) return;
    setBusy("search"); setError(""); setNotice(""); setPeople(undefined);
    try { setPeople((await call<{ people: CommonsPersonCandidate[] }>(`${url}&kind=${kind}&q=${encodeURIComponent(query.trim())}`)).people); }
    catch (err) { setError(err instanceof Error ? err.message : "Search failed"); }
    finally { setBusy(undefined); }
  }
  async function importPerson(person: CommonsPersonCandidate) {
    if (busy) return;
    setBusy(person.entityId); setError(""); setNotice("");
    try {
      await call(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entityId: person.entityId, kind }) });
      setNotice(`${person.name} added. On its slide, select this photo — it is kept unmodified, the AI designs the slide around it, and its credit goes in the post caption.`);
      onImported();
    } catch (err) { setError(err instanceof Error ? err.message : "Import failed"); }
    finally { setBusy(undefined); }
  }
  return <div className={styles.storyMaterialForm}>
    <strong>Real person or place from Wikimedia Commons</strong>
    <p>Only openly licensed photos appear. The photo is kept unmodified and is never redrawn by AI; its credit is added to the post caption. Check it shows the right person or place before approving.</p>
    <form onSubmit={search}>
      <fieldset disabled={disabled || Boolean(busy)}>
        <legend>Search for</legend>
        <label><input type="radio" name="commons-kind" checked={kind === "person"} onChange={() => { setKind("person"); setPeople(undefined); }} /> A person (exact full name)</label>
        <label><input type="radio" name="commons-kind" checked={kind === "place"} onChange={() => { setKind("place"); setPeople(undefined); }} /> A place (park, mountain, canal, building…)</label>
      </fieldset>
      <FormField label={kind === "person" ? "Full name" : "Place name"}>
        <input value={query} maxLength={120} placeholder={kind === "person" ? "Jacques Villeneuve" : "Canal de Chambly"} disabled={disabled || Boolean(busy)} onChange={event => setQuery(event.target.value)} />
      </FormField>
      <Button type="submit" variant="secondary" disabled={disabled || Boolean(busy) || query.trim().length < 3} busy={busy === "search"}>{busy === "search" ? "Searching…" : "Search Commons"}</Button>
    </form>
    {busy === "search" ? <LoadingState>Searching Wikidata and Wikimedia Commons…</LoadingState> : null}
    {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
    {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
    {people && !people.length ? <InlineNotice tone="warning">{kind === "person" ? "No person with that exact name has a reusable Commons photo." : "No place with that name has a reusable Commons photo. Try the larger place it belongs to (e.g. the mountain or park)."} Check the spelling, or upload a photo you have rights to.</InlineNotice> : null}
    {people?.length ? <div className={styles.storyPhotoGrid}>{people.map(person => <article className={styles.storyPhotoCard} key={person.entityId}>
      <Image className={styles.storyPhotoPreview} src={person.thumbnailUrl} alt={`Wikimedia Commons photo of ${person.name}`} width={240} height={160} unoptimized />
      <strong>{person.name}{kind === "person" && person.birthYear ? ` (${person.birthYear})` : ""}</strong>
      {person.description ? <p>{person.description}</p> : null}
      <small>Photo: {person.author} · {person.license} · <a href={person.commonsUrl} target="_blank" rel="noreferrer">Commons ↗</a> · <a href={`https://www.wikidata.org/wiki/${person.entityId}`} target="_blank" rel="noreferrer">{person.entityId} ↗</a></small>
      <Button size="compact" disabled={disabled || Boolean(busy)} busy={busy === person.entityId} onClick={() => void importPerson(person)}>{busy === person.entityId ? "Importing…" : kind === "person" ? "Use this person" : "Use this place"}</Button>
    </article>)}</div> : null}
  </div>;
}

export function StoryPhotoPicker({ scope, photos, selected, onChange, onPhotosChanged }: {
  scope: Scope; photos: StoryReferencePhoto[]; selected: StoryReferenceSelection[];
  onChange: (selected: StoryReferenceSelection[]) => void;
  /** Reloads the photos after the editor sets a focal point. */
  onPhotosChanged?: () => void;
}) {
  return <fieldset className={styles.storyMaterials}><legend>Story photos for this slide · up to 3</legend>
    <p>Add photos in View content. Reference uses send the image to the model. Documentary portrait keeps one photo in a local composition, without AI redrawing the face; verify identity, source and reuse terms before approving.</p>
    <div className={styles.storyPhotoGrid}>{photos.filter(photo => photo.active || selected.some(ref => ref.id === photo.id)).map(photo => {
      const reference = selected.find(ref => ref.id === photo.id);
      return <article className={styles.storyPhotoCard} key={photo.id}>
        {/* Only a documentary photo is cropped locally; a reference photo is redrawn by the model. */}
        <PhotoPreview scope={scope} photo={photo} onFocusSaved={reference?.purpose === "documentary-portrait" ? onPhotosChanged : undefined} />
        <small>{photo.provenance}</small>
        <label><input type="checkbox" checked={Boolean(reference)} disabled={!reference && (!photo.active || (photo.providerTransmissionAllowed && (selected.length >= 3 || selected.some(ref => ref.purpose === "documentary-portrait"))))} onChange={event => onChange(!event.target.checked ? selected.filter(ref => ref.id !== photo.id)
          // A photo that may not be sent to the model is only ever a documentary portrait (exclusive on its slide).
          : photo.providerTransmissionAllowed ? [...selected, { id: photo.id, purpose: "subject" }] : [{ id: photo.id, purpose: "documentary-portrait" }])} /> {photo.name}{reference ? " · selected" : !photo.active ? " · removed" : !photo.providerTransmissionAllowed ? " · documentary portrait only" : selected.some(ref => ref.purpose === "documentary-portrait") ? " · exact portrait selected" : selected.length >= 3 ? " · limit of 3 reached" : ""}</label>
        {reference ? <label>Use as<select value={reference.purpose} onChange={event => {
          const purpose = event.target.value as StoryReferenceSelection["purpose"];
          onChange(purpose === "documentary-portrait" ? [{ id: photo.id, purpose }] : selected.map(ref => ref.id === photo.id ? { ...ref, purpose } : ref));
        }}>{STORY_REFERENCE_PURPOSES.map(purpose => <option value={purpose} key={purpose} disabled={!photo.providerTransmissionAllowed && purpose !== "documentary-portrait"}>{purpose === "documentary-portrait" ? "Documentary photo · keep original (never redrawn)" : purpose}</option>)}</select></label> : null}
      </article>;
    })}</div>
    {selected.filter(ref => !photos.some(photo => photo.id === ref.id)).map(ref => <p key={ref.id}>Unavailable photo <button type="button" onClick={() => onChange(selected.filter(item => item.id !== ref.id))}>Remove selection</button></p>)}
  </fieldset>;
}
