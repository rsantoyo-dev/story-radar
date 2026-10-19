"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import { ActionRow, Button, FormField, IconButton, InlineNotice, StatusBadge, type StatusTone } from "@/app/ui/primitives";
import { ModalLayer } from "@/app/ui/modal-layer";
import { MAP_PANEL_POSITIONS, type MapPanelPosition } from "@/app/modules/stories/map-panel-position";
import { WORDS_MIN_WIDTH, WORDS_SIZE, imageCleared, latestAttempt, shownAttempt, slideSettled, type Draft2ImageAttempt, type Draft2ImageReview, type Draft2Images, type Draft2SlideImage, type Draft2WordsLayout } from "@/app/modules/draft2/draft2-images.types";
import { VISUAL_MAX_CHARACTERS_PER_SLIDE } from "@/app/modules/draft2/draft2-visual.types";
import { draft2ModelName } from "@/app/modules/draft2/draft2-models";
import { OwnImageChooser, ReadsAsField } from "./draft-2-own-images";
import { PlaceControls, WordsRoleControls, type BrandSwatch } from "./draft-2-words-controls";
import styles from "./draft-2-canvas.generated.module.css";

/** Where the images are read from and the story's photos with them; the secret authorizes it when the editor is not signed in. */
export type ImagesScope = { topicId: string; storyId: string; sessionId: string; secret: string };

const SLIDE_PX = { width: 1080, height: 1350 } as const;

/** A layout with one role's "how it reads" set, or taken off (as written). */
function withSetAs(layout: Draft2WordsLayout, role: "headline" | "text", value: string | undefined): Draft2WordsLayout {
  const { setAs, ...rest } = layout;
  const next: NonNullable<Draft2WordsLayout["setAs"]> = { ...setAs };
  if (value === undefined) delete next[role];
  else next[role] = value;
  return next.headline !== undefined || next.text !== undefined ? { ...rest, setAs: next } : rest;
}

export const IMAGE_STATUS_LABEL: Record<Draft2ImageAttempt["status"], string> = { queued: "Waiting", submitting: "Sending", generating: "Generating", generated: "Made", failed: "Failed" };

/** What the reviewer found on an image (named by its model): passed, its blocking issues, or why it could not look. */
export function ImageReviewLines({ review }: { review: Draft2ImageReview }) {
  if (review.status === "passed") return <p className={styles.factMeta}>{draft2ModelName(review.model, "openai")}: passed.{review.note ? ` ${review.note}` : ""}</p>;
  if (review.status === "unavailable") return <p className={styles.factMeta}>{review.note}</p>;
  return <>
    <ul className={styles.issueList}>{review.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
    {review.note ? <p className={styles.factMeta}>{review.note}</p> : null}
  </>;
}

const MAP_POSITION_LABEL: Record<MapPanelPosition, string> = { "bottom-right": "Bottom right", "top-right": "Top right", "bottom-left": "Bottom left" };

/** The brand's characters as checkboxes, at most two on an image. */
export function CastChoice({ characters, selected, disabled, label, description, onChange, onRefresh, refreshing }: {
  characters: readonly { id: string; name: string }[];
  selected: readonly string[];
  disabled: boolean;
  label: string;
  description?: string;
  onChange: (characterIds: string[]) => void;
  /** Reads the brand's characters again, for one the editor just added; nothing made so far changes. */
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return <fieldset className={styles.focusVoice}>
    <legend className={styles.focusLegend}>{label}</legend>
    {characters.map((character) => {
      const checked = selected.includes(character.id);
      return <label key={character.id} className={styles.factMeta}>
        <input type="checkbox" checked={checked} disabled={disabled || (!checked && selected.length >= VISUAL_MAX_CHARACTERS_PER_SLIDE)} onChange={(event) => onChange(event.target.checked ? [...selected, character.id] : selected.filter((id) => id !== character.id))} /> {character.name}
      </label>;
    })}
    {description ? <p className={styles.factMeta}>{description}</p> : null}
    {onRefresh ? <div><Button variant="quiet" size="compact" busy={refreshing} disabled={disabled} onClick={onRefresh}>Read the brand’s characters again</Button></div> : null}
  </fieldset>;
}

/** A private image: fetched with the editor's credentials and shown from memory. */
export function PrivateDraft2Image({ url, secret, alt, wide }: { url: string; secret: string; alt: string; /** A wide image (a panorama's scene) at its own proportions. */ wide?: { width: number; height: number } }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    fetch(url, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The image is unavailable.");
        const blob = await response.blob();
        if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setSrc(objectUrl); }
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, secret]);
  return <div className={wide ? styles.sceneFrame : styles.imageFrame}>
    {src ? <Image className={wide ? styles.sceneFill : styles.imageFill} src={src} alt={alt} width={wide?.width ?? 432} height={wide?.height ?? 540} unoptimized /> : <p className={styles.factMeta}>{failed ? "Could not load the image." : "Loading…"}</p>}
  </div>;
}

