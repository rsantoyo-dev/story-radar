import assert from "node:assert/strict";
import { test } from "node:test";

import { MetaGraphApiError } from "./meta-token-response";
import {
  computeMetricRatios,
  parseInstagramMediaInsights,
  unsupportedMetricFromGraphError,
} from "./instagram-media-insights-response";

const REQUESTED = ["reach", "likes", "saved", "shares", "comments"] as const;

test("maps returned metrics and marks the rest unavailable", () => {
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
  assert.equal(parsed.saved.state, "unavailable");
  assert.equal(parsed.saved.value, null);
  assert.equal(parsed.shares.state, "unavailable");
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

test("unsupportedMetricFromGraphError pulls the metric name out of a 400", () => {
  assert.equal(
    unsupportedMetricFromGraphError({
      error: {
        message:
          "(#100) The 'follows' metric is not supported for this media product type",
      },
    }),
    "follows",
  );
  assert.equal(
    unsupportedMetricFromGraphError({
      message: "metric[0] must be one of the following values: ... saved",
    }),
    "saved",
  );
  assert.equal(
    unsupportedMetricFromGraphError({ error: { message: "Something broke" } }),
    null,
  );
  assert.equal(unsupportedMetricFromGraphError(undefined), null);
});
