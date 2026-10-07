import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, useState } from "react";

import { ModalLayer } from "./modal-layer";

test("modal contains keyboard focus, inerts the page, and returns focus on Escape", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='app'></div></body></html>", { url: "http://localhost" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    getComputedStyle: globalThis.getComputedStyle,
    actEnvironment: (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  // Node >= 21 defines `navigator` as a read-only getter; Object.assign cannot replace it.
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
  const rects = dom.window.HTMLElement.prototype.getClientRects;
  dom.window.HTMLElement.prototype.getClientRects = function () { return [this.getBoundingClientRect()] as unknown as DOMRectList; };

  function Fixture() {
    const [open, setOpen] = useState(false);
    return <div>
      <button id="trigger" onClick={() => setOpen(true)}>Open</button>
      {open && <ModalLayer onClose={() => setOpen(false)}>
        <section role="dialog" aria-modal="true" aria-label="Fixture">
          <button id="first">First</button>
          <input id="initial" data-initial-focus />
          <button id="last">Last</button>
        </section>
      </ModalLayer>}
    </div>;
  }

  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("app")!);
  try {
    await act(async () => { root.render(<Fixture />); });
    const trigger = dom.window.document.getElementById("trigger") as HTMLButtonElement;
    trigger.focus();
    await act(async () => { trigger.click(); });
    assert.equal(dom.window.document.activeElement?.id, "initial");
    assert.equal((dom.window.document.getElementById("app") as HTMLElement).inert, true);

    const last = dom.window.document.getElementById("last") as HTMLButtonElement;
    last.focus();
    await act(async () => {
      dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    });
    assert.equal(dom.window.document.activeElement?.id, "first");

    await act(async () => {
      dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    assert.equal(dom.window.document.querySelector("[role=dialog]"), null);
    assert.equal(dom.window.document.activeElement, trigger);
    assert.notEqual((dom.window.document.getElementById("app") as HTMLElement).inert, true);
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.HTMLElement.prototype.getClientRects = rects;
    Object.assign(globalThis, previous);
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else delete (globalThis as { navigator?: unknown }).navigator;
    dom.window.close();
  }
});
