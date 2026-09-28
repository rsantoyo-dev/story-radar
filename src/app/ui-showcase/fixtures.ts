/** Safe UI states. These are never loaded by the editorial or publishing APIs. */
export const UX_FIXTURES = [
  { id: "first-use", title: "First use", state: "empty", detail: "No Topic or source is configured yet. Create a Topic to define its identity and editorial strategy." },
  { id: "many-stories", title: "Many Stories", state: "ready", detail: "24 Stories collected, 7 selected, and 3 waiting for production review." },
  { id: "multilingual", title: "Long multilingual content", state: "review", detail: "A guide to settlement services in Toronto · Guide des services d’établissement à Toronto · Guía de servicios para recién llegados en Toronto." },
  { id: "missing-evidence", title: "Missing evidence", state: "blocked", detail: "The source excerpt does not support the proposed consequence. Enrich or edit the Story before approval." },
  { id: "stale-version", title: "Stale script", state: "review", detail: "Content revision 4 is newer than script version 2. Previous images remain in history." },
  { id: "historical-image", title: "Historical image", state: "archive", detail: "Image version 1 is read only. Select the current approved version before preparing publication." },
  { id: "partial-permission", title: "Partial permission", state: "blocked", detail: "The connected account can read media, but publishing permission needs review." },
  { id: "uncertain-publication", title: "Uncertain publication", state: "review", detail: "The provider response is uncertain. Reconcile the existing job before another send." },
] as const;
