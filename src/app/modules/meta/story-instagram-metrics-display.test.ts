import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const exports: { PostMetrics?: React.ComponentType<{ post: Record<string, unknown> }> } = {};
runInNewContext(ts.transpileModule(readFileSync("src/app/story-instagram-results.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, {
  exports,
  require: (name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name.endsWith(".css")) return { default: {} };
    throw Error(`Unexpected dependency: ${name}`);
  },
});
function render(overrides: Record<string, unknown>) {
  return renderToStaticMarkup(React.createElement(exports.PostMetrics!, { post: {
    metrics: { reach: { state: "ok", value: 120 } }, metricRatios: null,
    metricsError: null, metricsQueriedAt: "2026-09-01T12:00:00Z", metricsErroredAt: null,
    ...overrides,
  } }));
}
test("whole-request failure displays stored values with an outdated warning and both query timestamps", () => {
  const html = render({ metricsError: "Provider unavailable", metricsErroredAt: "2026-09-02T12:00:00Z" });
  assert.match(html, /Provider unavailable/);
  assert.match(html, /may be outdated/);
  assert.match(html, /120/);
  assert.match(html, /2026-09-01T12:00:00.000Z/);
  assert.match(html, /2026-09-02T12:00:00.000Z/);
});
test("failed first query shows an error instead of claiming metrics were never fetched", () => {
  const html = render({ metrics: null, metricsQueriedAt: null, metricsError: "Permission denied" });
  assert.match(html, /Permission denied/);
  assert.match(html, /No stored values/);
  assert.doesNotMatch(html, /No metrics fetched yet/);
});
test("successful query shows freshness without an error warning and preserves real zero", () => {
  const html = render({ metrics: { reach: { state: "ok", value: 0 } } });
  assert.match(html, /Last successful metrics query/);
  assert.match(html, />0</);
  assert.doesNotMatch(html, /may be outdated|refresh failed/);
});
