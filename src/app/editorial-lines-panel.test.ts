import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";

import type { EditorialLineSelection } from "./editorial-lines-panel";

test("Discover search inherits the line period and preserves a one-run override while editing the focus", async () => {
  const localRequire = createRequire(import.meta.url);
  const previousCssLoader = localRequire.extensions[".css"];
  localRequire.extensions[".css"] = (module) => { module.exports = {}; };
  const { EditorialLinesPanel } = await import("./editorial-lines-panel");
  const dom = new JSDOM("<!doctype html><html><body><div id='app'></div></body></html>", { url: "http://localhost" });
  let aiResearchAvailable = true;
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Element: globalThis.Element,
    Node: globalThis.Node,
    fetch: globalThis.fetch,
    actEnvironment: (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async () => ({ ok: true, json: async () => ({
      lines: [{ id: "line-1", name: "Daily", objective: "Find useful updates", mode: "news", period: { kind: "relative", hours: 24 }, timezone: "America/Toronto", sourceMode: "inherit", sourceIds: [], excludedSourceIds: [], researchEnabled: true, archived: false }],
      sources: [], runs: [], researchDefaults: { enabled: aiResearchAvailable }, associations: [],
    }) }),
  });

  // Node >= 21 defines `navigator` as a read-only getter; Object.assign cannot replace it.
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });

  const selections: (EditorialLineSelection | undefined)[] = [];
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("app")!);
  try {
    await act(async () => { root.render(createElement(EditorialLinesPanel, { topicId: "topic-1", secret: "test-secret", onSelection: (value: EditorialLineSelection | undefined) => selections.push(value) })); });
    assert.deepEqual(selections.at(-1), { topicId: "topic-1", lineId: "line-1", query: "" });
    assert.match(dom.window.document.body.textContent ?? "", /From editorial line/);
    assert.match(dom.window.document.body.textContent ?? "", /Leave blank for the line's usual research/);

    const override = dom.window.document.querySelector<HTMLInputElement>("input[type='checkbox']")!;
    await act(async () => { override.click(); });
    assert.deepEqual(selections.at(-1)?.period, { kind: "relative", hours: 24 });

    const hours = dom.window.document.querySelector<HTMLInputElement>("input[type='number']")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(hours, "48");
      hours.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.deepEqual(selections.at(-1)?.period, { kind: "relative", hours: 48 });

    const focus = dom.window.document.querySelector<HTMLInputElement>("input[placeholder='e.g. What changed in local recycling rules this week?']")!;
    assert.ok(focus.getAttribute("aria-describedby"));
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(focus, "A new discovery");
      focus.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.equal(selections.at(-1)?.query, "A new discovery");
    assert.deepEqual(selections.at(-1)?.period, { kind: "relative", hours: 48 });

    await act(async () => { override.click(); });
    assert.equal(selections.at(-1)?.period, undefined);
    assert.equal(selections.at(-1)?.query, "A new discovery");

    aiResearchAvailable = false;
    await act(async () => { root.render(createElement(EditorialLinesPanel, { key: "ai-off", topicId: "topic-1", secret: "test-secret" })); });
    assert.equal(dom.window.document.querySelector("input[placeholder='e.g. What changed in local recycling rules this week?']"), null);
    assert.match(dom.window.document.body.textContent ?? "", /currently disabled/);
  } finally {
    await act(async () => { root.unmount(); });
    Object.assign(globalThis, previous);
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else delete (globalThis as { navigator?: unknown }).navigator;
    if (previousCssLoader) localRequire.extensions[".css"] = previousCssLoader;
    else delete localRequire.extensions[".css"];
    dom.window.close();
  }
});
