"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { STORY_REFERENCE_PURPOSES, type StoryReferencePhoto, type StoryReferenceSelection } from "./modules/stories/story-materials.types";
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
function PhotoPreview({ scope, photo }: { scope: Scope; photo: StoryReferencePhoto }) {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
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
  return url ? <Image className={styles.storyPhotoPreview} src={url} alt={photo.description} width={240} height={160} unoptimized /> : <span>{failed ? "Preview unavailable" : "Loading photo…"}</span>;
}
export function StoryPhotosPanel(scope: Scope) {
  const { photos, error, refresh } = useStoryPhotos(scope);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(photoUrl(scope), { method: "POST", headers: { Authorization: `Bearer ${scope.secret.trim()}` }, body: new FormData(form) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Upload failed");
      form.reset(); refresh(); setMessage("Photo saved. Select it on the relevant draft slides before generating images.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed"); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(photoUrl(scope, id), { method: "DELETE", headers: { Authorization: `Bearer ${scope.secret.trim()}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not remove photo");
      refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not remove photo"); }
    finally { setBusy(false); }
  }
  return <section className={styles.storyMaterials}>
    <h3>Story reference photos</h3>
    <p>Attach photos for this story. Choose their use on each draft slide before image generation.</p>
    {error ? <p role="alert">{error}</p> : null}
    <div className={styles.storyPhotoGrid}>{photos.map(photo => <article className={styles.storyPhotoCard} key={photo.id}>
      <PhotoPreview scope={scope} photo={photo} />
      <strong>{photo.name}</strong><p>{photo.description}</p><small>{photo.provenance}</small>
      {photo.active ? <button type="button" disabled={busy} onClick={() => revoke(photo.id)}>Remove from future generation</button> : <span>Removed · history preserved</span>}
    </article>)}</div>
    <form className={styles.storyMaterialForm} onSubmit={upload}>
      <label>Photo (JPG, PNG, WebP · up to 15 MB)<input name="image" type="file" accept="image/jpeg,image/png,image/webp" required disabled={busy} /></label>
      <label>Name<input name="name" maxLength={150} required disabled={busy} /></label>
      <label>What does this photo show?<textarea name="description" maxLength={1000} required rows={2} disabled={busy} /></label>
      <label>Source and permission to use<textarea name="provenance" maxLength={1000} required rows={2} disabled={busy} /></label>
      <label><input name="providerTransmissionAllowed" type="checkbox" value="true" required disabled={busy} /> I have permission to use this photo and send it to the image-generation provider.</label>
      <button type="submit" disabled={busy}>{busy ? "Saving…" : "Add photo"}</button>
    </form>
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
export function StoryPhotoPicker({ scope, photos, selected, onChange }: {
  scope: Scope; photos: StoryReferencePhoto[]; selected: StoryReferenceSelection[];
  onChange: (selected: StoryReferenceSelection[]) => void;
}) {
  return <fieldset className={styles.storyMaterials}><legend>Story photos for this slide · up to 3</legend>
    <p>These photos will be sent to the image model. Add photos in View content.</p>
    <div className={styles.storyPhotoGrid}>{photos.filter(photo => photo.active || selected.some(ref => ref.id === photo.id)).map(photo => {
      const reference = selected.find(ref => ref.id === photo.id);
      return <article className={styles.storyPhotoCard} key={photo.id}>
        <PhotoPreview scope={scope} photo={photo} />
        <label><input type="checkbox" checked={Boolean(reference)} disabled={!reference && (!photo.active || !photo.providerTransmissionAllowed || selected.length >= 3)} onChange={event => onChange(event.target.checked ? [...selected, { id: photo.id, purpose: "subject" }] : selected.filter(ref => ref.id !== photo.id))} /> {photo.name}{!photo.active ? " · removed" : ""}</label>
        {reference ? <label>Use as<select value={reference.purpose} onChange={event => onChange(selected.map(ref => ref.id === photo.id ? { ...ref, purpose: event.target.value as StoryReferenceSelection["purpose"] } : ref))}>{STORY_REFERENCE_PURPOSES.map(purpose => <option value={purpose} key={purpose}>{purpose}</option>)}</select></label> : null}
      </article>;
    })}</div>
    {selected.filter(ref => !photos.some(photo => photo.id === ref.id)).map(ref => <p key={ref.id}>Unavailable photo <button type="button" onClick={() => onChange(selected.filter(item => item.id !== ref.id))}>Remove selection</button></p>)}
  </fieldset>;
}
