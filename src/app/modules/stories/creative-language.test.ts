import assert from "node:assert/strict";
import test from "node:test";
import { foreignSentenceLanguage, localizedText, localizedTextOrDefault, resolveProfileLanguage } from "./creative-language";

test("resolves codes, names and loose labels for the three supported languages", () => {
  for (const [input, expected] of [
    ["fr", "fr"], ["fr-CA", "fr"], ["French", "fr"], ["Français", "fr"], ["francais (Québec)", "fr"],
    ["es", "es"], ["Spanish", "es"], ["Español", "es"], ["Spanish (Latin America)", "es"],
    ["en", "en"], ["English", "en"], ["en-US", "en"],
    ["de", "other"], ["Deutsch", "other"], ["", "other"], [undefined, "other"],
  ] as const) {
    assert.equal(resolveProfileLanguage(input), expected, String(input));
  }
});

test("repair text follows the profile language and never invents English for an uncovered one", () => {
  assert.equal(localizedText("Français", "fallback.summary"), "Résumé de l’information appuyée par la source.");
  assert.equal(localizedText("es", "estimate.about"), "aproximadamente");
  assert.equal(localizedText("en", "closing.headline.takeaway"), "The takeaway");
  assert.equal(localizedText("Deutsch", "fallback.summary"), undefined);
  assert.equal(localizedTextOrDefault("Deutsch", "fallback.summary"), "A summary of information supported by the source.");
});

test("flags a full sentence in another supported language, not a loanword or a brand", () => {
  const french = "Lors de leurs visites près des écoles, les élus offrent un sent-bon aux automobilistes prudents.";
  assert.equal(foreignSentenceLanguage("Français", french), undefined);
  assert.equal(foreignSentenceLanguage("Français", "This is the key point established by the source."), "en");
  assert.equal(foreignSentenceLanguage("Français", "Le marketing digital de Salut Brossard reste un outil local."), undefined);
  assert.equal(foreignSentenceLanguage("es", french), "fr");
  assert.equal(foreignSentenceLanguage("Spanish", "Los brigadiers y las familias son parte del plan para la escuela."), undefined);
  assert.equal(foreignSentenceLanguage("English", "Les élus offrent un sent-bon aux automobilistes qui sont prudents près des écoles."), "fr");
  // An uncovered profile language cannot judge foreign copy.
  assert.equal(foreignSentenceLanguage("Deutsch", "This is the key point established by the source."), undefined);
});
