import assert from "node:assert/strict";
import test from "node:test";
import * as types from "./draft2-facts.types";
import * as funnel from "./draft2-funnel";
import * as mentionsTypes from "./draft2-mentions.types";
import * as openingTypes from "./draft2-opening.types";
import * as skills from "./skills/draft2-skills";
import { loadInSandbox } from "./draft2-test-sandbox";
import type { Draft2Mentions } from "./draft2-mentions.types";

const topicId = "11111111-1111-4111-8111-111111111111";
const storyId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";

const facts: types.Draft2Fact[] = [
  { id: "f1", claim: "Mayor Catherine Fournier opened the new library on Rue Saint-Charles.", evidence: "Mayor Catherine Fournier opened the new library", kind: "event", status: "established", importance: 90 },
  { id: "f2", claim: "The library was built by Pomerleau.", evidence: "built by Pomerleau", kind: "name", status: "established", importance: 60 },
];
const ENTITIES = [
  { id: "e1", name: "Catherine Fournier", kind: "person", role: "subject", description: "Longueuil's mayor", factIds: ["f1"] },
  { id: "e2", name: "Bibliothèques de Longueuil", kind: "organization", role: "secondary", description: "The library network", factIds: ["f1"] },
  { id: "e3", name: "A reader", kind: "person", role: "mentioned", description: "", factIds: ["f1"] },
];
const INVENTORY = { status: "ready", version: 2, entities: ENTITIES, storyPhotos: [], roster: [], characters: "auto" };
const profile = { name: "Salut Longueuil", language: "French", region: "Longueuil", platform: "Instagram", audience: "Residents", brandPersonality: [], formality: 30, humor: 40, energy: 60, optimism: 60, provocation: 30 };
/** What Instagram knows: professional accounts by username. */
const INSTAGRAM: Record<string, { username: string; name: string; followers?: number }> = {
  "cfournier": { username: "cfournier", name: "Catherine Fournier", followers: 5200 },
  "biblio.longueuil": { username: "biblio.longueuil", name: "Bibliothèques Longueuil" },
  "longueuil.ville": { username: "longueuil.ville", name: "Ville de Longueuil" },
};

type Row = Record<string, unknown> & { mentions: Draft2Mentions | null; trace: types.Draft2TraceEntry[]; updatedAt: Date };

function harness({ session, proposed = [], page = true, refuseAfter }: {
  session?: Record<string, unknown>;
  /** Claude's candidates. */
  proposed?: { entityId: string; handle: string }[];
  /** Whether the Topic's Facebook Page links an Instagram account. */
  page?: boolean;
  /** Instagram refuses every lookup after this many. */
  refuseAfter?: number;
} = {}) {
  const calls: { claude: Record<string, unknown>[]; lookups: { account: string; token: string; username: string }[] } = { claude: [], lookups: [] };
  let row: Row = { id: sessionId, topicId, storyId, step: "inventory", status: "ready", facts, inventory: INVENTORY, mentions: null, error: null, trace: [], updatedAt: new Date(), ...session };
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "./draft2-facts.types": types,
    "./draft2-funnel": funnel,
    "./draft2-mentions.types": mentionsTypes,
    "./draft2-opening.types": openingTypes,
    "./skills/draft2-skills": skills,
    "./draft2-dev-trace": { draft2DevTrace: () => undefined },
    "../stories/creative-text-meter": { withCreativeTextBudget: async (_context: unknown, work: () => Promise<unknown>) => work() },
    "../stories/anthropic.config": { getAnthropicRuntimeConfig: () => ({ apiKey: "k", model: "claude-sonnet-5-5" }), requireAnthropicApiKey: () => "k" },
    "../stories/creative-profile.repository": { getCreativeProfile: async () => profile },
    "../stories/anthropic-structured-response": {
      generateAnthropicStructuredResponse: async (input: Record<string, unknown>) => {
        calls.claude.push(input);
        return { text: JSON.stringify({ accounts: proposed }), usage: { promptTokens: 100, outputTokens: 40, thoughtsTokens: 0, totalTokens: 140 }, cachedInputTokens: 0 };
      },
    },
    "../meta/publication-channel-connections": {
      getChannelSendCredentials: async (topic: string, channel: string) => page && topic === topicId && channel === "instagram-page" ? { accountId: "17841400000000", accessToken: "page-token", pageId: "p1", connectionVersion: "v1" } : undefined,
    },
    "../meta/meta-graph-client": {
      fetchInstagramBusinessDiscovery: async (account: string, token: string, username: string) => {
        calls.lookups.push({ account, token, username });
        if (refuseAfter !== undefined && calls.lookups.length > refuseAfter) throw new Error("(#10) Application does not have permission for this action");
        return INSTAGRAM[username];
      },
    },
    "./draft2-session.repository": {
      activeDraft2Session: async () => undefined,
      getDraft2Session: async (topic: string, id: string) => topic === topicId && id === row.id ? row : undefined,
      claimDraft2Session: async (_id: string, patch: Record<string, unknown>) => { row = { ...row, ...patch, status: "running" }; return row; },
      updateDraft2Session: async (_id: string, patch: Record<string, unknown>) => { row = { ...row, ...patch, updatedAt: new Date() }; return row; },
      touchDraft2Session: async () => undefined,
    },
  };
  const exports = loadInSandbox("./draft2-mentions.ts", mocks, { Date, setTimeout, clearTimeout }) as Record<string, (input: Record<string, unknown>) => Promise<Row>>;
  return {
    find: () => exports.findDraft2Mentions({ topicId, storyId, sessionId }),
    edit: (input: Record<string, unknown>) => exports.editDraft2Mentions({ topicId, sessionId, input }),
    calls,
    row: () => row,
  };
}