/** One slide's preview with its words set as tried; with no layout, the program chooses one and says which. */
async function previewWords(story: { topicId: string; sessionId: string; secret: string }, slide: string, layout: Draft2WordsLayout | undefined, signal: AbortSignal) {
  const response = await fetch(`/api/radar/draft2/images/words?topicId=${encodeURIComponent(story.topicId)}`, {
    method: "POST", cache: "no-store", signal,
    headers: { Authorization: `Bearer ${story.secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: story.sessionId, slide, ...(layout ? { layout } : {}) }),
  });
  if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "The preview could not be made.");
  const read = <T,>(name: string): T | undefined => { const value = response.headers.get(name); return value ? JSON.parse(decodeURIComponent(value)) as T : undefined; };
  return { blob: await response.blob(), chosen: read<Draft2WordsLayout>("X-Words-Layout"), parts: read<WordsParts>("X-Words-Parts"), palette: read<BrandSwatch[]>("X-Brand-Palette") ?? [] };
}

/**
 * The words' editor. A slide lettered before layouts were kept (2026-10-17)
 * has none: the program finds again where it set the words, in the brand's
 * fonts, and the editor starts from there; applying it is a change.
 */
function WordsEditor({ layout, ...props }: Omit<Parameters<typeof WordsLayoutEditor>[0], "fresh" | "layout"> & { layout?: Draft2WordsLayout }) {
  const [chosen, setChosen] = useState<Draft2WordsLayout>();
  const [error, setError] = useState<string>();
  const { topicId, sessionId, secret } = props.story;
  const name = props.slide.slide;
  useEffect(() => {
    if (layout) return;
    const controller = new AbortController();
    previewWords({ topicId, sessionId, secret }, name, undefined, controller.signal)
      .then((preview) => { if (preview.chosen) setChosen(preview.chosen); else setError("The program could not place these words."); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The preview could not be made."); });
    return () => controller.abort();
  }, [layout, name, secret, sessionId, topicId]);
  const start = layout ?? chosen;
  if (!start) return <p className={styles.factMeta}>{error ?? "Finding where the words are…"}</p>;
  return <WordsLayoutEditor {...props} layout={start} fresh={!layout} />;
}

/** Where the headline and the text sat when the slide was last set, in slide pixels. */
type WordsParts = { headline: { top: number; bottom: number }; text?: { top: number; bottom: number } };
type WordsPart = keyof WordsParts;
type WordsBox = Draft2WordsLayout["box"];

/**
 * A slide's words as objects (2026-10-17, the editor: "a graphic editor of
 * the text object: move it, size it, adjust it by hand, a background or not,
 * styles"): the slide as the server sets it, with the headline's box and the
 * text's to drag (or move with the arrow keys) and to widen from their edge.
 * The text follows the headline until the editor moves its box (2026-10-18:
 * "the title and the subtitle handled differently"); then each has its own
 * alignment and background. Fonts, sizes, colours (the brand's first) and
 * marks per role. Each change is tried on the slide after a moment, so what
 * shows is what will be published; "Apply" makes a new version from the same
 * image, free. The style can go to every slide, each keeping its own places.
 */
function WordsLayoutEditor({ slide, layout, fresh, story, saving, locked, onDecide, onDirty, imageGroups }: {
  slide: Draft2SlideImage;
  layout: Draft2WordsLayout;
  /** The layout was just chosen by the program: the slide has not been set with it yet. */
  fresh: boolean;
  story: { topicId: string; sessionId: string; secret: string };
  saving: boolean;
  locked: boolean;
  onDecide: (input: Record<string, unknown>) => void;
  /** Told whether the layout differs from the slide's, so the studio asks before leaving it unapplied. */
  onDirty: (dirty: boolean) => void;
  /** The image groups every slide has, shown under the words' groups. */
  imageGroups: ReactNode;
}) {
  const [draft, setDraft] = useState<Draft2WordsLayout>(layout);
  // The words the program set on the image shown: what "how it reads" must keep.
  const words = shownAttempt(slide)?.words;
  const [all, setAll] = useState(false);
  // The slide as last set, where its parts sat, and the headline's box it was set with.
  const [preview, setPreview] = useState<{ src: string; parts?: WordsParts; at: WordsBox }>();
  const [palette, setPalette] = useState<BrandSwatch[]>([]);
  const [previewError, setPreviewError] = useState<string>();
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ part: WordsPart; mode: "move" | "width"; x: number; y: number; box: WordsBox } | undefined>(undefined);
  const changed = fresh || JSON.stringify(draft) !== JSON.stringify(layout);
  const disabled = locked || saving;
  // The server sets the words as tried, a moment after the last change: the preview is the slide as it would be published.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      previewWords({ topicId: story.topicId, sessionId: story.sessionId, secret: story.secret }, slide.slide, draft, controller.signal)
        .then(({ blob, parts, palette: colours }) => {
          setPreviewError(undefined);
          setPreview((current) => { if (current) URL.revokeObjectURL(current.src); return { src: URL.createObjectURL(blob), ...(parts ? { parts } : {}), at: draft.box }; });
          if (colours.length) setPalette(colours);
        })
        .catch((cause) => { if (!controller.signal.aborted) setPreviewError(cause instanceof Error ? cause.message : "The preview could not be made."); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [draft, slide.slide, story.secret, story.sessionId, story.topicId]);
  useEffect(() => () => { setPreview((current) => { if (current) URL.revokeObjectURL(current.src); return undefined; }); }, []);

  const clampBox = (box: WordsBox): WordsBox => {
    const width = Math.round(Math.min(SLIDE_PX.width, Math.max(WORDS_MIN_WIDTH, box.width)));
    return { width, left: Math.round(Math.min(SLIDE_PX.width - width, Math.max(0, box.left))), top: Math.round(Math.min(SLIDE_PX.height - 50, Math.max(0, box.top))) };
  };
  // The text's box: its own once set apart; else where it follows the headline, moving with the headline's box while it is dragged.
  const joined = preview?.parts?.text ? { left: draft.box.left, top: draft.box.top + (preview.parts.text.top - preview.at.top), width: draft.box.width } : undefined;
  const textBox = draft.textBlock?.box ?? joined;
  const apart = Boolean(draft.textBlock);
  const boxOf = (part: WordsPart) => part === "headline" ? draft.box : textBox;
  // Moving the text's box sets it apart, with the alignment and the background it had under the headline.
  const setBox = (part: WordsPart, box: WordsBox) => setDraft((current) => part === "headline"
    ? { ...current, box: clampBox(box) }
    : { ...current, textBlock: { align: current.textBlock?.align ?? current.align, background: current.textBlock?.background ?? current.background, box: clampBox(box) } });
  // A drag starts on a box (to move it) or on its edge (to widen it); the ref holds where it started, read only in the pointer events.
  function beginDrag(part: WordsPart, mode: "move" | "width", event: React.PointerEvent<HTMLElement>) {
    const box = boxOf(part);
    if (disabled || !box) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { part, mode, x: event.clientX, y: event.clientY, box };
  }
  const move = (event: React.PointerEvent<HTMLElement>) => {
    const start = drag.current;
    const rect = stage.current?.getBoundingClientRect();
    if (!start || !rect) return;
    const dx = ((event.clientX - start.x) / rect.width) * SLIDE_PX.width;
    const dy = ((event.clientY - start.y) / rect.height) * SLIDE_PX.height;
    setBox(start.part, start.mode === "move" ? { ...start.box, left: start.box.left + dx, top: start.box.top + dy } : { ...start.box, width: start.box.width + dx });
  };
  const release = () => { drag.current = undefined; };
  const keys = (part: WordsPart) => (event: React.KeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey ? 32 : 8;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    const box = boxOf(part);
    if (!delta || disabled || !box) return;
    event.preventDefault();
    setBox(part, { ...box, left: box.left + delta[0], top: box.top + delta[1] });
  };
  // Each box as tall as its part was set, at least a line's.
  const heightOf = (part: WordsPart) => { const span = preview?.parts?.[part]; return Math.max(40, span ? span.bottom - span.top : part === "headline" ? 200 : 120); };
  const styleOf = (box: WordsBox, height: number): CSSProperties => ({
    left: `${(box.left / SLIDE_PX.width) * 100}%`, top: `${(box.top / SLIDE_PX.height) * 100}%`,
    width: `${(box.width / SLIDE_PX.width) * 100}%`, height: `${(height / SLIDE_PX.height) * 100}%`,
  });
  const where = (box: WordsBox) => `left ${box.left}, top ${box.top}, width ${box.width}`;
  // The studio knows when the layout differs from the slide's, to keep the editor from leaving it unapplied by accident.
  useEffect(() => { onDirty(changed); }, [changed, onDirty]);
  const group = (name: string, body: ReactNode, open = false) => <details className={styles.studioGroup} open={open}>
    <summary>{name}</summary>
    <div className={styles.studioGroupBody}>{body}</div>
  </details>;
  return <>
    <div className={styles.studioBody}>
      <div className={styles.studioStageColumn}>
        <div ref={stage} className={styles.studioStage} onPointerMove={move} onPointerUp={release} onPointerCancel={release}>
          {preview ? <Image className={styles.imageFill} src={preview.src} alt={`${slide.label} with the words as tried`} width={864} height={1080} unoptimized /> : <p className={styles.factMeta}>{previewError ?? "Setting the words…"}</p>}
          <div className={styles.wordsBox} style={styleOf(draft.box, heightOf("headline"))} role="slider" tabIndex={0} aria-label="The headline's box: drag it, or move it with the arrow keys (Shift for larger steps)" aria-valuenow={draft.box.top} aria-valuemin={0} aria-valuemax={SLIDE_PX.height} aria-valuetext={where(draft.box)} onPointerDown={(event) => beginDrag("headline", "move", event)} onKeyDown={keys("headline")}>
            <span className={styles.wordsTag} aria-hidden="true">Headline</span>
            <span className={styles.wordsHandle} onPointerDown={(event) => beginDrag("headline", "width", event)} aria-hidden="true" />
          </div>
          {textBox && words?.text ? <div className={styles.wordsBoxText} style={styleOf(textBox, heightOf("text"))} role="slider" tabIndex={0} aria-label={apart ? "The text's box: drag it, or move it with the arrow keys (Shift for larger steps)" : "The text, under the headline: drag it or move it with the arrow keys to set it apart"} aria-valuenow={textBox.top} aria-valuemin={0} aria-valuemax={SLIDE_PX.height} aria-valuetext={where(textBox)} onPointerDown={(event) => beginDrag("text", "move", event)} onKeyDown={keys("text")}>
            <span className={styles.wordsTag} aria-hidden="true">Text</span>
            <span className={styles.wordsHandle} onPointerDown={(event) => beginDrag("text", "width", event)} aria-hidden="true" />
          </div> : null}
        </div>
        {previewError && preview ? <p className={styles.factMeta}>{previewError}</p> : null}
        <p className={styles.factMeta}>{apart
          ? `Drag a box to move it, its right edge to widen it; the arrow keys move it too (Shift: larger steps). Headline: ${where(draft.box)}. Text: ${textBox ? where(textBox) : ""} px.`
          : `Drag the box to move the words, its right edge to widen them; drag the text's box to set it apart. Box: ${where(draft.box)} px.`}</p>
        <ActionRow>
          {apart
            ? <Button size="compact" variant="quiet" disabled={disabled} onClick={() => { const { textBlock: _old, ...rest } = draft; void _old; setDraft(rest); }}>Put the text back under the headline</Button>
            : textBox && words?.text ? <Button size="compact" variant="quiet" disabled={disabled} onClick={() => setBox("text", textBox)}>Set the text apart</Button> : null}
        </ActionRow>
      </div>
      <div className={styles.studioPanel}>
        {group("Place", <>
          <PlaceControls label={apart ? "Headline" : "Words"} place={draft} palette={palette} disabled={disabled} onChange={(place) => setDraft({ ...draft, ...place })} />
          {draft.textBlock ? <PlaceControls label="Text" place={draft.textBlock} palette={palette} disabled={disabled} onChange={(place) => setDraft({ ...draft, textBlock: place })} /> : null}
        </>, true)}
        {group("Headline", <WordsRoleControls label="Headline" role={draft.headline} range={WORDS_SIZE.headline} palette={palette} disabled={disabled} onChange={(headline) => setDraft({ ...draft, headline })} />, true)}
        {group("Text", <>
          <WordsRoleControls label="Text" role={draft.text} range={WORDS_SIZE.text} palette={palette} disabled={disabled} onChange={(role) => setDraft({ ...draft, text: role })} />
          <label className={styles.factMeta}><input type="checkbox" checked={Boolean(draft.shadow)} disabled={disabled} onChange={(event) => { const { shadow: _old, ...rest } = draft; void _old; setDraft(event.target.checked ? { ...rest, shadow: true } : rest); }} /> A soft shadow under the letters (for words straight on a photo)</label>
        </>)}
        {words ? group("How it reads", <>
          <ReadsAsField label="headline" words={words.headline} value={draft.setAs?.headline} disabled={disabled} onChange={(headline) => setDraft(withSetAs(draft, "headline", headline))} />
          {words.text ? <ReadsAsField label="text" words={words.text} value={draft.setAs?.text} disabled={disabled} onChange={(value) => setDraft(withSetAs(draft, "text", value))} /> : null}
        </>) : null}
        {imageGroups}
      </div>
    </div>
    <footer className={styles.studioFooter}>
      <label className={styles.factMeta}><input type="checkbox" checked={all} disabled={disabled} onChange={(event) => setAll(event.target.checked)} /> Give every slide this style; each keeps its own places and line breaks</label>
      <div className={styles.studioActions}>
        {changed ? <StatusBadge tone="warning">Changes not applied</StatusBadge> : null}
        <Button size="compact" variant="quiet" disabled={disabled || JSON.stringify(draft) === JSON.stringify(layout)} onClick={() => setDraft(layout)}>Undo</Button>
        <Button size="compact" variant="primary" busy={saving} disabled={disabled || (!changed && !all)} onClick={() => onDecide({ action: "layout", slide: slide.slide, layout: draft, all })}>Apply</Button>
      </div>
    </footer>
  </>;
}

/**
 * The slide's image, its versions, what Sol found, another image and the
 * editor's own: the studio's groups that every slide has, with or without
 * words the program set.
 */
function ImageGroups({ slide, runId, characters, story, saving, locked, onDecide, onRefreshCharacters, refreshingCharacters }: {
  slide: Draft2SlideImage;
  runId: string;
  characters: readonly { id: string; name: string }[];
  story: ImagesScope;
  saving: boolean;
  locked: boolean;
  onDecide: (input: Record<string, unknown>) => void;
  onRefreshCharacters: () => void;
  refreshingCharacters: boolean;
}) {
  const [instruction, setInstruction] = useState("");
  const [edit, setEdit] = useState(false);
  const [ownOpen, setOwnOpen] = useState(false);
  // The cast for the next image: the slide's own until the editor changes it.
  const [cast, setCast] = useState<string[]>();
  // A verified photo keeps the brand's characters off; a map slide may carry one beside the card.
  const castable = characters.length > 0 && slide.need !== "real-photo";
  const selected = cast ?? slide.characterIds;
  const shown = shownAttempt(slide);
  const latest = latestAttempt(slide);
  const generated = slide.attempts.filter((attempt) => attempt.status === "generated");
  const pending = !slideSettled(slide);
  const corrected = shown?.kind === "correct" ? slide.attempts.find((attempt) => attempt.version === (shown.baseVersion ?? shown.correctsVersion)) : undefined;
  const map = slide.material.find((entry) => entry.kind === "map");
  const mapPosition = map?.kind === "map" && map.panel ? map.panel.position ?? "bottom-right" : undefined;
  void runId;
  const group = (name: string, body: ReactNode, { open = false, onToggle }: { open?: boolean; onToggle?: (open: boolean) => void } = {}) => <details className={styles.studioGroup} open={open} onToggle={onToggle ? (event) => onToggle(event.currentTarget.open) : undefined}>
    <summary>{name}</summary>
    <div className={styles.studioGroupBody}>{body}</div>
  </details>;
  return <>
    {group(`Image · v${shown?.version ?? "—"}`, <>
      {generated.length > 1 ? <div className={styles.imageVersions} role="group" aria-label={`${slide.label}: versions`}>
        {generated.map((attempt) => <Button key={attempt.version} size="compact" variant={attempt.version === shown?.version ? "secondary" : "quiet"} disabled={locked || attempt.version === shown?.version} onClick={() => onDecide({ action: "choose", slide: slide.slide, version: attempt.version })}>
          v{attempt.version}{attempt.kind === "correct" ? " · corrected" : attempt.kind === "regenerate" ? " · yours" : attempt.kind === "words" ? " · new words" : attempt.kind === "section" ? (attempt.own ? " · your scene" : " · panorama") : attempt.kind === "own" ? " · your image" : ""}
        </Button>)}
      </div> : <p className={styles.factMeta}>One version so far.</p>}
      {shown?.review ? <ImageReviewLines review={shown.review} /> : null}
      {shown?.own ? <p className={styles.factMeta}>{shown.own.fill === "slide" ? `Your image: ${shown.own.name}` : `A section of your scene, ${shown.own.name}`} ({shown.own.rights === "licensed" ? "licensed, credited in the caption" : "your own"}). Sol does not review it.</p> : null}
      {corrected?.review ? <p className={styles.factMeta}>{shown?.correctsVersion ? "Made again" : "Corrected"} from v{corrected.version} for: {corrected.review.issues.join(" ")}{shown?.review ? "" : " Not reviewed again: look at it yourself."}</p> : null}
      {latest && latest !== shown && latest.status === "failed" ? <p className={styles.factMeta}>v{latest.version} failed: {latest.error}</p> : null}
      {slide.notes.map((entry) => <p key={entry} className={styles.factMeta}>{entry}</p>)}
    </>, { open: !shown?.words })}
    {mapPosition ? group("Map card", <FormField label="Where the card sits" description="The program pastes the verified map after the image is made: move it where the words are not, and a new image is made around it.">
      <select value={mapPosition} disabled={locked || pending || saving} onChange={(event) => onDecide({ action: "map", slide: slide.slide, position: event.target.value })}>
        {MAP_PANEL_POSITIONS.map((position) => <option key={position} value={position}>{MAP_POSITION_LABEL[position]}</option>)}
      </select>
    </FormField>) : null}
    {group("Another image", <>
      <FormField label="What to change" description="Optional for a new image; needed to edit this one.">
        <textarea value={instruction} maxLength={600} rows={2} disabled={locked || pending} onChange={(event) => setInstruction(event.target.value)} />
      </FormField>
      {castable ? <CastChoice characters={characters} selected={selected} disabled={locked || pending} label="Brand characters in this image" description="Say what they do in “What to change”, for instance: Jo dances the line dance." onChange={setCast} onRefresh={onRefreshCharacters} refreshing={refreshingCharacters} /> : null}
      <label className={styles.factMeta}><input type="checkbox" checked={edit} disabled={locked || pending || !shown} onChange={(event) => setEdit(event.target.checked)} /> Edit this image, keeping its layout</label>
      <ActionRow>
        <Button size="compact" variant="secondary" busy={saving} disabled={locked || pending || (edit && !instruction.trim())} onClick={() => onDecide({ action: "regenerate", slide: slide.slide, instruction, edit, ...(castable ? { characterIds: selected } : {}) })}>{edit ? "Edit the image" : "Make another image"}</Button>
      </ActionRow>
    </>)}
    {group("Your own image", ownOpen ? <OwnImageChooser label={slide.label} scope={{ topicId: story.topicId, storyId: story.storyId, secret: story.secret }} saving={saving} locked={locked || pending} onUse={({ storyPhotoId, fit }) => onDecide({ action: "own", slide: slide.slide, storyPhotoId, fit })} /> : null, { onToggle: setOwnOpen })}
  </>;
}

/**
 * The slide studio (2026-10-18, the editor: "better ergonomics in the UI"):
 * one slide at a time over the Images screen, the preview as tall as the
 * window allows with the words' boxes on it, the controls beside it in
 * groups by use (Place and Headline open, the rest folded), Apply and Undo
 * always in view, and ◀ ▶ or the arrow keys to move to the next slide
 * without closing. A slide whose words the image model lettered shows its
 * image and the image groups alone. Changes not applied keep the studio
 * from moving or closing until the editor applies, undoes or discards them.
 */
export function SlideStudio({ images, slideName, characters, story, saving, locked, onDecide, onNavigate, onClose, onRefreshCharacters, refreshingCharacters }: {
  images: Draft2Images;
  slideName: string;
  characters: readonly { id: string; name: string }[];
  story: ImagesScope;
  /** The slide a decision is being saved for, if any. */
  saving?: string;
  locked: boolean;
  onDecide: (input: Record<string, unknown>) => void;
  onNavigate: (slide: string) => void;
  onClose: () => void;
  onRefreshCharacters: () => void;
  refreshingCharacters: boolean;
}) {
  const index = images.slides.findIndex((entry) => entry.slide === slideName);
  const slide = images.slides[index];
  const [dirty, setDirty] = useState(false);
  const [leaving, setLeaving] = useState<"close" | string>();
  const shown = slide ? shownAttempt(slide) : undefined;
  const latest = slide ? latestAttempt(slide) : undefined;
  const pending = slide ? !slideSettled(slide) : false;
  const busy = saving === slide?.slide || saving === "scene" || saving === "cut";
  // A new version or another slide: nothing is pending any more (derived in render, as React resets derived state).
  const key = `${slideName}:${shown?.version ?? 0}`;
  const [seen, setSeen] = useState(key);
  if (seen !== key) { setSeen(key); setDirty(false); setLeaving(undefined); }
  if (!slide) return null;
  const tone: StatusTone = !shown ? (latest?.status === "failed" ? "error" : "info") : imageCleared(shown) ? "success" : "warning";
  const status = shown ? (shown.own ? "Yours" : shown.review?.status === "passed" ? "Passed" : shown.kind === "correct" ? "Corrected" : shown.review?.status === "issues" ? "Issues" : "Made") : latest ? IMAGE_STATUS_LABEL[latest.status] : "No image";
  const url = shown ? `/api/radar/draft2/images/file?topicId=${encodeURIComponent(story.topicId)}&sessionId=${encodeURIComponent(story.sessionId)}&run=${encodeURIComponent(images.runId)}&slide=${encodeURIComponent(slide.slide)}&version=${shown.version}` : undefined;
  // Moving or closing with changes not applied asks first; the editor discards them or stays.
  const go = (target: "close" | string) => {
    if (dirty) { setLeaving(target); return; }
    if (target === "close") onClose(); else onNavigate(target);
  };
  const step = (delta: number) => { const next = images.slides[index + delta]; if (next) go(next.slide); };
  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [role=slider], [contenteditable]")) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
  };
  const imageGroups = <ImageGroups slide={slide} runId={images.runId} characters={characters} story={story} saving={busy} locked={locked} onDecide={onDecide} onRefreshCharacters={onRefreshCharacters} refreshingCharacters={refreshingCharacters} />;
  return <ModalLayer onClose={() => go("close")} canClose={!busy}>
    <div className={styles.studioBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) go("close"); }}>
      <section className={styles.studio} role="dialog" aria-modal="true" aria-label={`${slide.label}: the slide studio`} onKeyDown={onKeyDown}>
        <header className={styles.studioHeader}>
          <div className={styles.studioNav}>
            <IconButton aria-label="Previous slide" variant="quiet" size="compact" disabled={index === 0} onClick={() => step(-1)}>◀</IconButton>
            <span className={styles.factMeta}>{index + 1} / {images.slides.length}</span>
            <IconButton aria-label="Next slide" variant="quiet" size="compact" disabled={index === images.slides.length - 1} onClick={() => step(1)}>▶</IconButton>
            <h2 className={styles.studioTitle}>{slide.label}</h2>
            <StatusBadge tone={tone}>{status}</StatusBadge>
            {shown ? <span className={styles.factMeta}>v{shown.version}</span> : null}
          </div>
          <IconButton aria-label="Close the slide studio" variant="quiet" size="compact" onClick={() => go("close")} disabled={busy}>×</IconButton>
        </header>
        {leaving ? <InlineNotice tone="warning" title="Changes not applied">
          <ActionRow>
            <Button size="compact" variant="secondary" onClick={() => { setDirty(false); if (leaving === "close") onClose(); else onNavigate(leaving); }}>Discard them and {leaving === "close" ? "close" : "move on"}</Button>
            <Button size="compact" variant="quiet" onClick={() => setLeaving(undefined)}>Keep editing</Button>
          </ActionRow>
        </InlineNotice> : null}
        {shown?.words
          ? <WordsEditor key={`${slide.slide}:${shown.version}`} slide={slide} layout={shown.wordsLayout} story={story} saving={busy} locked={locked || pending} onDecide={onDecide} onDirty={setDirty} imageGroups={imageGroups} />
          : <>
            <div className={styles.studioBody}>
              <div className={styles.studioStageColumn}>
                {url ? <div className={styles.studioStage}><PrivateDraft2Image url={url} secret={story.secret} alt={`${slide.label}, version ${shown?.version}`} /></div> : <div className={styles.studioStage}><p className={styles.factMeta}>{latest?.status === "failed" ? latest.error : pending ? "Being made…" : "No image"}</p></div>}
                {shown && !shown.words ? <p className={styles.factMeta}>The image model lettered this slide’s words: to move or restyle them, choose words set by the program in the Focus and make the images again.</p> : null}
              </div>
              <div className={styles.studioPanel}>{imageGroups}</div>
            </div>
            <footer className={styles.studioFooter}><span /><Button size="compact" variant="secondary" onClick={() => go("close")}>Close</Button></footer>
          </>}
      </section>
    </div>
  </ModalLayer>;
}
