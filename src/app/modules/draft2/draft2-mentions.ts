import "server-only";
import { withCreativeTextBudget } from "../stories/creative-text-meter";
import { generateAnthropicStructuredResponse } from "../stories/anthropic-structured-response";
import { getAnthropicRuntimeConfig, requireAnthropicApiKey } from "../stories/anthropic.config";
import { getCreativeProfile } from "../stories/creative-profile.repository";
import { getChannelSendCredentials } from "../meta/publication-channel-connections";
import { fetchInstagramBusinessDiscovery } from "../meta/meta-graph-client";
import { activeDraft2Session, claimDraft2Session, getDraft2Session, touchDraft2Session, updateDraft2Session } from "./draft2-session.repository";
import { draft2DevTrace } from "./draft2-dev-trace";
import { Draft2BusyError, Draft2InputError, type Draft2TraceEntry } from "./draft2-facts.types";
import { factsSnapshot, failedCall } from "./draft2-funnel";
import {
  DRAFT2_MENTIONS_SCHEMA, carriedMentions, decidedMention, mentionEntities, mentionMatch, numberedMentions, parseMentionCandidates, parseMentionsAction,
  type Draft2MentionAccount, type Draft2Mentions,
} from "./draft2-mentions.types";
import { OPENING_STALL_MS } from "./draft2-opening.types";
import { brandBrief, composeInstructions } from "./skills/draft2-skills";
import type { Draft2SessionRow } from "@/db/schema";

const MAX_OUTPUT_TOKENS = 4_000;
const CALL_TIMEOUT_MS = 90_000;
const HEARTBEAT_MS = 30_000;

const note = (error: unknown) => error instanceof Error ? error.message.slice(0, 200) : "The lookup failed.";
const UNAVAILABLE = "Connect the Topic's Facebook Page, with its linked Instagram account, to check accounts on Instagram.";

/**
 * Asks Instagram about each username, one at a time, through the Topic's
 * Facebook Page and its linked Instagram account: verified (a professional
 * account, with its name and how well that name matches), not found, or
 * unavailable. The first refusal (a permission, an expired token) stops the
 * lookups: the rest would be refused too.
 */
async function lookUpAccounts(topicId: string, accounts: Draft2MentionAccount[]): Promise<{ accounts: Draft2MentionAccount[]; lookup: Draft2Mentions["lookup"]; note?: string }> {
  const credentials = await getChannelSendCredentials(topicId, "instagram-page").catch(() => undefined);
  if (!credentials) return { accounts: accounts.map((account) => ({ ...account, status: "unavailable", note: UNAVAILABLE })), lookup: "unavailable", note: UNAVAILABLE };
  let refused: string | undefined;
  const checked: Draft2MentionAccount[] = [];
  for (const account of accounts) {
    if (refused) { checked.push({ ...account, status: "unavailable", note: refused }); continue; }
    try {
      const found = await fetchInstagramBusinessDiscovery(credentials.accountId, credentials.accessToken, account.handle);
      checked.push(found
        ? { ...account, status: "verified", account: found, match: mentionMatch(account.name, found), note: undefined }
        : { ...account, status: "not-found", note: "Instagram has no professional account with this username." });
    } catch (error) {
      refused = `Instagram did not answer: ${note(error)}`;
      checked.push({ ...account, status: "unavailable", note: refused });
    }
  }
  return { accounts: checked, lookup: "instagram-page", ...(refused ? { note: refused } : {}) };
}

/**
 * Finds the accounts the caption may tag: Claude proposes usernames for the
 * story's people, places and organizations, and Instagram says which exist
 * and what they are called. Every decision the editor made, and every account
 * they added, carries over to a new search; an account is never tagged
 * until the editor confirms it.
 */
