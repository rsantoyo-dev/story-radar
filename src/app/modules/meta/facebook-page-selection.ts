/** Server-side Page discovery. Token-bearing candidates must never be serialized to the browser. */
export type FacebookPageCandidate = {
  id: string;
  name: string;
  pageAccessToken: string;
  tasks: string[];
  linkedInstagramId?: string;
};

export type FacebookPageList = { pages: FacebookPageCandidate[]; nextCursor?: string };

export class FacebookPageSelectionError extends Error {}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseFacebookPageList(value: unknown): FacebookPageList {
  if (!record(value) || !Array.isArray(value.data) || value.data.length > 100) {
    throw new FacebookPageSelectionError("Invalid Page list");
  }
  const pages = value.data.map((item): FacebookPageCandidate => {
    if (!record(item) || typeof item.id !== "string" || !/^\d+$/.test(item.id) ||
      typeof item.name !== "string" || !item.name.trim() ||
      typeof item.access_token !== "string" || !item.access_token ||
      !Array.isArray(item.tasks) || !item.tasks.every(task => typeof task === "string")) {
      throw new FacebookPageSelectionError("Invalid Page list");
    }
    const linked = item.instagram_business_account;
    if (linked !== undefined && linked !== null &&
      (!record(linked) || typeof linked.id !== "string" || !/^\d+$/.test(linked.id))) {
      throw new FacebookPageSelectionError("Invalid linked Instagram account");
    }
    return { id: item.id, name: item.name, pageAccessToken: item.access_token, tasks: item.tasks,
      ...(record(linked) ? { linkedInstagramId: linked.id as string } : {}) };
  });
  if (new Set(pages.map(page => page.id)).size !== pages.length) {
    throw new FacebookPageSelectionError("Duplicate Page ID");
  }
  const paging = value.paging;
  const cursors = record(paging) && record(paging.cursors) ? paging.cursors : undefined;
  const nextCursor = record(paging) && paging.next ? cursors?.after : undefined;
  if (record(paging) && paging.next && !nextCursor) {
    throw new FacebookPageSelectionError("Missing Page cursor");
  }
  if (nextCursor && (typeof nextCursor !== "string" || nextCursor.length > 1024)) {
    throw new FacebookPageSelectionError("Invalid Page cursor");
  }
  return { pages, ...(typeof nextCursor === "string" ? { nextCursor } : {}) };
}

/** Page names are not identifiers; the ID must match a fresh server-fetched candidate. */
export function selectFacebookPage(pages: readonly FacebookPageCandidate[], pageId: string): FacebookPageCandidate {
  const selected = pages.find(page => page.id === pageId);
  if (!selected || !selected.tasks.some(task => task === "CREATE_CONTENT" || task === "PROFILE_PLUS_CREATE_CONTENT")) {
    throw new FacebookPageSelectionError("Page is unavailable for publishing");
  }
  return selected;
}

export function publicFacebookPages(pages: readonly FacebookPageCandidate[]) {
  return pages.map(({ id, name, tasks, linkedInstagramId }) => ({ id, name,
    ...(linkedInstagramId ? { linkedInstagramId } : {}),
    canCreateContent: tasks.includes("CREATE_CONTENT") || tasks.includes("PROFILE_PLUS_CREATE_CONTENT") }));
}
