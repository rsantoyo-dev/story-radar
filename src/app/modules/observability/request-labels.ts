/**
 * Plain names for the API requests Activity lists (`POST /api/radar/...`).
 * Pure, so the dashboard can name a request without another round trip.
 */

const ROUTE_LABELS: Record<string, string> = {
  "POST collect": "Search for stories",
  "POST evaluate": "Evaluate stories with AI",
  "POST daily-preparation": "Prepare my day",
  "POST daily-preparation/resume": "Continue preparing the day",
  "POST daily-planner": "Plan the day",
  "PATCH reviews": "Review the shortlist",
  "DELETE reviews": "Clear a story approval",
  "POST stories/:id/promote": "Promote a story",
  "POST stories/:id/select-owned": "Select original content",
  "PUT stories/:id/content": "Edit story content",
  "POST stories/:id/creative": "Create a creative brief",
  "POST creative/briefs/:id/drafts": "Write a draft",
  "PUT creative/drafts/:id": "Save a draft",
  "POST creative/drafts/:id/assets": "Generate images",
  "POST creative/assets/:id": "Regenerate an image",
  "PATCH creative/assets/:id": "Approve or reject an image",
  "POST creative/drafts/:id/companion": "Generate a companion story",
  "POST creative/drafts/:id/recover": "Recover a draft",
  "POST creative/drafts/:id/publication-package": "Freeze the publication package",
  "DELETE creative/drafts/:id/publication-package": "Discard the publication package",
  "POST creative/drafts/:id/publication-job": "Publish",
  "PATCH creative/drafts/:id/publication-job": "Confirm a publication",
  "POST creative/maps-preview": "Preview a map",
  "PUT creative-profile": "Save the creative profile",
  "POST creative-profile/brand-assets": "Upload a brand asset",
  "POST creative-profile/identity-suggestion": "Organize the visual guide with AI",
  "POST creative-profile/palette-suggestion": "Suggest a palette with AI",
  "PUT editorial-profile": "Save editorial criteria",
  "PUT preferences": "Save editorial preferences",
  "POST topics": "Create a brand",
  "PATCH topics/:id": "Update a brand",
  "DELETE topics/:id": "Delete a brand",
  "POST topics/:id/setup": "Guided setup step",
  "POST topics/:id/editorial-lines": "Save an editorial line",
  "PUT topics/:id/acquisition-lenses": "Publish acquisition angles",
  "PUT topics/:id/ai-research": "Save AI research settings",
  "POST topics/:id/sources": "Link a feed",
  "PATCH topics/:id/sources/:id": "Update a feed link",
  "DELETE topics/:id/sources/:id": "Unlink a feed",
  "POST sources/rss": "Add an RSS feed",
  "DELETE sources/rss/:id": "Delete an RSS feed",
  "POST topics/:id/meta/media/sync": "Sync Instagram publications",
  "POST topics/:id/meta/media/metrics": "Refresh Instagram metrics",
  "POST credits/reset": "Reset demo credits",
  "POST billing/checkout": "Start a credit purchase",
  "DELETE admin": "Clear brand data",
};

const VERBS: Record<string, string> = { PUT: "Update", PATCH: "Update", DELETE: "Delete", GET: "Read" };
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;

/** `POST /api/radar/creative/drafts/<id>/assets` → "Generate images". */
export function describeRoute(route: string | null | undefined): string | undefined {
  const match = /^([A-Z]+) \/api\/radar\/?(.*)$/u.exec(route?.trim() ?? "");
  if (!match) return undefined;
  const [, method, rest] = match;
  const pattern = rest!.replace(UUID, ":id").replace(/\/$/u, "");
  const known = ROUTE_LABELS[`${method} ${pattern}`];
  if (known) return known;
  const words = pattern.split("/").filter((part) => part && part !== ":id").map((part) => part.replaceAll("-", " ")).join(" › ");
  const text = [VERBS[method!], words].filter(Boolean).join(" ");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : undefined;
}
