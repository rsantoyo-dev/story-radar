import assert from "node:assert/strict";
import test from "node:test";
import { parseGeoContact, resolveGeoContact, workspaceGeoContact } from "./creative-geo-contact";
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

test("a brand without a contact uses the one most of its workspace's brands saved", () => {
  assert.equal(workspaceGeoContact(["press@example.org", "", "me@example.org", "press@example.org"]), "press@example.org");
  assert.equal(workspaceGeoContact(["me@example.org", "press@example.org"]), "me@example.org", "a tie: the first given (the newest saved)");
  assert.equal(workspaceGeoContact(["", "not an email"]), undefined);
  assert.equal(workspaceGeoContact([]), undefined);
});

test("scope tolerates accents/hyphens but not a different municipality", () => {
  const scope = { municipality: "Saint jean sur richelieu", region: "quebec", country: "canada", validatedLocationId: null };
  const mention = { name: "Musée", kind: "named" as const, role: "event" as const, excerpt: "Musée", municipality: "Saint-Jean-sur-Richelieu", region: "Québec", country: "Canada" };
  assert.equal(mentionFitsScope(mention, scope), true);
  assert.equal(mentionFitsScope({ ...mention, municipality: "Saint-Jean-de-Matha" }, scope), false);
});
