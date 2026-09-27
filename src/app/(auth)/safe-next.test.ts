import assert from "node:assert/strict";
import { test } from "node:test";
import { safeNextPath } from "./safe-next";

test("Google callback targets only a local page", () => {
  assert.equal(safeNextPath("/topics?tab=story#new"), "/topics?tab=story#new");
  for (const path of [undefined, "", ["/", "//evil.test"], "/login", "/no-access", "/api/auth/sign-out", "https://evil.test", "//evil.test", "/\\evil.test", "/path\\other"]) {
    assert.equal(safeNextPath(path), "/");
  }
});
