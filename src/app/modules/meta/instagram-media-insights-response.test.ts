import assert from "node:assert/strict";
import { test } from "node:test";

import { MetaGraphApiError } from "./meta-token-response";
import {
  computeMetricRatios,
  parseInstagramMediaInsights,
  unsupportedMetricFromGraphError,
} from "./instagram-media-insights-response";

const REQUESTED = ["reach", "likes", "saved", "shares", "comments"] as const;

test("maps returned metrics (both response shapes) and marks the rest unavailable", () => {
  const parsed = parseInstagramMediaInsights(
    {
      data: [
        {
          name: "reach",
          period: "lifetime",
          title: "Reach",
          total_value: { value: 1000 },
        },
        { name: "likes", period: "lifetime", total_value: { value: 0 } },
        // Classic time-series shape — the latest entry is the current total.
        {
          name: "shares",
          period: "lifetime",
          values: [
            { value: 4, end_time: "2026-09-01T07:00:00+0000" },
            { value: 12, end_time: "2026-09-06T07:00:00+0000" },
          ],
        },
      ],
    },
    REQUESTED,
  );

  assert.deepEqual(parsed.reach, {
    value: 1000,
    state: "ok",
    period: "lifetime",
    unit: "accounts",
  });
  // A real zero stays "ok" with value 0 — not "unavailable".
  assert.deepEqual(parsed.likes, {
    value: 0,
    state: "ok",
    period: "lifetime",
    unit: "count",
  });
  // `values[]` is read, not just `total_value`.
  assert.deepEqual(parsed.shares, {
    value: 12,
    state: "ok",
    period: "lifetime",
    unit: "count",
  });
  assert.equal(parsed.saved.state, "unavailable");
  assert.equal(parsed.saved.value, null);
  assert.equal(parsed.comments.state, "unavailable");
});

test("accepts an empty data set (every requested metric unavailable)", () => {
  const parsed = parseInstagramMediaInsights({ data: [] }, REQUESTED);
  for (const metric of REQUESTED) {
    assert.equal(parsed[metric].state, "unavailable");
  }
});

test("throws MetaGraphApiError(200) on a malformed envelope", () => {
  for (const bad of [undefined, null, "ok", 200, [], {}, { data: "x" }]) {
    assert.throws(
      () => parseInstagramMediaInsights(bad, REQUESTED),
      (error: unknown) =>
        error instanceof MetaGraphApiError && error.status === 200,
    );
  }
});

test("computeMetricRatios needs a real reach > 0 and real numerators", () => {
  const base = {
    reach: { value: 200, state: "ok" },
    saved: { value: 10, state: "ok" },
    shares: { value: 4, state: "ok" },
    comments: { value: 6, state: "ok" },
  };
  assert.deepEqual(computeMetricRatios(base), {
    savedPerReach: 0.05,
    sharesPerReach: 0.02,
    commentsPerReach: 0.03,
  });

  assert.equal(
    computeMetricRatios({ ...base, reach: { value: 0, state: "ok" } }),
    null,
  );
  assert.equal(
    computeMetricRatios({ ...base, reach: { value: 200, state: "error" } }),
    null,
  );
  assert.equal(computeMetricRatios(null), null);

  // A numerator that is not "ok" is simply omitted.
  assert.deepEqual(
    computeMetricRatios({
      reach: { value: 100, state: "ok" },
      saved: { value: 5, state: "ok" },
      shares: { value: null, state: "unavailable" },
      comments: { value: 2, state: "error" },
    }),
    { savedPerReach: 0.05 },
  );
});

test("unsupportedMetricFromGraphError names the offender, not an allowed alternative", () => {
  assert.equal(
    unsupportedMetricFromGraphError({
      error: {
        message:
          "(#100) The 'follows' metric is not supported for this media product type",
      },
    }),
    "follows",
  );
  // The allowed-metrics enumeration must not be mistaken for the offender.
  assert.equal(
    unsupportedMetricFromGraphError({
      error: {
        message:
          "(#100) The follows metric must be one of the following values: reach, views, likes, comments, saved, shares",
      },
    }),
    "follows",
  );
  // Only a name in `candidates` is returned.
  assert.equal(
    unsupportedMetricFromGraphError(
      { error: { message: "the follows metric is not supported" } },
      ["reach", "likes", "saved"],
    ),
    null,
  );
  assert.equal(
    unsupportedMetricFromGraphError({ error: { message: "Something broke" } }),
    null,
  );
  assert.equal(unsupportedMetricFromGraphError(undefined), null);
});
