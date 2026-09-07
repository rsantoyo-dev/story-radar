"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type {
  CreativeAssetEditRequest,
  CreativeBrandReference,
  CreativeGeneratedAsset,
} from "./modules/stories/creative-content.types";
import { BrandReferencePreview, TextAreaField } from "./creative-profile-fields";
import styles from "./creative-draft-workspace.generated.module.css";

export type BrandImageEditOptions = { useImageAsBase?: boolean; brandReferenceIds?: string[]; editInstruction?: string };

export type SaveEditRequestPayload = {
  baseAssetId: string;
  instruction: string;
  useImageAsBase: boolean;
  brandReferenceIds?: string[];
  editType: "generative";
};

export function CreativeBrandImageEditor({ asset, topicId, secret, disabled, savedRequest, savedRequestReadOnly, onSaveRequest, onDiscardRequest, onApply }: {
  asset: CreativeGeneratedAsset; topicId: string; secret: string; disabled: boolean;
  savedRequest?: CreativeAssetEditRequest;
  savedRequestReadOnly?: boolean;
  onSaveRequest?: (payload: SaveEditRequestPayload) => void;
  onDiscardRequest?: () => void;
  onApply?: (payload?: SaveEditRequestPayload) => void;
}) {
  const [open, setOpen] = useState(false);
  const [library, setLibrary] = useState<CreativeBrandReference[]>();
  const [error, setError] = useState<string>();
  const saved = asset.unitSnapshot.brandReferenceSelection?.selected ?? [];
  const savedInstruction = savedRequest?.instruction ?? "";
  const savedUseBase = savedRequest?.useImageAsBase ?? Boolean(asset.imageUrl);
  const savedIds = savedRequest?.brandReferenceIds ?? null;
  const [instruction, setInstruction] = useState(savedInstruction);
  const [useBase, setUseBase] = useState(savedUseBase);
  const [changed, setChanged] = useState(Boolean(savedIds));
  const [selected, setSelected] = useState(savedIds ?? saved.map(reference => reference.id));
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`/api/radar/creative/brand-references?topicId=${encodeURIComponent(topicId)}`, {
      signal: controller.signal, cache: "no-store", headers: { Authorization: `Bearer ${secret.trim()}` },
    }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load brand references");
      if (!controller.signal.aborted) setLibrary(data);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [open, topicId, secret]);

  const currentIds = changed ? selected : savedIds ?? [];
  const referencesChanged =
    changed &&
    (!savedIds ||
      savedIds.length !== currentIds.length ||
      currentIds.some(id => !savedIds.includes(id)) ||
      savedIds.some(id => !currentIds.includes(id)));
  const dirty =
    instruction.trim() !== savedInstruction.trim() ||
    useBase !== savedUseBase ||
    referencesChanged;
  const running = savedRequest?.status === "running";
  const failed = savedRequest?.status === "failed";
  const appliedCurrent =
    savedRequest?.status === "applied" &&
    savedRequest.appliedRevision === savedRequest.revision;
  const stateLabel = running
    ? "En ejecución"
    : failed
      ? "Falló"
      : dirty
        ? "Sin guardar"
        : appliedCurrent
          ? `Aplicado (rev ${savedRequest?.appliedRevision})`
          : savedRequest
            ? "Guardado"
            : asset.editSource
              ? "Aplicado"
              : undefined;
  const controlsEnabled = Boolean(onSaveRequest) && !savedRequestReadOnly;
  const applyEnabled = Boolean(onApply) && !savedRequestReadOnly && !running;

  function buildPayload(): SaveEditRequestPayload {
    return {
      baseAssetId: asset.id,
      instruction: instruction.trim(),
      useImageAsBase: useBase,
      ...(changed ? { brandReferenceIds: selected } : {}),
      editType: "generative",
    };
  }

  // "Save and apply" when there are unsaved edits, otherwise apply the stored
  // request. A failed request retries the same way.
  const primaryDisabled =
    !applyEnabled ||
    (changed && !library) ||
    (dirty ? !instruction.trim() : !savedRequest || appliedCurrent);
  const primaryLabel = running
    ? "Aplicando…"
    : dirty
      ? "Guardar y aplicar"
      : failed
        ? "Reintentar"
        : appliedCurrent
          ? "Sin cambios que aplicar"
          : useBase
            ? "Aplicar el cambio a esta imagen"
            : "Generar esta imagen con estas referencias";

  async function download() {
    try {
      setError(undefined);
      const response = await fetch(`/api/radar/creative/assets/${asset.id}?topicId=${encodeURIComponent(topicId)}`, {
        cache: "no-store", headers: { Authorization: `Bearer ${secret.trim()}` },
      });
      if (!response.ok) throw new Error((await response.json()).error || "Download unavailable");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = `slide-${asset.unitOrder}-v${asset.version}.png`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Download failed"); }
  }
  return <div className={styles.brandImageEditor}>
    {asset.editSource ? <p>Edited from image v{asset.editSource.version} · {asset.editInstruction}</p> : null}
    {stateLabel ? <span className={styles.editRequestState}>{stateLabel}</span> : null}
    {savedRequest?.blockedReason ? <p role="alert">No se pudo aplicar: {savedRequest.blockedReason}</p> : null}
    {failed && savedRequest?.lastError ? <p role="alert">Falló la ejecución: {savedRequest.lastError}</p> : null}
    <details onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>Brand references and image edits</summary>
      {open && asset.editSource ? <EditBasePreview assetId={asset.id} topicId={topicId} secret={secret} /> : null}
      {saved.map(reference => <div key={reference.id} className={styles.brandImageReference}>
        <strong>{reference.name || reference.id} · v{reference.version}/{reference.configVersion}</strong>
        {open ? <BrandReferencePreview topicId={topicId} secret={secret} referenceId={reference.id} version={reference.version} fileName={reference.name || "Brand reference"} /> : null}
        <p>{reference.function} · {reference.contribution?.guidance}</p>
        {reference.provenance ? <small>Source: {reference.provenance}</small> : null}
        {reference.usageNote ? <small>Use: {reference.usageNote}</small> : null}
        {reference.contribution?.avoid ? <small>Avoid: {reference.contribution.avoid}</small> : null}
      </div>)}
      {!saved.length ? <p>No brand images were sent for this version.</p> : null}
      {!disabled || controlsEnabled ? <>
        <label><input type="checkbox" checked={useBase} disabled={!asset.imageUrl} onChange={event => setUseBase(event.target.checked)} /> Use this finished image as the edit base</label>
        <TextAreaField label="Requested change" value={instruction} maxLength={2000} rows={3} onChange={setInstruction} />
        <p>Keep the saved references, or explicitly choose current library versions for this image. Other slides stay unchanged.</p>
        {library?.map(reference => <label key={reference.id}>
          <input type="checkbox" checked={selected.includes(reference.id)} disabled={!selected.includes(reference.id) && (!reference.isActive || !reference.activatedForJourney || !reference.providerTransmissionAllowed)}
            onChange={event => { setChanged(true); setSelected(event.target.checked ? [...selected, reference.id] : selected.filter(id => id !== reference.id)); }} />
          {reference.name} · v{reference.version}/{reference.configVersion}
        </label>)}
        {library ? <button type="button" className={styles.secondaryButton} onClick={() => setChanged(true)}>Use current library versions of the checked references</button> : null}
        <div className={styles.editRequestActions}>
          {controlsEnabled ? <button type="button" className={styles.secondaryButton}
            disabled={!dirty || !instruction.trim() || (changed && !library)}
            onClick={() => onSaveRequest?.(buildPayload())}>
            Guardar cambio
          </button> : null}
          {controlsEnabled && savedRequest?.status === "saved" ? <button type="button" className={styles.secondaryButton}
            onClick={() => onDiscardRequest?.()}>
            Descartar
          </button> : null}
          {onApply ? <button type="button" className={styles.secondaryButton} disabled={primaryDisabled}
            onClick={() => onApply(dirty ? buildPayload() : undefined)}>
            {primaryLabel}
          </button> : null}
        </div>
      </> : null}
    </details>
    {asset.status === "approved" ? <button type="button" className={styles.secondaryButton} disabled={disabled} onClick={download}>Download approved image</button> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}

function EditBasePreview({ assetId, topicId, secret }: { assetId: string; topicId: string; secret: string }) {
  const [source, setSource] = useState<string>();
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let url: string | undefined;
    fetch(`/api/radar/creative/assets/${assetId}?source=true&topicId=${encodeURIComponent(topicId)}`, {
      signal: controller.signal, cache: "no-store", headers: { Authorization: `Bearer ${secret.trim()}` },
    }).then(async response => {
      if (!response.ok) throw new Error("Unavailable");
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob); setSource(url);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [assetId, topicId, secret]);
  return <div className={styles.brandImageReference}><strong>Original edit base</strong>
    {source ? <Image src={source} alt="Image used as the edit base" width={320} height={400} unoptimized /> : <small>{error ? "Base preview unavailable" : "Loading base image…"}</small>}
  </div>;
}
