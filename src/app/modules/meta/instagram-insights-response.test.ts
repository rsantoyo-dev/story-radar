import assert from "node:assert/strict";
import { test } from "node:test";

import { assertInstagramInsightsShape } from "./instagram-insights-response";
import { MetaGraphApiError } from "./meta-token-response";

test("accepts a well-formed total_value insights payload", () => {
  assert.doesNotThrow(() =>
    assertInstagramInsightsShape({
      data: [
        {
          name: "reach",
          period: "day",
          title: "Reach",
          total_value: { value: 0 },
          id: "abc/insights/reach/day",
        },
      ],
    }),
  );
});

test("rejects an empty or missing body", () => {
  for (const bad of [undefined, null, "", "ok", 200, [], {}]) {
    assert.throws(() => assertInstagramInsightsShape(bad), MetaGraphApiError);
  }
});

test("rejects data that is empty or not an array", () => {
  assert.throws(() => assertInstagramInsightsShape({ data: [] }), MetaGraphApiError);
  assert.throws(
    () => assertInstagramInsightsShape({ data: "reach" }),
    MetaGraphApiError,
  );
});

test("rejects a data entry without a metric name", () => {
  assert.throws(
    () => assertInstagramInsightsShape({ data: [{ period: "day" }] }),
    MetaGraphApiError,
  );
});

test("the thrown error carries status 200 and the raw payload", () => {
  try {
    assertInstagramInsightsShape({ nope: true });
    assert.fail("expected a throw");
  } catch (error) {
    assert.ok(error instanceof MetaGraphApiError);
    assert.equal(error.status, 200);
    assert.deepEqual(error.graphError, { nope: true });
  }
});
