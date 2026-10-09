import assert from "node:assert/strict";
import test from "node:test";

import { auditComponent, auditStylesheet, regressions } from "./uxdsl-audit.mjs";

test("tokens and roles are aligned; literals that decide design are findings", () => {
  const aligned = auditStylesheet(`
    .card { @ds-surface(contained); padding: density(2); color: palette(primary-main); border-radius: radius(2); }
    .action { @ds-button(outlined primary 2); cursor: pointer; }
    .row { display: grid; gap: density(2) density(4); margin: 0; }
  `);
  assert.deepEqual(Object.values(aligned).filter(Boolean), []);

  const raw = auditStylesheet(`
    .chip { padding: 2px density(2); border: 1px solid palette(dark-main, 0.16); border-radius: 9px; background: #fff; cursor: pointer; font-size: 10px; font-weight: 800; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
    .chip:focus-visible { outline: 2px solid palette(primary-main); }
    .x { color: palette(dark-main) !important; }
  `);
  assert.equal(raw.spacing, 1);
  assert.equal(raw.border, 1);
  assert.equal(raw.radius, 1);
  assert.equal(raw.color, 1);
  assert.equal(raw.shadow, 1);
  assert.equal(raw.type, 2);
  assert.equal(raw.button, 1, "a clickable rule without a button role");
  assert.equal(raw.surface, 1, "background, border and radius without a surface role");
  assert.equal(raw.focus, 1);
  assert.equal(raw.important, 1);
});

test("a focus ring or a clickable rule built from tokens and roles is not a finding", () => {
  const counts = auditStylesheet(`
    .tab:focus-visible { outline: border(focus); outline-offset: space(1); }
    .row { cursor: pointer; }
    .avatar { background: palette(primary-main); border: 0; border-radius: radius(2); }
  `);
  assert.equal(counts.focus, 0);
  assert.equal(counts.button, 0, "a rule that only sets the cursor draws no button");
  assert.equal(counts.surface, 0, "no visible edge: not a hand-built container");
});

test("a documented exception is counted as such, not as findings", () => {
  const counts = auditStylesheet(".map { /* uxdsl-exception: provider map card keeps its printed look */ border-radius: 14px; box-shadow: 0 10px 28px rgba(0,0,0,.3); }");
  assert.equal(counts.exception, 1);
  assert.equal(counts.radius + counts.shadow, 0);
});

test("raw buttons are told apart from the shared primitive", () => {
  assert.deepEqual(auditComponent("<button type=\"button\">A</button><Button>B</Button><Button variant=\"primary\">C</Button>"), { rawButtons: 1, sharedButtons: 2 });
});

test("the check fails only when a count grows past the baseline", () => {
  const baseline = { stylesheets: { "a.uxdsl": { color: 2, spacing: 1 } }, components: { rawButtons: 10 } };
  const zero = { color: 0, spacing: 0, radius: 0, border: 0, shadow: 0, type: 0, focus: 0, button: 0, surface: 0, important: 0, exception: 0 };
  assert.deepEqual(regressions({ stylesheets: { "a.uxdsl": { ...zero, color: 1, spacing: 1 } }, components: { rawButtons: 9 } }, baseline), []);
  assert.deepEqual(regressions({ stylesheets: { "a.uxdsl": { ...zero, color: 3 } }, components: { rawButtons: 10 } }, baseline).map((item) => item.category), ["color"]);
  assert.deepEqual(regressions({ stylesheets: { "b.uxdsl": { ...zero, type: 1 } }, components: { rawButtons: 11 } }, baseline).map((item) => `${item.file}:${item.category}`), ["b.uxdsl:type", "src/**/*.tsx:rawButtons"]);
});
