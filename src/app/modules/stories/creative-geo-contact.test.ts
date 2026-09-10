import assert from "node:assert/strict";
import test from "node:test";
import { parseGeoContact, resolveGeoContact } from "./creative-geo-contact";
import { mentionFitsScope } from "./creative-documentary";

test("contact accepts email, allows clearing and rejects malformed/header input", () => {
  assert.equal(parseGeoContact(" brand@example.org "), "brand@example.org");
  assert.equal(parseGeoContact(undefined), "");
  assert.equal(parseGeoContact(""), "");
  for (const value of ["bad", "a@b", "a@b.com\r\nInjected: bad", 10]) assert.throws(() => parseGeoContact(value));
  assert.equal(resolveGeoContact("brand@example.org", "server@example.org"), "brand@example.org");
  assert.equal(resolveGeoContact("", "server@example.org"), "server@example.org");
  assert.equal(resolveGeoContact(), "");
});

test("scope tolerates accents/hyphens but not a different municipality", () => {
  const scope = { municipality: "Saint jean sur richelieu", region: "quebec", country: "canada", validatedLocationId: null };
  const mention = { name: "Musée", kind: "named" as const, role: "event" as const, excerpt: "Musée", municipality: "Saint-Jean-sur-Richelieu", region: "Québec", country: "Canada" };
  assert.equal(mentionFitsScope(mention, scope), true);
  assert.equal(mentionFitsScope({ ...mention, municipality: "Saint-Jean-de-Matha" }, scope), false);
});
