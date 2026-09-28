import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidTimeZone, periodError, splitPeriodEndpoint, updatePeriodDateTime, updatePeriodOffset } from "./editorial-period-controls";

test("an exact period preserves its custom UTC offset while changing local time", () => {
  const current = "2026-09-28T12:30:00+05:45";
  assert.deepEqual(splitPeriodEndpoint(current), { dateTime: "2026-09-28T12:30:00", offset: "+05:45" });
  const changed = updatePeriodDateTime(current, "2026-09-29T09:15");
  assert.equal(changed, "2026-09-29T09:15:00+05:45");
  assert.equal(updatePeriodOffset(changed, "-04:00"), "2026-09-29T09:15:00-04:00");
});

test("partial custom offsets stay editable and invalid ranges cannot be saved", () => {
  const partial = updatePeriodOffset("2026-09-28T12:30:00Z", "+05:");
  assert.deepEqual(splitPeriodEndpoint(partial), { dateTime: "2026-09-28T12:30:00", offset: "+05:" });
  assert.match(periodError({ kind: "range", from: partial, to: "2026-09-29T12:30:00Z" }), /valid UTC offset/);
  assert.match(periodError({ kind: "range", from: "2026-09-29T12:30:00Z", to: "2026-09-28T12:30:00Z" }), /end must be after/);
  assert.equal(periodError({ kind: "range", from: "2026-09-28T12:30:00+05:45", to: "2026-09-29T12:30:00+05:45" }), "");
});

test("time zones accept IANA custom values and reject unknown values", () => {
  assert.equal(isValidTimeZone("America/Toronto"), true);
  assert.equal(isValidTimeZone("Asia/Kathmandu"), true);
  assert.equal(isValidTimeZone("not-a-zone"), false);
});
