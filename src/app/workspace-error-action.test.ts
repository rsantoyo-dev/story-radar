import assert from "node:assert/strict";
import test from "node:test";

import { workspaceErrorAction } from "./workspace-error-action";

// Verbatim server messages (manage-creative-content.ts, manage-creative-assets.ts, resolve-brand-generation.ts).
test("concurrency conflicts offer a reload", () => {
  for (const message of [
    "The draft changed. Reload before saving.",
    "The draft changed. Reload before recovering it.",
    "The draft changed. Reload before updating this image.",
    "This recovery is still running. Reload to retrieve its checkpoint; a stopped worker can be resumed after 10 minutes.",
  ]) assert.equal(workspaceErrorAction(message)?.kind, "reload", message);
});

test("stale inputs send the editor to Focus, where the brief is refreshed", () => {
  for (const message of [
    "The story was edited. Refresh the brief and draft before approving or generating images.",
    "The story content or creative profile changed. Refresh the creative brief before generating a draft.",
  ]) assert.deepEqual(workspaceErrorAction(message), { kind: "tab", tab: "focus", label: "Go to Focus to refresh the brief" }, message);
});

test("a changed brand reference offers the reference refresh", () => {
  assert.equal(workspaceErrorAction("A selected brand reference changed or cannot be sent. Use 'Refresh references' on the draft to pick up the current brand library.")?.kind, "refresh-references");
});

test("approval and image order messages open the right tab", () => {
  assert.deepEqual(workspaceErrorAction("Approve the current script before generating or reviewing images."), { kind: "tab", tab: "script", label: "Go to Script" });
  assert.equal(workspaceErrorAction("Update the pending images to match the saved text before approving this draft.")?.kind, "tab");
});

test("an unrelated failure offers no action", () => {
  assert.equal(workspaceErrorAction("Request failed with 500"), undefined);
});
