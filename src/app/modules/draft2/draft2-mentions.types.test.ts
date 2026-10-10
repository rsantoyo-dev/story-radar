import assert from "node:assert/strict";
import test from "node:test";
import { Draft2InputError, Draft2ResponseError } from "./draft2-facts.types";
import {
  carriedMentions, confirmedMentions, decidedMention, mentionEntities, mentionMatch, numberedMentions, parseMentionCandidates, parseMentionsAction, sameMentions,
  MENTION_MAX_CANDIDATES, type Draft2MentionAccount,
} from "./draft2-mentions.types";
import type { Draft2InventoryEntity } from "./draft2-inventory.types";

const entity = (id: string, name: string, kind: Draft2InventoryEntity["kind"], role: Draft2InventoryEntity["role"] = "subject"): Draft2InventoryEntity =>
  ({ id, name, kind, role, description: "", factIds: ["f1"] }) as Draft2InventoryEntity;
const ENTITIES = [entity("e1", "Bibliothèques de Longueuil", "organization"), entity("e2", "Catherine Fournier", "person"), entity("e3", "Pomerleau", "organization", "mentioned"), entity("e4", "A passer-by", "person", "mentioned")];
const account = (id: string, handle: string, status: Draft2MentionAccount["status"], extra: Partial<Draft2MentionAccount> = {}): Draft2MentionAccount =>
  ({ id, entityId: "e1", name: "Bibliothèques de Longueuil", handle, source: "claude", status, ...extra });
const FOUND = { username: "biblio.longueuil", name: "Bibliothèques de Longueuil" };

test("the accounts are those of the people, places and organizations; a person the story only mentions is never tagged", () => {
  assert.deepEqual(mentionEntities({ entities: ENTITIES }).map((candidate) => candidate.id), ["e1", "e2", "e3"]);
  assert.deepEqual(mentionEntities(undefined), []);
});

test("Claude's candidates: a known entity, a well-formed username without the @ and in lowercase, at most two per entity, each once", () => {
  const answer = JSON.stringify({ accounts: [
    { entityId: "e1", handle: "@Biblio.Longueuil" },
    { entityId: "e1", handle: "biblio.longueuil" },
    { entityId: "e1", handle: "longueuil_biblio" },
    { entityId: "e1", handle: "third.try" },
    { entityId: "e9", handle: "nobody" },
    { entityId: "e2", handle: "catherine fournier" },
    { entityId: "e2", handle: "x".repeat(31) },
    { entityId: "e2", handle: "cfournier" },
  ] });
  assert.equal(JSON.stringify(parseMentionCandidates(answer, ENTITIES)), JSON.stringify([
    { entityId: "e1", handle: "biblio.longueuil" }, { entityId: "e1", handle: "longueuil_biblio" }, { entityId: "e2", handle: "cfournier" },
  ]));
  const many = JSON.stringify({ accounts: Array.from({ length: 20 }, (_, index) => ({ entityId: `e${(index % 3) + 1}`, handle: `h${index}` })) });
  assert.ok(parseMentionCandidates(many, ENTITIES).length <= MENTION_MAX_CANDIDATES);
  assert.throws(() => parseMentionCandidates("{", ENTITIES), Draft2ResponseError);
  assert.throws(() => parseMentionCandidates("{}", ENTITIES), Draft2ResponseError);
});

test("Instagram's account is a strong match when its name is the entity's, and weak otherwise", () => {
  assert.equal(mentionMatch("Bibliothèques de Longueuil", FOUND), "strong");
  assert.equal(mentionMatch("Catherine Fournier", { username: "cfournier", name: "Catherine Fournier · Mairesse" }), "strong");
  assert.equal(mentionMatch("Ville de Longueuil", { username: "longueuil.biblio", name: "Bibliothèques" }), "weak");
});

