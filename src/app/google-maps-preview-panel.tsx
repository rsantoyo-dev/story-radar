"use client";

import { useEffect, useRef, useState } from "react";
import type { CreativeProfile } from "./modules/stories/creative-content.types";
import type { MapsPreviewConfiguration, MapsPreviewInput, MapsPreviewResult } from "./modules/stories/google-maps-preview.types";
import styles from "./creative-draft-workspace.generated.module.css";

export function GoogleMapsPreviewPanel({ topicId, secret, profile, disabled }: {
  topicId: string; secret: string; profile: CreativeProfile; disabled?: boolean;
}) {
  const [config, setConfig] = useState<MapsPreviewConfiguration>();
  const [name, setName] = useState("");
  const [languageCode, setLanguageCode] = useState("en");
  const [scope, setScope] = useState(profile.geoScope);
  const [result, setResult] = useState<MapsPreviewResult>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  const endpoint = `/api/radar/creative/maps-preview?topicId=${encodeURIComponent(topicId)}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not check Google Maps configuration.");
        if (!controller.signal.aborted) setConfig(body);
      }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => { controller.abort(); active.current?.abort(); };
  }, [endpoint, secret]);

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => {
      setResult(undefined);
      setError("This temporary preview expired. Run a new test to load current provider content.");
    }, Math.max(0, Date.parse(result.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [result]);

  async function prepare(mode: MapsPreviewInput["mode"]) {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(""); setResult(undefined);
    try {
      const response = await fetch(endpoint, { method: "POST", cache: "no-store", signal: controller.signal,
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ mode, name, languageCode, municipality: scope.municipality, region: scope.region, country: scope.country }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The map preview could not be prepared.");
      if (!controller.signal.aborted) setResult(body);
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "The preview request failed.");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }

  return <details className={styles.mapsPreviewPanel}>
    <summary>Google Maps · composition test</summary>
    <p>Find a named place, load its map and candidate photos, and compare temporary 4:5 layouts. This test does not change your drafts.</p>
    <div className={styles.fieldGrid}>
      <label className={styles.field}><span>Official place name</span>
        <input value={name} maxLength={160} onChange={event => setName(event.target.value)} disabled={busy || disabled} />
      </label>
      {(["municipality", "region", "country"] as const).map(field => <label className={styles.field} key={field}>
        <span>{field === "municipality" ? "Municipality" : field === "region" ? "Region / province" : "Country"}</span>
        <input value={scope[field]} maxLength={100} onChange={event => setScope({ ...scope, [field]: event.target.value })} disabled={busy || disabled} />
      </label>)}
      <label className={styles.field}><span>Search language code (en, fr, es…)</span>
        <input value={languageCode} maxLength={8} onChange={event => setLanguageCode(event.target.value)} disabled={busy || disabled} />
      </label>
    </div>
    <p className={styles.profileGuideHint}>Scope changes here apply only to this test. Use a square, building or business; road segments need a separate geometry workflow.</p>
    {config && (!config.enabled || !config.configured) && <p>Google is not enabled yet. Set <code>CREATIVE_GOOGLE_MAPS_API_KEY</code> and <code>CREATIVE_GOOGLE_MAPS_PREVIEW_ENABLED=true</code>, restart the app and reopen this panel. Demo works without credentials.</p>}
    {config?.enabled && config.configured && <p>Up to {config.maxPhotos} photos per test; {config.maxPreviewsPerDay} Google tests per server process per day. Provider charges may apply.</p>}
    <div className={styles.mapsPreviewActions}>
      <button type="button" disabled={busy || disabled || !config?.enabled || !config.configured || !name.trim() || !scope.municipality.trim() || !scope.country.trim()} onClick={() => void prepare("google")}>Test Google Maps</button>
    </div>
    <details><summary>Layout diagnostics</summary>
      <p>Tests the layout with placeholders. To prepare a publication, open the saved draft and generate or regenerate its images.</p>
      <button type="button" disabled={busy || disabled} onClick={() => void prepare("demo")}>Demo layout · no Google search</button>
    </details>
    {busy && <p role="status">Finding the place and preparing previews…</p>}
    {error && <p role="alert">{error}</p>}
    {result && <section aria-label="Map preview results" className={styles.mapsPreviewResults}>
      <strong>{result.status === "demo" ? "DEMO · placeholders only" : result.status === "candidate" ? result.place?.nameMatch === "search-candidate" ? "Google search candidate · identity not verified" : "Candidate for visual review" : "No unique place selected"}</strong>
      <ul>{result.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
      {result.mode === "google" && <>
        <p className={styles.mapsAttribution} translate="no">Google Maps</p>
        <p>{result.requests} provider requests. Temporary preview expires after 15 minutes.</p>
        {result.candidates.map((place, index) => <div key={index}>
          <p>
          <a href={place.sourceUrl} target="_blank" rel="noreferrer">{place.name}</a> · {place.address}
          {place.matchesScope ? " · Geographic scope matches" : " · Geographic scope not confirmed"}
          {place.attributions.map((author, i) => <span key={i}> · {author.url ? <a href={author.url} target="_blank" rel="noreferrer">{author.name}</a> : author.name}</span>)}
          </p>
          {!!place.exclusions?.length && <ul>{place.exclusions.map((reason, i) => <li key={i}>{reason}</li>)}</ul>}
        </div>)}
      </>}
      <div className={styles.mapsPreviewGrid}>
        {result.cards.map((card, index) => <article className={styles.mapsPreviewComposition} key={index}>
          <header>
            <span style={{ color: result.brand.color }}>{result.brand.name}</span>
            <h3>{result.place?.name || "Composition preview"}</h3>
            <p>{result.place?.address || "Demo · no real geographic information"}</p>
          </header>
          <div className={styles.mapsPreviewMedia}>
            {/* Private, original provider bytes; no Next image cache or image transformation. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.image} width={card.width} height={card.height} alt={card.label} />
          </div>
          <footer>
            <strong>{card.label}</strong>
            {result.place?.nameMatch === "search-candidate" && <p>Search candidate · identity with the requested place is not verified.</p>}
            <p>{card.kind === "map" ? "Location context only; not evidence of an event." : "Review the subject and capture context before use."}</p>
            {result.mode === "google" && <a className={styles.mapsAttribution} translate="no" href={result.place?.sourceUrl} target="_blank" rel="noreferrer">Google Maps</a>}
            {card.attributions.map((author, i) => <span key={i}> · {author.url ? <a href={author.url} target="_blank" rel="noreferrer">{author.name}</a> : author.name}</span>)}
            <p>Preview · not approved for publication</p>
          </footer>
        </article>)}
      </div>
    </section>}
  </details>;
}