const json = (value: unknown) => JSON.stringify(value);
const summary = (mentions: Draft2Mentions | null) => (mentions?.accounts ?? []).map((account) => [account.id, account.handle, account.status, account.match ?? null]);

test("Claude proposes usernames for the story's people, places and organizations, and Instagram checks each through the Topic's Page", async () => {
  const h = harness({ proposed: [{ entityId: "e1", handle: "@CFournier" }, { entityId: "e2", handle: "biblio.longueuil" }, { entityId: "e2", handle: "biblio_longueuil" }, { entityId: "e3", handle: "a.reader" }] });
  const session = await h.find();
  const contents = h.calls.claude[0].contents as { task: string; entities: { id: string }[] };
  assert.equal(json([contents.task, contents.entities.map((entity) => entity.id)]), json(["accounts", ["e1", "e2"]]), "a person the story only mentions is not asked about");
  assert.equal(json(h.calls.claude[0].context), json({ verifiedFacts: funnel.factsSnapshot(facts) }));
  assert.ok(String(h.calls.claude[0].instructions).startsWith(skills.DRAFT2_ROLES["mention-finder"]), "the mention finder's role, then the brand");
  assert.equal(json(h.calls.lookups.map((lookup) => [lookup.account, lookup.token, lookup.username])), json([["17841400000000", "page-token", "cfournier"], ["17841400000000", "page-token", "biblio.longueuil"], ["17841400000000", "page-token", "biblio_longueuil"]]));
  assert.equal(json(summary(session.mentions)), json([["m1", "cfournier", "verified", "strong"], ["m2", "biblio.longueuil", "verified", "strong"], ["m3", "biblio_longueuil", "not-found", null]]));
  assert.equal(json([session.step, session.status, session.mentions?.status, session.mentions?.version, session.mentions?.lookup]), json(["mentions", "ready", "ready", 1, "instagram-page"]));
  assert.equal(json(session.trace.map((entry) => [entry.step, entry.operation, entry.outcome])), json([["mentions", "draft2_mentions", "ok"]]));
  assert.equal(json(mentionsTypes.confirmedMentions(session.mentions)), json([]), "nothing is tagged until the editor confirms it");
});

