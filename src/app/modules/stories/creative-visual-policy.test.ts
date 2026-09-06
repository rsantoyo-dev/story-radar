import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isVisualPolicySnapshotStale,
  readSnapshotPolicyVersion,
} from "./creative-visual-policy";

test("a legacy snapshot with no policy version reads as 1", () => {
  assert.equal(readSnapshotPolicyVersion({ platform: "Instagram" }), 1);
  assert.equal(readSnapshotPolicyVersion(null), 1);
  assert.equal(readSnapshotPolicyVersion(undefined), 1);
});

test("a captured integer policy version is read back", () => {
  assert.equal(readSnapshotPolicyVersion({ visualPolicyVersion: 4 }), 4);
});

test("non-integer or below-range policy versions fall back to 1", () => {
  assert.equal(readSnapshotPolicyVersion({ visualPolicyVersion: 0 }), 1);
  assert.equal(readSnapshotPolicyVersion({ visualPolicyVersion: 2.5 }), 1);
  assert.equal(readSnapshotPolicyVersion({ visualPolicyVersion: "3" }), 1);
});

test("a snapshot is stale only when its version is below the current one", () => {
  assert.equal(isVisualPolicySnapshotStale({ visualPolicyVersion: 1 }, 2), true);
  assert.equal(isVisualPolicySnapshotStale({}, 2), true); // legacy -> 1 < 2
  assert.equal(isVisualPolicySnapshotStale({ visualPolicyVersion: 2 }, 2), false);
  assert.equal(isVisualPolicySnapshotStale({ visualPolicyVersion: 3 }, 2), false);
});
