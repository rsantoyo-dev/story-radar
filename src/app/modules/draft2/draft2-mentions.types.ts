import { comparableText, Draft2InputError, Draft2ResponseError } from "./draft2-facts.types";
import { longWords, wordOverlap } from "./draft2-funnel";
import type { Draft2Provider } from "./draft2-models";
import type { Draft2Inventory, Draft2InventoryEntity } from "./draft2-inventory.types";

/**
 * Mentions, before the caption: the Instagram accounts of the people, places
 * and organizations the story names, which the caption may tag. A model
 * never decides a handle: Claude proposes candidates for the inventory's
 * entities (or the editor types one), the program asks Instagram whether
 * each is a professional account and what it is called (Business Discovery,
 * through the Topic's Facebook Page), and the editor confirms the ones that
 * are them. Only confirmed accounts reach the caption. Everything here is
 * pure: contracts, the schema, parsing and the editor's decisions.
 */
export const MENTION_MAX_CANDIDATES = 12;
export const MENTION_MAX_PER_ENTITY = 2;
/** Instagram's usernames: letters, digits, periods and underscores, up to 30. */
export const MENTION_HANDLE = /^[A-Za-z0-9._]{1,30}$/;
/** Instagram's name and the entity's share this much of their longer words: the same name. */
const STRONG_MATCH_OVERLAP = 0.5;

export type Draft2MentionStatus = "verified" | "not-found" | "unavailable" | "confirmed" | "rejected";

export type Draft2MentionAccount = {
  /** m1, m2… */
  id: string;
  /** The inventory entity it stands for; absent when the editor added an account of their own. */
  entityId?: string;
  /** Who it is: the entity's name, or the editor's label. */
  name: string;
  /** The username, without the @. */
  handle: string;
  source: "claude" | "editor";
  status: Draft2MentionStatus;
  /** What Instagram returned for the username. */
  account?: { username: string; name: string; followers?: number; website?: string };
  /** strong: Instagram's name is the entity's; weak: the editor checks it is them. */
  match?: "strong" | "weak";
  note?: string;
};

export type Draft2Mentions = {
  status: "running" | "ready" | "failed";
  /** One more on every search and every decision; a caption records the version it followed. */
  version: number;
  accounts: Draft2MentionAccount[];
  /** Whether Instagram could be asked: the Topic's Facebook Page links an Instagram account. */
  lookup: "instagram-page" | "unavailable";
  note?: string;
  foundBy?: { provider: Draft2Provider; model: string };
  foundAt?: string;
  updatedAt?: string;
  error?: string;
};

/** Claude's answer: candidate usernames for the inventory's entities. */
export const DRAFT2_MENTIONS_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    accounts: {
      type: "array",
      maxItems: MENTION_MAX_CANDIDATES,
      items: {
        type: "object",
        properties: { entityId: { type: "string" }, handle: { type: "string" } },
        required: ["entityId", "handle"],
        additionalProperties: false,
      },
    },
  },
  required: ["accounts"],
  additionalProperties: false,
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
/** A handle as compared and stored: without the @, lowercase. */
export const normalHandle = (value: string) => value.trim().replace(/^@/u, "").toLowerCase();

/** The entities an account may stand for: the story's people, places and organizations. */
export const mentionEntities = (inventory: Pick<Draft2Inventory, "entities"> | undefined) => (inventory?.entities ?? []).filter((entity) => entity.kind !== "person" || entity.role !== "mentioned");

/**
 * Claude's candidates as accounts to check: a known entity, a well-formed
 * username, at most two per entity, each username once. A malformed answer
 * is a response error, never persisted.
 */
export function parseMentionCandidates(answer: string, entities: readonly Draft2InventoryEntity[]): { entityId: string; handle: string }[] {
  let parsed: unknown;
  try { parsed = JSON.parse(answer); } catch { throw new Draft2ResponseError("The accounts answer is not valid JSON"); }
  const body = record(parsed);
  if (!Array.isArray(body.accounts)) throw new Draft2ResponseError("The accounts answer has no accounts");
  const known = new Set(entities.map((entity) => entity.id));
  const seen = new Set<string>();
  const perEntity = new Map<string, number>();
  const candidates: { entityId: string; handle: string }[] = [];
  for (const raw of body.accounts.slice(0, MENTION_MAX_CANDIDATES)) {
    const item = record(raw);
    const entityId = typeof item.entityId === "string" ? item.entityId : "";
    const handle = typeof item.handle === "string" ? normalHandle(item.handle) : "";
    if (!known.has(entityId) || !MENTION_HANDLE.test(handle) || seen.has(handle) || (perEntity.get(entityId) ?? 0) >= MENTION_MAX_PER_ENTITY) continue;
    seen.add(handle);
    perEntity.set(entityId, (perEntity.get(entityId) ?? 0) + 1);
    candidates.push({ entityId, handle });
  }
  return candidates;
}