test("without the Page's Instagram account nothing is checked, and nothing can be tagged", async () => {
  const h = harness({ page: false, proposed: [{ entityId: "e1", handle: "cfournier" }] });
  const session = await h.find();
  assert.equal(h.calls.lookups.length, 0);
  assert.equal(json([session.mentions?.lookup, summary(session.mentions)]), json(["unavailable", [["m1", "cfournier", "unavailable", null]]]));
  assert.match(String(session.mentions?.note), /Connect the Topic's Facebook Page/);
  await assert.rejects(h.edit({ action: "confirm", accountId: "m1" }), /was not verified on Instagram/);
});

test("the first refusal stops the lookups: the rest would be refused too", async () => {
  const h = harness({ refuseAfter: 1, proposed: [{ entityId: "e1", handle: "cfournier" }, { entityId: "e2", handle: "biblio.longueuil" }, { entityId: "e2", handle: "longueuil.ville" }] });
  const session = await h.find();
  assert.equal(h.calls.lookups.length, 2, "one answer, one refusal, and no third request");
  assert.equal(json(summary(session.mentions)), json([["m1", "cfournier", "verified", "strong"], ["m2", "biblio.longueuil", "unavailable", null], ["m3", "longueuil.ville", "unavailable", null]]));
  assert.match(String(session.mentions?.note), /Instagram did not answer: \(#10\)/);
});

test("the editor tags, sets aside and adds accounts; a new search keeps every decision and every account they added", async () => {
  const h = harness({ proposed: [{ entityId: "e1", handle: "cfournier" }, { entityId: "e2", handle: "biblio.longueuil" }] });
  await h.find();
  let session = await h.edit({ action: "confirm", accountId: "m1" });
  session = await h.edit({ action: "reject", accountId: "m2" });
  session = await h.edit({ action: "add", handle: "@Longueuil.Ville", name: "Ville de Longueuil" });
  assert.equal(json(summary(session.mentions)), json([["m1", "cfournier", "confirmed", "strong"], ["m2", "biblio.longueuil", "rejected", "strong"], ["m3", "longueuil.ville", "verified", "strong"]]));
  assert.equal(json([session.mentions?.version, session.mentions?.accounts[2].source]), json([4, "editor"]), "one version per decision");
  await assert.rejects(h.edit({ action: "add", handle: "longueuil.ville", name: "Again" }), /already in the list/);
  await assert.rejects(h.edit({ action: "confirm", accountId: "m9" }), /m9 is not one of the accounts/);
  assert.equal(json(mentionsTypes.confirmedMentions(session.mentions)), json([{ name: "Catherine Fournier", handle: "@cfournier" }]));

  h.calls.lookups.length = 0;
  session = await h.find();
  assert.equal(json(h.calls.lookups.map((lookup) => lookup.username)), json([]), "Claude proposed only accounts already decided: none is checked again");
  assert.equal(json(summary(session.mentions)), json([["m1", "cfournier", "confirmed", "strong"], ["m2", "biblio.longueuil", "rejected", "strong"], ["m3", "longueuil.ville", "verified", "strong"]]));
  assert.equal(session.mentions?.version, 5);
});

test("accounts are found only for verified facts and found people and places, and never while a search runs", async () => {
  await assert.rejects(harness({ session: { step: "facts", status: "needs-review" } }).find(), /Verify the facts first/);
  await assert.rejects(harness({ session: { inventory: null } }).find(), /Find the people and places first/);
  await assert.rejects(harness({ session: { inventory: { ...INVENTORY, status: "running" } } }).find(), /Find the people and places first/);
  const searching = harness({ session: { status: "running", mentions: { status: "running", version: 1, accounts: [], lookup: "instagram-page" } } });
  await assert.rejects(searching.edit({ action: "reject", accountId: "m1" }), /still being found/);
});

test("a story that names no one to tag asks Claude nothing", async () => {
  const h = harness({ session: { inventory: { ...INVENTORY, entities: [ENTITIES[2]] } } });
  const session = await h.find();
  assert.equal(json([h.calls.claude.length, h.calls.lookups.length, session.mentions?.accounts.length]), json([0, 0, 0]));
  assert.match(String(session.mentions?.note), /names no person, place or organization to tag/);
});
