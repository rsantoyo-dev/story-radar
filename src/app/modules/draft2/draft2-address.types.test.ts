import assert from "node:assert/strict";
import test from "node:test";
import { addressBreaches, addressBrief, addressFinding, addressForm, addressLanguage } from "./draft2-address.types";

const informalFrench = { address: "informal" as const, language: "French" };

test("an informal French post never says vous, votre, vos or an imperative in -ez; quotations are someone else's", () => {
  assert.deepEqual(addressBreaches("Pour vos sorties, retenez la date.\nSuis Salut Brossard pour chaque décision.", informalFrench), ["vos", "retenez"], "the slide the auditor found: both forms");
  assert.deepEqual(addressBreaches("Retenez la date. Chez Salut Brossard, assez de détails.", informalFrench), ["retenez"], "an imperative at a sentence's start; chez and assez are not verbs");
  assert.deepEqual(addressBreaches("Selon Rodriguez, le bar ferme. Le maire dit « Vous êtes chez vous ».", informalFrench), [], "a name in -ez inside a sentence and a quotation are not the publication's words");
  assert.deepEqual(addressBreaches("Découvre ton quartier, toi qui sors le soir.", informalFrench), []);
  assert.deepEqual(addressBreaches("Découvre ton quartier et ta ville.", { address: "formal", language: "français" }), ["ta"], "a formal post never says tu; ton can be a noun, it is left out");
  assert.deepEqual(addressBreaches("T'as vu? Tu sors ce soir.", { address: "formal", language: "fr" }), ["t'", "tu"]);
});

test("Spanish keeps tú or usted the same way; a language without the distinction has no breach", () => {
  assert.deepEqual(addressBreaches("Si usted vive en Toronto, revisa tu permiso.", { language: "Spanish" }), ["usted"], "informal by default");
  assert.deepEqual(addressBreaches("Revise su permiso; te avisamos.", { address: "formal", language: "español" }), ["te"]);
  assert.deepEqual(addressBreaches("Save the date, follow us.", { language: "English" }), []);
  assert.deepEqual(addressBreaches("Pour vos sorties", undefined), [], "no publication, no rule");
  assert.equal(addressLanguage("Japanese"), undefined);
});

test("the finding and the brief name the publication's form", () => {
  assert.equal(addressForm(informalFrench), "tu");
  assert.equal(addressForm({ address: "formal", language: "Spanish" }), "usted");
  assert.equal(addressFinding(["vos", "retenez"], informalFrench), "The publication addresses its reader as \"tu\" on every slide, in the call to action and in the caption: \"vos\", \"retenez\" are the other form.");
  assert.match(addressBrief(informalFrench) ?? "", /^- Address the reader as "tu"/);
  assert.match(addressBrief({ address: "formal", language: "French" }) ?? "", /never "tu"/);
  assert.equal(addressBrief({ language: "English" }), undefined);
});
