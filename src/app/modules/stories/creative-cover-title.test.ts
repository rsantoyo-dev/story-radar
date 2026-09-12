import assert from "node:assert/strict";
import test from "node:test";
import { enforceCoverTitle } from "./creative-cover-title";
import type { GeneratedCreativeDraft } from "./creative-content.types";
const draft = { units: [{ headline: "¿Dos cocinas en un plato?", subheadline: "Desliza" }, { headline: "Paso uno" }] } as GeneratedCreativeDraft;
test("cover name stays separate from hook and does not alter middle slides", () => {
 const result = enforceCoverTitle(draft, true, "Poutine de papa criolla con sobrebarriga");
 assert.equal(result.units[0].headline, draft.units[0].headline);
 assert.equal(result.units[0].subheadline, "Poutine de papa criolla con sobrebarriga");
 assert.equal(result.units[1], draft.units[1]);
 assert.equal(draft.units[0].subheadline, "Desliza");
});
test("legacy profiles are unchanged and an edited name can be restored after repair", () => {
 assert.equal(enforceCoverTitle(draft, undefined, "Name"), draft);
 assert.equal(enforceCoverTitle(draft, false, "Name"), draft);
 assert.equal(enforceCoverTitle(draft, true, "Nombre editado").units[0].subheadline, "Nombre editado");
});
