import assert from "node:assert/strict";
import test from "node:test";

import {
  describeLifecycleChanges,
  desiredLifecycleRules,
  mergeLifecycleRules,
  RETENTION_DAYS,
} from "./r2-lifecycle-rules.mjs";
import { R2_RETENTION_CLASSES, retentionPrefix } from "../src/app/modules/stories/r2-retention.ts";

test("every expiring retention class has a rule whose days match its name", () => {
  const expiring = R2_RETENTION_CLASSES.filter((retention) => retention !== "permanent");
  assert.deepEqual(Object.keys(RETENTION_DAYS).sort(), [...expiring].sort());
  for (const [retention, days] of Object.entries(RETENTION_DAYS)) {
    assert.equal(`${days}d`, retention);
  }
});

test("rules filter on the same prefixes the app writes to", () => {
  const rules = desiredLifecycleRules("/press-craftor/");
  assert.deepEqual(rules.map((rule) => [rule.Filter.Prefix, rule.Expiration.Days]), [
    [retentionPrefix("press-craftor", "7d"), 7],
    [retentionPrefix("press-craftor", "180d"), 180],
  ]);
  assert.ok(rules.every((rule) => rule.Status === "Enabled"));
  assert.ok(!rules.some((rule) => rule.Filter.Prefix.includes("permanent")));
});

test("merging keeps other rules and replaces a previous version of ours", () => {
  const foreign = { ID: "Default Multipart Abort Rule", Status: "Enabled", Filter: { Prefix: "" }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 } };
  const stale = { ID: "press-craftor-retention-7d", Status: "Enabled", Filter: { Prefix: "press-craftor/retention/7d/" }, Expiration: { Days: 3 } };
  const retired = { ID: "press-craftor-retention-30d", Status: "Enabled", Filter: { Prefix: "press-craftor/retention/30d/" }, Expiration: { Days: 30 } };
  const merged = mergeLifecycleRules([foreign, stale, retired], "press-craftor");
  assert.deepEqual(merged.map((rule) => rule.ID), [
    "Default Multipart Abort Rule",
    "press-craftor-retention-7d",
    "press-craftor-retention-180d",
  ]);
  assert.equal(merged[1].Expiration.Days, 7);
  assert.deepEqual(describeLifecycleChanges([foreign, stale, retired], "press-craftor"), [
    "update  press-craftor/retention/7d/ → delete after 7 days",
    "add     press-craftor/retention/180d/ → delete after 180 days",
    "remove  press-craftor-retention-30d",
  ]);
  assert.deepEqual(describeLifecycleChanges(merged, "press-craftor"), []);
});

test("a missing prefix is refused rather than expiring the whole bucket", () => {
  assert.throws(() => desiredLifecycleRules(""), /OBJECT_PREFIX/);
  assert.throws(() => desiredLifecycleRules("///"), /OBJECT_PREFIX/);
});
