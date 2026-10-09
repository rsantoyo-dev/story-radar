import assert from "node:assert/strict";
import test from "node:test";

import { providerAddressMatchesStated, statedStreetAddresses } from "./place-address-check";

test("civic addresses are read in French, English and Spanish order", () => {
  assert.deepEqual(statedStreetAddresses("Lieu : Centre d’art du Domaine Trinity, 360, rue McGinnis, secteur Iberville."), [{ number: "360", words: ["mcginnis"] }]);
  assert.deepEqual(statedStreetAddresses("Lieu : Théâtre des Deux Rives, 30, boulevard du Séminaire Nord."), [{ number: "30", words: ["seminaire"] }]);
  assert.deepEqual(statedStreetAddresses("Paramount Theatre, 713 Congress Avenue."), [{ number: "713", words: ["congress"] }]);
  assert.deepEqual(statedStreetAddresses("En el 12 calle Mayor."), [{ number: "12", words: ["mayor"] }]);
  // Dates, times and prices are not addresses.
  assert.deepEqual(statedStreetAddresses("Dimanche 11 octobre 2026, de 10 h 30 à 11 h 30, 22 $."), []);
});

test("a provider address must carry the stated number and street", () => {
  const facts = "Date : dimanche 11 octobre 2026. Lieu : Centre d’art du Domaine Trinity, 360, rue McGinnis, secteur Iberville.";
  assert.equal(providerAddressMatchesStated(facts, "360 Rue McGinnis, Saint-Jean-sur-Richelieu, QC J2X 3H6, Canada"), true);
  assert.equal(providerAddressMatchesStated(facts, "182 Rue Jacques-Cartier N, Saint-Jean-sur-Richelieu, QC"), false, "another street");
  assert.equal(providerAddressMatchesStated(facts, "36 Rue McGinnis, Saint-Jean-sur-Richelieu, QC"), false, "another number");
  assert.equal(providerAddressMatchesStated("Lieu : Musée du Haut-Richelieu, 182, rue Jacques-Cartier Nord.", "182 Rue Jacques-Cartier N, Saint-Jean-sur-Richelieu, QC J3B 6Z1"), true);
  // Nothing stated: the provider's name and scope match stands alone.
  assert.equal(providerAddressMatchesStated("Dimanche matin, le Domaine Trinity accueille un spectacle.", "360 Rue McGinnis"), undefined);
});
