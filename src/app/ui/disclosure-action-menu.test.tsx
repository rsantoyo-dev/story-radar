import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";

import { DisclosureActionMenu } from "./disclosure-action-menu";

test("creation disclosure uses native expansion and closes predictably for keyboard, action, and outside focus", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='app'></div><button id='outside'>Outside</button></body></html>", { url: "http://localhost" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Element: globalThis.Element,
    Node: globalThis.Node,
    navigator: globalThis.navigator,
    actEnvironment: (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    navigator: dom.window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  let activations = 0;
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("app")!);
  try {
    await act(async () => {
      root.render(<DisclosureActionMenu label="More creation actions">
        <button id="add-source" type="button" onClick={() => activations++}>Add source</button>
        <a href="#topics">Manage Topics</a>
      </DisclosureActionMenu>);
    });
    const details = dom.window.document.querySelector("details")!;
    const summary = details.querySelector("summary")!;
    const action = dom.window.document.getElementById("add-source") as HTMLButtonElement;
    const outside = dom.window.document.getElementById("outside") as HTMLButtonElement;

    assert.equal(summary.getAttribute("aria-label"), "More creation actions");
    assert.equal(summary.querySelector("svg")?.getAttribute("aria-hidden"), "true");
    assert.equal(details.open, false);
    await act(async () => { summary.click(); });
    assert.equal(details.open, true);

    action.focus();
    await act(async () => {
      action.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    assert.equal(details.open, false);
    assert.equal(dom.window.document.activeElement, summary);

    await act(async () => { summary.click(); action.click(); });
    assert.equal(activations, 1);
    assert.equal(details.open, false);
    assert.equal(dom.window.document.activeElement, summary);

    const link = details.querySelector("a")!;
    await act(async () => { summary.click(); link.focus(); link.click(); });
    assert.equal(details.open, false);
    assert.equal(dom.window.document.activeElement, link);

    await act(async () => { summary.click(); outside.focus(); });
    assert.equal(details.open, false);

    await act(async () => {
      summary.click();
      outside.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true }));
    });
    assert.equal(details.open, false);

    const panel = details.querySelector<HTMLDivElement>("div")!;
    let bounds = { left: -12, right: 168 };
    Object.defineProperty(panel, "getBoundingClientRect", { value: () => bounds });
    Object.defineProperty(dom.window, "innerWidth", { configurable: true, value: 390 });
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new dom.window.Event("toggle"));
    });
    assert.equal(panel.style.transform, "translateX(20px)");
    bounds = { left: 300, right: 480 };
    await act(async () => { dom.window.dispatchEvent(new dom.window.Event("resize")); });
    assert.equal(panel.style.transform, "translateX(-98px)");
  } finally {
    await act(async () => { root.unmount(); });
    Object.assign(globalThis, previous);
    dom.window.close();
  }
});