/** How Instagram's account compares with who it should be: the same name, or one the editor must check. */
export function mentionMatch(name: string, account: { username: string; name: string }): "strong" | "weak" {
  const wanted = comparableText(name);
  const found = comparableText(account.name);
  if (wanted && found && (found.includes(wanted) || wanted.includes(found))) return "strong";
  return wordOverlap(longWords(name), longWords(`${account.name} ${account.username.replace(/[._]/gu, " ")}`)) >= STRONG_MATCH_OVERLAP ? "strong" : "weak";
}

/** What a new search keeps from the last one: every decision the editor made and every account they added, by username. */
export function carriedMentions(earlier: Draft2Mentions | undefined): Draft2MentionAccount[] {
  return (earlier?.accounts ?? []).filter((account) => account.status === "confirmed" || account.status === "rejected" || account.source === "editor");
}

/** Renumbers accounts m1, m2… in order. */
export const numberedMentions = (accounts: readonly Draft2MentionAccount[]) => accounts.map((account, index) => ({ ...account, id: `m${index + 1}` }));

export type Draft2MentionsAction =
  | { action: "confirm" | "reject" | "reopen"; accountId: string }
  | { action: "add"; handle: string; name: string; entityId?: string };

/** The editor's decision as a contract; anything else is an input error. */
export function parseMentionsAction(value: unknown): Draft2MentionsAction {
  const body = record(value);
  if (body.action === "add") {
    const handle = typeof body.handle === "string" ? normalHandle(body.handle) : "";
    if (!MENTION_HANDLE.test(handle)) throw new Draft2InputError("Write the Instagram username (letters, digits, periods and underscores, up to 30).");
    const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, 120) : "";
    if (!name) throw new Draft2InputError("Say who the account is.");
    const entityId = typeof body.entityId === "string" && /^e\d{1,3}$/u.test(body.entityId) ? body.entityId : undefined;
    return { action: "add", handle, name, ...(entityId ? { entityId } : {}) };
  }
  const accountId = typeof body.accountId === "string" && /^m\d{1,3}$/u.test(body.accountId) ? body.accountId : undefined;
  if (!accountId) throw new Draft2InputError("Name the account (accountId, such as m2).");
  if (body.action === "confirm" || body.action === "reject" || body.action === "reopen") return { action: body.action, accountId };
  throw new Draft2InputError("The action is confirm, reject, reopen or add.");
}

/** The account after one decision: only an account Instagram verified can be confirmed. */
export function decidedMention(account: Draft2MentionAccount, action: "confirm" | "reject" | "reopen"): Draft2MentionAccount {
  if (action === "confirm") {
    if (account.status !== "verified" && account.status !== "rejected") throw new Draft2InputError(`@${account.handle} was not verified on Instagram, so it cannot be tagged.`);
    if (!account.account) throw new Draft2InputError(`@${account.handle} was not verified on Instagram, so it cannot be tagged.`);
    return { ...account, status: "confirmed" };
  }
  if (action === "reject") return { ...account, status: "rejected" };
  return { ...account, status: account.account ? "verified" : account.status === "rejected" ? "not-found" : account.status };
}

/** The accounts the caption may tag: the confirmed ones, with the name the editor knows them by. */
export function confirmedMentions(mentions: Pick<Draft2Mentions, "accounts"> | null | undefined): { name: string; handle: string }[] {
  return (mentions?.accounts ?? []).filter((account) => account.status === "confirmed").map((account) => ({ name: account.name, handle: `@${account.account?.username ?? account.handle}` }));
}

/** Whether two lists of confirmed accounts tag the same accounts, by the same names, in any order: a decision on any other account changes neither. */
export function sameMentions(a: readonly { name: string; handle: string }[] | null | undefined, b: readonly { name: string; handle: string }[] | null | undefined): boolean {
  const key = (list: readonly { name: string; handle: string }[] | null | undefined) => (list ?? []).map((mention) => `${mention.handle.toLowerCase()} ${mention.name}`).sort().join("\n");
  return key(a) === key(b);
}
