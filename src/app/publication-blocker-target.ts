/** Where in the draft workspace a publication blocker is resolved. */
export type BlockerTarget = { tab: "script" | "visuals"; assetId?: string; label: string };

const SCRIPT_BLOCKERS = new Set(["draft-approval", "stale-input"]);
const IMAGE_BLOCKERS = new Set(["stale-batch", "incomplete-batch", "incomplete-selection", "image-approval", "missing-image",
  "image-text-changed", "documentary-final-approval", "documentary-stale", "usage-rights"]);

export function publicationBlockerTarget(blocker: { code: string; message: string; assetId?: string }): BlockerTarget | undefined {
  if (SCRIPT_BLOCKERS.has(blocker.code)) return { tab: "script", label: "Go to script" };
  if (!IMAGE_BLOCKERS.has(blocker.code)) return undefined;
  const order = /image (\d+)/i.exec(blocker.message)?.[1];
  return { tab: "visuals", assetId: blocker.assetId, label: blocker.assetId && order ? `Go to image ${order}` : "Go to images" };
}
