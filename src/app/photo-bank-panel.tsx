"use client";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { STORY_PHOTO_RIGHTS } from "./modules/stories/story-materials.types";
import { subjectKey, type PhotoBankPhoto, type PhotoBankSubject, type PhotoBankView } from "./modules/photo-bank/photo-bank.types";
import { PHOTO_RIGHTS_LABEL } from "./story-photos-panel";
import { Button, EmptyState, FormField, InlineNotice, LoadingState, SectionHeader, StatusBadge } from "./ui/primitives";
import styles from "./radar-dashboard.generated.module.css";

type Scope = { topicId: string; secret: string };
type Show = "all" | "places" | "people" | "loose";
const SHOW_LABEL: Record<Show, string> = { all: "Everything", places: "Places", people: "People", loose: "Not given to anyone" };
const bankUrl = (scope: Scope, path = "", query = "") => `/api/radar/photo-bank${path}?topicId=${encodeURIComponent(scope.topicId)}${query}`;

async function bankCall<T>(scope: Scope, path: string, init: RequestInit = {}, query = ""): Promise<T> {
  const response = await fetch(bankUrl(scope, path, query), { ...init, cache: "no-store", headers: { ...(init.headers ?? {}), Authorization: `Bearer ${scope.secret.trim()}` } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "The photo bank could not be reached.");
  return result as T;
}

/** A bank photo, fetched with the editor's credentials. */
function BankThumb({ scope, photo }: { scope: Scope; photo: PhotoBankPhoto }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  const { topicId, secret } = scope;
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    fetch(bankUrl({ topicId, secret }, `/photos/${encodeURIComponent(photo.id)}`), { headers: { Authorization: `Bearer ${secret.trim()}` }, cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Photo unavailable");
        const blob = await response.blob();
        if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setSrc(objectUrl); }
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [topicId, secret, photo.id]);
  return src ? <Image className={styles.storyPhotoPreview} src={src} alt={photo.description || photo.name} width={240} height={160} unoptimized /> : <span className={styles.bankMeta}>{failed ? "Preview unavailable" : "Loading photo…"}</span>;
}

/** The editor's word on what a photo shows: one of the bank's places or people, or a new one. */
function AddSubject({ photo, subjects, disabled, onAdd }: { photo: PhotoBankPhoto; subjects: readonly PhotoBankSubject[]; disabled: boolean; onAdd: (tag: { subjectId: string } | { kind: "place" | "person"; name: string }) => void }) {
  const [choice, setChoice] = useState("");
  const [name, setName] = useState("");
  const others = subjects.filter((subject) => !photo.subjectIds.includes(subject.id));
  const fresh = choice === "new-place" || choice === "new-person";
  return <div className={styles.bankAdd}>
    <label>It shows
      <select value={choice} disabled={disabled} onChange={(event) => {
        const value = event.target.value;
        if (value && value !== "new-place" && value !== "new-person") { onAdd({ subjectId: value }); setChoice(""); return; }
        setChoice(value);
      }}>
        <option value="">Choose a place or person…</option>
        {(["place", "person"] as const).map((kind) => <optgroup key={kind} label={kind === "place" ? "Places" : "People"}>
          {others.filter((subject) => subject.kind === kind).map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </optgroup>)}
        <option value="new-place">A new place…</option>
        <option value="new-person">A new person…</option>
      </select>
    </label>
    {fresh ? <form className={styles.bankAddNew} onSubmit={(event) => { event.preventDefault(); if (!name.trim()) return; onAdd({ kind: choice === "new-place" ? "place" : "person", name: name.trim() }); setName(""); setChoice(""); }}>
      <label>{choice === "new-place" ? "The place's name" : "The person's name"}<input value={name} maxLength={150} disabled={disabled} onChange={(event) => setName(event.target.value)} /></label>
      <Button type="submit" size="compact" variant="secondary" disabled={disabled || !name.trim()}>Add</Button>
    </form> : null}
  </div>;
}

/** One bank photo: what it shows, its credit, what the publication may do with it, where it was used, and the editor's changes. */
function BankPhotoCard({ scope, photo, subjects, busy, onChange }: { scope: Scope; photo: PhotoBankPhoto; subjects: readonly PhotoBankSubject[]; busy: boolean; onChange: (photoId: string, change: Record<string, unknown>) => void }) {
  const shows = photo.subjectIds.map((id) => subjects.find((subject) => subject.id === id)).filter((subject): subject is PhotoBankSubject => Boolean(subject));
  return <article className={styles.storyPhotoCard}>
    <BankThumb scope={scope} photo={photo} />
    <strong>{photo.name}</strong>
    {photo.description && subjectKey(photo.description) !== subjectKey(photo.name) ? <p className={styles.bankMeta}>{photo.description}</p> : null}
    <p className={styles.bankMeta}>{photo.provenance}</p>
    <p className={styles.bankMeta}>{photo.uses === 1 ? "In 1 story" : `In ${photo.uses} stories`}{photo.origin ? ` · first in “${photo.origin.storyTitle}” (${photo.origin.topicName})` : " · added to the bank"}{photo.source === "commons" ? " · Wikimedia Commons" : ""}</p>
    {photo.retired ? <StatusBadge tone="neutral">Retired: no longer offered</StatusBadge> : null}
    <label>Publication<select value={photo.rights} disabled={busy} onChange={(event) => onChange(photo.id, { publicationRights: event.target.value })}>
      {STORY_PHOTO_RIGHTS.map((rights) => <option key={rights} value={rights}>{PHOTO_RIGHTS_LABEL[rights]}</option>)}
    </select></label>
    {shows.length ? <div className={styles.bankTags} role="group" aria-label={`What ${photo.name} shows`}>
      {shows.map((subject) => <Button key={subject.id} size="compact" variant="quiet" disabled={busy} aria-label={`Take ${subject.name} off this photo`} onClick={() => onChange(photo.id, { untag: subject.id })}>{subject.name} ×</Button>)}
    </div> : null}
    <AddSubject photo={photo} subjects={subjects} disabled={busy} onAdd={(tag) => onChange(photo.id, { tag })} />
    <Button size="compact" variant="quiet" disabled={busy} onClick={() => onChange(photo.id, { retired: !photo.retired })}>{photo.retired ? "Offer it again" : "Retire from the bank"}</Button>
  </article>;
}

/** A place or a person with its photos, how stories find it, and, for a person Wikidata does not know, their consent to appear. */
function SubjectCard({ scope, subject, photos, subjects, busy, onPhoto, onSubject }: {
  scope: Scope; subject: PhotoBankSubject; photos: readonly PhotoBankPhoto[]; subjects: readonly PhotoBankSubject[]; busy: boolean;
  onPhoto: (photoId: string, change: Record<string, unknown>) => void; onSubject: (subjectId: string, change: Record<string, unknown>) => void;
}) {
  const known = subject.googlePlaceId || subject.wikidataId;
  return <article className={styles.bankSubject}>
    <div className={styles.bankSubjectHead}>
      <strong>{subject.name}</strong>
      {subject.aliases.length ? <span>also “{subject.aliases.join("”, “")}”</span> : null}
      {subject.address ? <span>{subject.address}</span> : null}
      {subject.googlePlaceId ? <a href={`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(subject.googlePlaceId)}`} target="_blank" rel="noreferrer">Google Maps ↗</a> : null}
      {subject.wikidataId ? <a href={`https://www.wikidata.org/wiki/${encodeURIComponent(subject.wikidataId)}`} target="_blank" rel="noreferrer">{subject.wikidataId} ↗</a> : null}
      <StatusBadge tone={known || subject.kind === "person" ? "info" : "neutral"}>{subject.kind === "place" ? (known ? "Found by its id: its photo is given on its own" : "Found by its name: offered") : subject.confirmed && (subject.wikidataId || subject.consent) ? "Confirmed: their photo is given on its own" : "Offered: you confirm it once"}</StatusBadge>
    </div>
    {subject.kind === "person" && !subject.wikidataId ? <label className={styles.bankMeta}>
      <input type="checkbox" checked={subject.consent} disabled={busy} onChange={(event) => onSubject(subject.id, { consent: event.target.checked })} /> {subject.name} agreed to appear in our posts{subject.consent ? "" : ": until you record it, their photos are only offered"}
    </label> : null}
    {photos.length ? <div className={styles.storyPhotoGrid}>{photos.map((photo) => <BankPhotoCard key={photo.id} scope={scope} photo={photo} subjects={subjects} busy={busy} onChange={onPhoto} />)}</div>
      : <p className={styles.bankMeta}>No photo shows {subject.kind === "place" ? "it" : "them"} any more.</p>}
  </article>;
}

/** A photo added to the bank itself: the story photo's rules, and what it shows. */
function UploadForm({ scope, subjects, disabled, onUploaded }: { scope: Scope; subjects: readonly PhotoBankSubject[]; disabled: boolean; onUploaded: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [subject, setSubject] = useState("");
  const [error, setError] = useState("");
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    const file = body.get("image");
    if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size === 0 || file.size > 15 * 1024 * 1024) { setError("Choose a JPG, PNG or WebP photo under 15 MB."); return; }
    if (subject === "new-place" || subject === "new-person") body.set("subjectKind", subject === "new-place" ? "place" : "person");
    else if (subject) body.set("subjectId", subject);
    setBusy(true); setError("");
    try {
      const result = await bankCall<{ existed: boolean }>(scope, "", { method: "POST", body });
      form.reset(); setSubject("");
      onUploaded(result.existed ? "The bank already had this photo: it is filed under what you chose." : "Photo added to the bank.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed"); }
    finally { setBusy(false); }
  }
  const off = disabled || busy;
  return <form className={styles.storyMaterialForm} onSubmit={upload}>
    <label>Photo (JPG, PNG, WebP · up to 15 MB)<input name="image" type="file" accept="image/jpeg,image/png,image/webp" required disabled={off} /></label>
    <label>Name<input name="name" maxLength={150} required disabled={off} /></label>
    <label>What does this photo show?<textarea name="description" maxLength={1000} required rows={2} disabled={off} /></label>
    <label>Source, photographer, license and permission to use<textarea name="provenance" maxLength={1000} required rows={2} disabled={off} placeholder="Photographer · license and license URL · original file URL" /></label>
    <label>What may we do with it?<select name="publicationRights" required defaultValue="" disabled={off}>
      <option value="" disabled>Choose…</option>
      {STORY_PHOTO_RIGHTS.map((rights) => <option key={rights} value={rights}>{PHOTO_RIGHTS_LABEL[rights]}</option>)}
    </select></label>
    <label>The place or person it shows<select value={subject} disabled={off} onChange={(event) => setSubject(event.target.value)}>
      <option value="">Not now</option>
      {(["place", "person"] as const).map((kind) => <optgroup key={kind} label={kind === "place" ? "Places" : "People"}>
        {subjects.filter((entry) => entry.kind === kind).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </optgroup>)}
      <option value="new-place">A new place…</option>
      <option value="new-person">A new person…</option>
    </select></label>
    {subject === "new-place" || subject === "new-person" ? <label>{subject === "new-place" ? "The place's name, as stories name it" : "The person's name, as stories name them"}<input name="subjectName" maxLength={150} required disabled={off} /></label> : null}
    <label><input name="providerTransmissionAllowed" type="checkbox" value="true" required disabled={off} /> I have permission to use this photo and send it to the image-generation provider.</label>
    <Button type="submit" variant="secondary" busy={busy} disabled={off}>{busy ? "Saving…" : "Add to the bank"}</Button>
    {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
  </form>;
}

/**
 * The workspace's photo bank: every photo its stories received, shared by its
 * brands, filed under the places and people it shows. A story's People and
 * places finds them here before Commons. The editor searches it, declares
 * once what the publication may do with a photo, records a person's consent,
 * says what a photo shows, retires one, or adds a photo to the bank itself.
 */
export function PhotoBankPanel({ topicId, secret, active }: Scope & { active: boolean }) {
  const scope = useMemo(() => ({ topicId, secret }), [topicId, secret]);
  const [view, setView] = useState<PhotoBankView>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [retired, setRetired] = useState(false);
  const retiredQuery = retired ? "&retired=true" : "";
  const load = useCallback(async () => {
    setError("");
    try { setView(await bankCall<PhotoBankView>(scope, "", {}, retiredQuery)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The photo bank could not be read."); }
  }, [scope, retiredQuery]);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [active, load]);
  async function change(path: string, body: Record<string, unknown>) {
    setBusy(true); setError(""); setNotice("");
    try { setView(await bankCall<PhotoBankView>(scope, path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, retiredQuery)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The change was not saved."); }
    finally { setBusy(false); }
  }
  const onPhoto = (photoId: string, body: Record<string, unknown>) => void change(`/photos/${encodeURIComponent(photoId)}`, body);
  const onSubject = (subjectId: string, body: Record<string, unknown>) => void change(`/subjects/${encodeURIComponent(subjectId)}`, body);
  const wanted = subjectKey(query);
  const subjects = view?.subjects ?? [];
  const photos = view?.photos ?? [];
  const photoMatches = (photo: PhotoBankPhoto) => !wanted || subjectKey(`${photo.name} ${photo.description} ${photo.provenance}`).includes(wanted);
  const subjectMatches = (subject: PhotoBankSubject) => !wanted || [subject.name, ...subject.aliases, subject.address ?? ""].some((name) => subjectKey(name).includes(wanted));
  const listed = (kind: "place" | "person") => subjects.filter((subject) => subject.kind === kind)
    .map((subject) => ({ subject, photos: photos.filter((photo) => photo.subjectIds.includes(subject.id)) }))
    .filter(({ subject, photos: mine }) => subjectMatches(subject) || mine.some(photoMatches))
    .sort((a, b) => a.subject.name.localeCompare(b.subject.name));
  const loose = photos.filter((photo) => !photo.subjectIds.length && photoMatches(photo));
  const places = show === "all" || show === "places" ? listed("place") : [];
  const people = show === "all" || show === "people" ? listed("person") : [];
  const looseShown = show === "all" || show === "loose" ? loose : [];
  return <section className={styles.panel} aria-label="Photo bank">
    <SectionHeader title="Photo bank" description="Every photo your stories received, shared by all your brands and filed under the places and people it shows. When a story names one of them, People and places offers its photos first, before Commons, and gives a place its photo on its own. Declare once what you may publish: it holds for every story." />
    <div className={styles.bankToolbar}>
      <FormField label="Find a place, a person or a photo"><input type="search" value={query} placeholder="Parulines, Jo…" onChange={(event) => setQuery(event.target.value)} /></FormField>
      <FormField label="Show">
        <select value={show} onChange={(event) => setShow(event.target.value as Show)}>
          {(Object.keys(SHOW_LABEL) as Show[]).map((key) => <option key={key} value={key}>{SHOW_LABEL[key]}</option>)}
        </select>
      </FormField>
      <label className={styles.bankMeta}><input type="checkbox" checked={retired} onChange={(event) => setRetired(event.target.checked)} /> Include retired photos</label>
    </div>
    {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
    {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
    {!view && !error ? <LoadingState>Reading the photo bank…</LoadingState> : null}
    {view && !photos.length ? <EmptyState title="The bank is empty">Photos you add to a story, or confirm from Commons, are kept here.</EmptyState> : null}
    {places.length ? <div className={styles.bankSection}>
      <SectionHeader level={3} title="Places" />
      {places.map(({ subject, photos: mine }) => <SubjectCard key={subject.id} scope={scope} subject={subject} photos={mine} subjects={subjects} busy={busy} onPhoto={onPhoto} onSubject={onSubject} />)}
    </div> : null}
    {people.length ? <div className={styles.bankSection}>
      <SectionHeader level={3} title="People" description="Pasted unchanged as a documentary portrait, never redrawn. A person Wikidata does not know appears only once you record their consent." />
      {people.map(({ subject, photos: mine }) => <SubjectCard key={subject.id} scope={scope} subject={subject} photos={mine} subjects={subjects} busy={busy} onPhoto={onPhoto} onSubject={onSubject} />)}
    </div> : null}
    {looseShown.length ? <div className={styles.bankSection}>
      <SectionHeader level={3} title="Not given to a place or person yet" description="Say what each one shows: the next story that names that place or person finds it." />
      <div className={styles.storyPhotoGrid}>{looseShown.map((photo) => <BankPhotoCard key={photo.id} scope={scope} photo={photo} subjects={subjects} busy={busy} onChange={onPhoto} />)}</div>
    </div> : null}
    {view && wanted && !places.length && !people.length && !looseShown.length ? <p className={styles.bankMeta}>Nothing in the bank matches “{query}”.</p> : null}
    <details className={styles.bankSection}>
      <summary>Add a photo to the bank</summary>
      <UploadForm scope={scope} subjects={subjects} disabled={busy} onUploaded={(message) => { setNotice(message); void load(); }} />
    </details>
  </section>;
}
