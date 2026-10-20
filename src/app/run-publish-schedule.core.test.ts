import assert from "node:assert/strict";
import test from "node:test";
import { localInputValue, scheduleInputBounds, scheduleLabel } from "./run-publish-schedule.core";

test("the schedule field offers 10 minutes to 6 days ahead (an hour inside the server's limit) and suggests the next full hour at least an hour away", () => {
  const now = new Date(2026, 9, 19, 14, 20, 30);
  const bounds = scheduleInputBounds(now);
  assert.deepEqual(bounds, { min: "2026-10-19T14:30", max: "2026-10-25T13:20", suggested: "2026-10-19T16:00" });
  assert.equal(scheduleInputBounds(new Date(2026, 9, 19, 14, 0, 0)).suggested, "2026-10-19T15:00", "on the hour, an hour later");
  assert.equal(localInputValue(new Date(2026, 0, 5, 9, 7)), "2026-01-05T09:07");
  assert.match(scheduleLabel("2026-10-21T13:00:00.000Z", "America/Toronto"), /21.*9:00/u, "read in the brand's zone");
});