test("a new search keeps every decision the editor made and every account they added", () => {
  const accounts = [account("m1", "a", "verified"), account("m2", "b", "confirmed"), account("m3", "c", "rejected"), account("m4", "d", "not-found"), account("m5", "e", "unavailable", { source: "editor" })];
  assert.deepEqual(carriedMentions({ status: "ready", version: 3, accounts, lookup: "instagram-page" }).map((kept) => kept.handle), ["b", "c", "e"]);
  assert.deepEqual(numberedMentions(carriedMentions({ status: "ready", version: 3, accounts, lookup: "instagram-page" })).map((kept) => kept.id), ["m1", "m2", "m3"]);
});

test("the editor's decisions as a contract", () => {
  assert.equal(JSON.stringify(parseMentionsAction({ action: "add", handle: " @Biblio.Longueuil ", name: "  Bibliothèques   de Longueuil ", entityId: "e1" })), JSON.stringify({ action: "add", handle: "biblio.longueuil", name: "Bibliothèques de Longueuil", entityId: "e1" }));
  assert.equal(JSON.stringify(parseMentionsAction({ action: "add", handle: "x", name: "X", entityId: "m1" })), JSON.stringify({ action: "add", handle: "x", name: "X" }), "an id that is not an entity's is dropped");
  assert.equal(JSON.stringify(parseMentionsAction({ action: "reject", accountId: "m2" })), JSON.stringify({ action: "reject", accountId: "m2" }));
  assert.throws(() => parseMentionsAction({ action: "add", handle: "two words", name: "X" }), Draft2InputError);
  assert.throws(() => parseMentionsAction({ action: "add", handle: "fine", name: " " }), /Say who the account is/);
  assert.throws(() => parseMentionsAction({ action: "confirm", accountId: "e1" }), /accountId/);
  assert.throws(() => parseMentionsAction({ action: "tag", accountId: "m1" }), /confirm, reject, reopen or add/);
});

test("only an account Instagram verified can be tagged; taking a decision back returns what Instagram said", () => {
  assert.equal(decidedMention(account("m1", "biblio.longueuil", "verified", { account: FOUND }), "confirm").status, "confirmed");
  assert.equal(decidedMention(account("m1", "biblio.longueuil", "rejected", { account: FOUND }), "confirm").status, "confirmed", "set aside, then tagged after all");
  assert.throws(() => decidedMention(account("m1", "nobody", "not-found"), "confirm"), /was not verified on Instagram/);
  assert.throws(() => decidedMention(account("m1", "unchecked", "unavailable"), "confirm"), /was not verified on Instagram/);
  assert.equal(decidedMention(account("m1", "biblio.longueuil", "confirmed", { account: FOUND }), "reject").status, "rejected");
  assert.equal(decidedMention(account("m1", "biblio.longueuil", "confirmed", { account: FOUND }), "reopen").status, "verified");
  assert.equal(decidedMention(account("m1", "nobody", "rejected"), "reopen").status, "not-found");
  assert.equal(decidedMention(account("m1", "unchecked", "unavailable"), "reopen").status, "unavailable");
});

test("the caption tags the confirmed accounts, by Instagram's username, and the same accounts in any order are the same", () => {
  const mentions = { accounts: [account("m1", "Biblio.Longueuil", "confirmed", { account: FOUND }), account("m2", "other", "verified", { account: { username: "other", name: "Other" } }), account("m3", "cfournier", "confirmed", { name: "Catherine Fournier", account: { username: "cfournier", name: "Catherine Fournier" } })] };
  const tagged = confirmedMentions(mentions);
  assert.equal(JSON.stringify(tagged), JSON.stringify([{ name: "Bibliothèques de Longueuil", handle: "@biblio.longueuil" }, { name: "Catherine Fournier", handle: "@cfournier" }]));
  assert.ok(sameMentions(tagged, [...tagged].reverse()));
  assert.ok(sameMentions([], undefined));
  assert.ok(!sameMentions(tagged, tagged.slice(1)));
  assert.ok(!sameMentions(tagged, [{ ...tagged[0], name: "Someone else" }, tagged[1]]));
});