export async function findDraft2Mentions({ topicId, storyId, sessionId }: { topicId: string; storyId: string; sessionId: string }): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session || session.storyId !== storyId) throw new Draft2InputError("This Draft 2 session was not found for the story. Reload the canvas.");
  if (await activeDraft2Session(topicId, storyId)) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const facts = session.facts ?? [];
  if (!facts.length || (session.step === "facts" && session.status !== "ready")) throw new Draft2InputError("Accounts are found only for verified facts. Verify the facts first.");
  const inventory = session.inventory;
  if (!inventory || inventory.status !== "ready") throw new Draft2InputError("Find the people and places first: the accounts are theirs.");
  const entities = mentionEntities(inventory);
  const earlier = session.mentions ?? undefined;
  const kept = carriedMentions(earlier);
  const running: Draft2Mentions = { ...(earlier ?? { version: 0, accounts: [], lookup: "unavailable" as const }), status: "running", error: undefined };
  const claimed = await claimDraft2Session(session.id, { step: "mentions", mentions: running, error: null });
  if (!claimed) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const trace: Draft2TraceEntry[] = [...session.trace];
  const heartbeat = setInterval(() => { void touchDraft2Session(session.id).catch(() => undefined); }, HEARTBEAT_MS);
  try {
    const proposed = !entities.length ? [] : await withCreativeTextBudget({ topicId, storyId, runId: session.id }, async () => {
      const profile = await getCreativeProfile(topicId);
      const apiKey = requireAnthropicApiKey();
      const model = getAnthropicRuntimeConfig().model;
      const { instructions, skillVersions } = composeInstructions("mention-finder", [], brandBrief(profile));
      const contents = { task: "accounts", entities: entities.map(({ id, name, kind, role, description }) => ({ id, name, kind, role, description })) };
      const at = new Date().toISOString();
      const begin = Date.now();
      draft2DevTrace({ step: "mentions", round: 1, provider: "anthropic", model, operation: "draft2_mentions", phase: "request", detail: { instructions, contents } });
      try {
        const answered = await generateAnthropicStructuredResponse({
          apiKey, model, instructions, context: { verifiedFacts: factsSnapshot(facts) }, contents,
          schema: DRAFT2_MENTIONS_SCHEMA, schemaName: "draft2_mentions", maxOutputTokens: MAX_OUTPUT_TOKENS, effort: "medium", timeoutMs: CALL_TIMEOUT_MS,
          auditContext: { runId: session.id, topicId, storyId },
        });
        trace.push({ at, step: "mentions", round: 1, provider: "anthropic", model, operation: "draft2_mentions", durationMs: Date.now() - begin, usage: answered.usage, cachedInputTokens: answered.cachedInputTokens, ...(answered.cacheWriteTokens ? { cacheWriteTokens: answered.cacheWriteTokens } : {}), answerCharacters: answered.text.length, outcome: "ok", skillVersions });
        draft2DevTrace({ step: "mentions", round: 1, provider: "anthropic", model, operation: "draft2_mentions", phase: "response", durationMs: Date.now() - begin, detail: { answer: answered.text } });
        return parseMentionCandidates(answered.text, entities);
      } catch (error) {
        trace.push({ at, step: "mentions", round: 1, provider: "anthropic", model, operation: "draft2_mentions", durationMs: Date.now() - begin, outcome: "error", note: note(error), ...failedCall(error), skillVersions });
        throw error;
      }
    });
    const taken = new Set(kept.map((account) => account.handle));
    const fresh: Draft2MentionAccount[] = proposed.filter((candidate) => !taken.has(candidate.handle)).map((candidate) => ({
      id: "m0", entityId: candidate.entityId, name: entities.find((entity) => entity.id === candidate.entityId)!.name, handle: candidate.handle, source: "claude", status: "unavailable",
    }));
    const checked = await lookUpAccounts(topicId, fresh);
    const now = new Date().toISOString();
    const mentions: Draft2Mentions = {
      status: "ready", version: (earlier?.version ?? 0) + 1, accounts: numberedMentions([...kept, ...checked.accounts]), lookup: checked.lookup,
      ...(checked.note ? { note: checked.note } : !entities.length ? { note: "The story names no person, place or organization to tag." } : {}),
      foundBy: { provider: "anthropic", model: getAnthropicRuntimeConfig().model }, foundAt: now, updatedAt: now,
    };
    return (await updateDraft2Session(session.id, { mentions, trace, status: "ready", error: null })) ?? claimed;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Finding the accounts failed.";
    await updateDraft2Session(session.id, { mentions: { ...running, status: "failed", error: message }, trace, status: "failed", error: message }).catch(() => undefined);
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}

/**
 * One editor decision, with no model call: confirm an account Instagram
 * verified, reject it, take that back, or add an account of their own
 * (checked on Instagram at once).
 */
export async function editDraft2Mentions({ topicId, sessionId, input }: { topicId: string; sessionId: string; input: unknown }): Promise<Draft2SessionRow> {
  const action = parseMentionsAction(input);
  const session = await getDraft2Session(topicId, sessionId);
  if (!session) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  const mentions = session.mentions;
  const searching = mentions?.status === "running" && session.status === "running" && Date.now() - new Date(session.updatedAt).getTime() < OPENING_STALL_MS;
  if (searching) throw new Draft2BusyError("The accounts are still being found; decide when the search finishes.");
  const current: Draft2Mentions = mentions ?? { status: "ready", version: 0, accounts: [], lookup: "unavailable" };
  let accounts: Draft2MentionAccount[];
  let lookup = current.lookup;
  let lookupNote = current.note;
  if (action.action === "add") {
    if (current.accounts.some((account) => account.handle === action.handle)) throw new Draft2InputError(`@${action.handle} is already in the list.`);
    const entity = action.entityId ? session.inventory?.entities.find((candidate) => candidate.id === action.entityId) : undefined;
    const checked = await lookUpAccounts(topicId, [{ id: "m0", ...(entity ? { entityId: entity.id } : {}), name: action.name, handle: action.handle, source: "editor", status: "unavailable" }]);
    accounts = [...current.accounts, ...checked.accounts];
    lookup = checked.lookup;
    lookupNote = checked.note;
  } else {
    const account = current.accounts.find((candidate) => candidate.id === action.accountId);
    if (!account) throw new Draft2InputError(`${action.accountId} is not one of the accounts.`);
    accounts = current.accounts.map((candidate) => candidate === account ? decidedMention(candidate, action.action) : candidate);
  }
  const next: Draft2Mentions = {
    ...current, status: "ready", version: current.version + 1, accounts: numberedMentions(accounts), lookup,
    ...(lookupNote ? { note: lookupNote } : { note: undefined }), updatedAt: new Date().toISOString(),
  };
  const updated = await updateDraft2Session(session.id, { mentions: next });
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}
