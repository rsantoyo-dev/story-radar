"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ActionRow, Button, EmptyState, FormField, InlineNotice, LoadingState, SectionHeader, StatusBadge, Surface, type StatusTone } from "@/app/ui/primitives";
import type { StoryContentResponse } from "@/app/radar-dashboard";
import type { Draft2Fact, Draft2FactsEvaluation, Draft2FactsRound, Draft2SessionStatus, Draft2TraceEntry } from "@/app/modules/draft2/draft2-facts.types";
import {
  FOCUS_AUDIENCE_MAX_CHARACTERS, FOCUS_CONSEQUENCE_MAX_CHARACTERS, FOCUS_DIRECTION_MAX_CHARACTERS, FOCUS_FRAMINGS, FOCUS_GOALS, FOCUS_GRAVITIES, FOCUS_STRUCTURES, focusFindings,
  type Draft2Focus, type Draft2FocusField, type Draft2FocusFinding, type Draft2FocusValues, type Draft2FocusVoice,
} from "@/app/modules/draft2/draft2-focus.types";
import { TONE_KEYS, toneWords, type ToneKey } from "@/app/modules/draft2/skills/tone";
import {
  OPENING_GATE, OPENING_MAX_ROUNDS, OPENING_STALL_MS, openingResumeRound,
  type Draft2Opening, type Draft2OpeningCandidate, type Draft2OpeningCriterion,
} from "@/app/modules/draft2/draft2-opening.types";
import { CLOSING_GATE, CLOSING_MAX_ROUNDS, type Draft2Closing, type Draft2ClosingCandidate, type Draft2ClosingCriterion } from "@/app/modules/draft2/draft2-closing.types";
import { DECK_GATE, DECK_MAX_ROUNDS, type Draft2Deck, type Draft2DeckCandidate, type Draft2DeckCriterion } from "@/app/modules/draft2/draft2-deck.types";
import { INVENTORY_CHARACTER_CHOICES, type Draft2CharacterChoice, type Draft2Inventory, type Draft2InventoryEntity, type Draft2InventoryStoryPhoto } from "@/app/modules/draft2/draft2-inventory.types";
import { VISUAL_GATE, VISUAL_MAX_ROUNDS, visualPlan, type Draft2Visual, type Draft2VisualCandidate, type Draft2VisualCriterion, type Draft2VisualRecurring, type Draft2VisualShot } from "@/app/modules/draft2/draft2-visual.types";
import { IMAGES_MAX_REQUESTS, latestAttempt, shownAttempt, slideSettled, type Draft2ImageAttempt, type Draft2ImageReview, type Draft2Images, type Draft2SlideImage } from "@/app/modules/draft2/draft2-images.types";
import { CAPTION_GATE, CAPTION_MAX_CHARACTERS, CAPTION_MAX_ROUNDS, captionPostText, type Draft2Caption, type Draft2CaptionCandidate, type Draft2CaptionCriterion } from "@/app/modules/draft2/draft2-caption.types";
import { confirmedMentions, mentionEntities, sameMentions, type Draft2MentionAccount, type Draft2MentionStatus, type Draft2Mentions } from "@/app/modules/draft2/draft2-mentions.types";
import { publicationCurrent, publicationTarget, targetPostText, type Draft2Publication, type Draft2PublicationTarget } from "@/app/modules/draft2/draft2-publication.types";
import {
  criterionOf, funnelAcceptedWinner, funnelExtendable, funnelResumeRound, funnelScorePasses, funnelVersions, hasMaterialError,
  type FunnelCandidate, type FunnelGate, type FunnelIssue, type FunnelRegression, type FunnelRound, type FunnelRun, type FunnelScore, type FunnelVersion,
} from "@/app/modules/draft2/draft2-funnel";
import { DRAFT2_OPENING_EARLIER_ROLES, DRAFT2_OPENING_ROLES, draft2ProviderName } from "@/app/modules/draft2/draft2-models";
import { contentStatusLabel, DRAFT_2_STEPS, paragraphs, sourceHost, storyHref, traceUsageLine, wordCount } from "./draft-2-canvas.core";
import { StoryPhotosPanel } from "./story-photos-panel";
import { RunPublishActions } from "./run-publish-actions";
import { PublicationChannelsPanel } from "./publication-channels-panel";
import styles from "./draft-2-canvas.generated.module.css";

/** The Draft 2 session as the API returns it. */
type Draft2SessionView = {
  id: string;
  status: Draft2SessionStatus;
  step: string;
  facts: Draft2Fact[] | null;
  evaluation: Draft2FactsEvaluation | null;
  rounds: Draft2FactsRound[];
  focus: Draft2Focus | null;
  opening: Draft2Opening | null;
  closing: Draft2Closing | null;
  deck: Draft2Deck | null;
  inventory: Draft2Inventory | null;
  visual: Draft2Visual | null;
  images: Draft2Images | null;
  mentions: Draft2Mentions | null;
  caption: Draft2Caption | null;
  publication: Draft2Publication | null;
  trace: Draft2TraceEntry[];
  error: string | null;
  updatedAt: string;
};

type Draft2RunStep = "facts" | "focus" | "opening" | "closing" | "deck" | "inventory" | "visual" | "images" | "mentions" | "caption" | "publication";
/** The steps that run on the funnel, in rounds that can pause and continue. */
type Draft2FunnelStep = "opening" | "closing" | "deck" | "visual" | "caption";

/** Up to three rounds of two provider calls; the route itself allows 300 s. */
const STEP_REQUEST_TIMEOUT_MS = 540_000;
/** How often a run whose request was lost is checked, and how long the server may stay unreachable before the canvas stops waiting. */
const FOLLOW_POLL_MS = 10_000;
const FOLLOW_UNREACHABLE_MS = 3 * 60_000;

/** A request that ended without telling how the run went: the connection dropped, it timed out, or a gateway answered for the server. The run may go on. */
class Draft2LostRequest extends Error {}

const SESSION_STATUS: Record<Draft2SessionStatus, { label: string; tone: StatusTone }> = {
  running: { label: "Running", tone: "info" },
  ready: { label: "Verified", tone: "success" },
  "needs-review": { label: "Needs review", tone: "warning" },
  failed: { label: "Failed", tone: "error" },
};

const FOCUS_STATUS: Record<Draft2Focus["status"], { label: string; tone: StatusTone }> = {
  running: { label: "Deciding", tone: "info" },
  ready: { label: "Decided", tone: "success" },
  failed: { label: "Failed", tone: "error" },
};

const OPENING_STATUS: Record<Draft2Opening["status"], { label: string; tone: StatusTone }> = {
  running: { label: "Running", tone: "info" },
  paused: { label: "Paused", tone: "info" },
  ready: { label: "Ready", tone: "success" },
  "needs-review": { label: "Needs review", tone: "warning" },
  failed: { label: "Failed", tone: "error" },
};

const FACT_STATUS: Record<Draft2Fact["status"], { label: string; tone: StatusTone }> = {
  established: { label: "Established", tone: "success" },
  attributed: { label: "Attributed", tone: "info" },
  disputed: { label: "Disputed", tone: "warning" },
};

const CRITERION_LABEL: Record<Draft2OpeningCriterion, string> = { tension: "Tension", payoff: "Payoff", clarity: "Clarity", grounding: "Grounding", voice: "Voice", focus: "Focus" };
const CLOSING_CRITERION_LABEL: Record<Draft2ClosingCriterion, string> = { resolution: "Resolution", meaning: "Meaning", action: "Action", continuity: "Continuity", grounding: "Grounding", voice: "Voice", focus: "Focus" };
const DECK_CRITERION_LABEL: Record<Draft2DeckCriterion, string> = { flow: "Flow", coverage: "Coverage", pacing: "Pacing", clarity: "Clarity", grounding: "Grounding", voice: "Voice", focus: "Focus" };
const VISUAL_CRITERION_LABEL: Record<Draft2VisualCriterion, string> = { narrative: "Narrative", progression: "Progression", beat: "Beat", continuity: "Identity", brand: "Brand", truth: "Truth", craft: "Craft", focus: "Focus" };
const RECURRING_LABEL: Record<Draft2VisualRecurring, string> = { none: "", accent: "Recurring element as an accent", focus: "Recurring element leads", callback: "The recurring element returns" };
const CHARACTER_CHOICE_LABEL: Record<Draft2CharacterChoice, string> = { auto: "Claude decides in each script", on: "A brand character narrates", off: "No brand character" };
const SHOT_LABEL: Record<Draft2VisualShot, string> = { wide: "Wide shot", medium: "Medium shot", close: "Close-up", overhead: "Overhead", typography: "Typography" };
const IMAGES_STATUS: Record<Draft2Images["status"], { label: string; tone: StatusTone }> = {
  running: { label: "Generating", tone: "info" }, paused: { label: "Paused", tone: "warning" }, ready: { label: "Ready", tone: "success" },
  "needs-review": { label: "Needs review", tone: "warning" }, failed: { label: "Failed", tone: "error" },
};
const CAPTION_CRITERION_LABEL: Record<Draft2CaptionCriterion, string> = { hook: "Hook", scan: "Scan", grounding: "Grounding", voice: "Voice", action: "Action", hashtags: "Hashtags", fit: "Fit" };
const MENTION_STATUS: Record<Draft2MentionStatus, { label: string; tone: StatusTone }> = {
  verified: { label: "On Instagram", tone: "info" }, confirmed: { label: "Tagged", tone: "success" }, rejected: { label: "Not them", tone: "neutral" },
  "not-found": { label: "Not found", tone: "neutral" }, unavailable: { label: "Not checked", tone: "warning" },
};
const NEED_LABEL: Record<string, string> = { "generic-illustration": "Illustration", "character-reference": "Brand character", "real-photo": "Verified photo", "verified-map": "Verified map", typography: "Typography" };

const FRAMING_LABEL: Record<Draft2FocusValues["framing"], string> = { "reader-consequence": "Reader consequence", explainer: "Explainer", authority: "Authority" };
const STRUCTURE_LABEL: Record<Draft2FocusValues["structure"]["kind"], string> = { arc: "Arc: one story, one tension", steps: "Steps: an ordered procedure", list: "List: “N things to…”" };
const GOAL_LABEL: Record<Draft2FocusValues["goal"], string> = { followers: "Followers", discussion: "Discussion", saves: "Saves", shares: "Shares" };
const GRAVITY_LABEL: Record<Draft2FocusVoice["gravity"], string> = { light: "Light", ordinary: "Ordinary", serious: "Serious", grave: "Grave" };
const TONE_LABEL: Record<ToneKey, string> = { formality: "Formality", humor: "Humor", energy: "Energy", optimism: "Optimism", provocation: "Provocation" };

const providerLabel = (provider: Draft2TraceEntry["provider"]) => provider === "openai" ? "Sol" : "Claude";
type RoleNames = { writer: string; judge: string };
/** Who writes and who judges a new run today. */
const TODAY: RoleNames = { writer: draft2ProviderName(DRAFT2_OPENING_ROLES.writer), judge: draft2ProviderName(DRAFT2_OPENING_ROLES.judge) };
/** Who wrote and who judged a run; one stored before the swap records no roles and had Sol writing and Claude judging. */
const roleNames = (opening: Pick<Draft2Opening, "writer" | "judge">): RoleNames => ({
  writer: draft2ProviderName(opening.writer?.provider ?? DRAFT2_OPENING_EARLIER_ROLES.writer),
  judge: draft2ProviderName(opening.judge?.provider ?? DRAFT2_OPENING_EARLIER_ROLES.judge),
});

/** Where a version comes from: its round, and the version it revises or the judge's proposal it is (as written) or edits. */
const versionOrigin = ({ round, candidate }: FunnelVersion, names: RoleNames) => {
  const proposal = candidate.proposalOf ? (candidate.asProposed ? ` · ${names.judge}’s ${candidate.proposalOf} as written` : ` · ${names.writer}’s edit of ${names.judge}’s ${candidate.proposalOf}`) : "";
  return `round ${round}${candidate.revisionOf ? ` · revises ${candidate.revisionOf}` : ""}${proposal}`;
};

/** Why a revision did not replace its version: a lower score, or the same or a higher one with a loss the score does not show. */
function regressionNote({ candidateId, previousId, from, to, worse }: FunnelRegression): string {
  const losses = worse.length ? ` (${worse.join(", ")})` : "";
  const lead = to < from ? `${candidateId} scored ${to}, below ${previousId}’s ${from}${losses}`
    : to === from ? `${candidateId} matched ${previousId}’s ${from} but did worse${losses}`
      : `${candidateId} scored ${to} to ${previousId}’s ${from} but did worse${losses}`;
  return `${lead}; ${previousId} stays the better version.`;
}

const listed = (items: readonly string[]) => items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items.join("");
const PART_LABEL: Record<string, string> = { cover: "cover", slide2: "slide 2", penultimate: "penultimate", last: "last slide" };
/** A part as the editor reads it: a slide of the opening or closing, or "deck slide 2" for the deck's s2 (the visual script names slides the same way). */
const partLabel = (part: string) => PART_LABEL[part] ?? (/^s(\d+)$/.exec(part) ? `deck slide ${part.slice(1)}` : part);
const issueTarget = (issue: FunnelIssue) => issue.candidateId ? ` · ${issue.candidateId}${issue.part ? ` · ${partLabel(issue.part)}` : ""}` : "";

/**
 * Draft 2: the second creative pipeline, built one step at a time beside the
 * current studio, which it never touches. The canvas brings in the selected
 * story and runs each step on it: Facts, the Focus, the Opening, then the
 * Closing.
 */
export function Draft2Canvas({ signedIn = false, topicId, topicName, themeStyle, storyId, from, returnContext }: {
  /** A signed-in session authorizes every request; the collector secret is not needed. */
  signedIn?: boolean;
  topicId: string;
  topicName: string;
  themeStyle: CSSProperties;
  storyId: string;
  from?: string;
  returnContext?: string;
}) {
  const [secret] = useState(() => {
    if (typeof window === "undefined" || signedIn) return "";
    try { return window.sessionStorage.getItem("story-radar:collector-secret") ?? ""; }
    catch { return ""; }
  });
  const [content, setContent] = useState<StoryContentResponse>();
  const [error, setError] = useState<string>();
  const [session, setSession] = useState<Draft2SessionView | null>();
  const [running, setRunning] = useState<Draft2RunStep>();
  const [runError, setRunError] = useState<{ step: Draft2RunStep; message: string }>();
  const [choosing, setChoosing] = useState<{ step: Draft2FunnelStep; id: string }>();
  const [choiceError, setChoiceError] = useState<{ step: Draft2FunnelStep; message: string }>();
  const [savingFocus, setSavingFocus] = useState<Draft2FocusField>();
  const [savingInventory, setSavingInventory] = useState<string>();
  const [inventoryError, setInventoryError] = useState<string>();
  const [savingImage, setSavingImage] = useState<string>();
  const [imageError, setImageError] = useState<string>();
  const [savingMention, setSavingMention] = useState<string>();
  const [mentionError, setMentionError] = useState<string>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [focusError, setFocusError] = useState<string>();
  const [following, setFollowing] = useState<string>();
  // The clock a run is measured against, to tell a run that went silent from one still working.
  const [now, setNow] = useState(0);
  const back = storyHref(topicId, storyId, { from, returnContext });
  const headers = { Authorization: `Bearer ${secret}` };

  useEffect(() => {
    if (!secret && !signedIn) {
      Promise.resolve().then(() => setError("Connect with the collector secret on the dashboard to open this story."));
      return;
    }
    const controller = new AbortController();
    fetch(`/api/radar/stories/${encodeURIComponent(storyId)}/content?topicId=${encodeURIComponent(topicId)}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${secret}` },
    }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not open the story.");
      return body as StoryContentResponse;
    }).then((result) => {
      if (!controller.signal.aborted) setContent(result);
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not open the story.");
    });
    return () => controller.abort();
  }, [secret, signedIn, storyId, topicId]);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    void Promise.resolve().then(tick);
    const clock = setInterval(tick, 30_000);
    return () => clearInterval(clock);
  }, []);

  const loadSession = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/radar/draft2/session?topicId=${encodeURIComponent(topicId)}&storyId=${encodeURIComponent(storyId)}`, { cache: "no-store", signal, headers: { Authorization: `Bearer ${secret}` } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Could not read the Draft 2 session.");
    return (body.session ?? null) as Draft2SessionView | null;
  }, [secret, storyId, topicId]);

  useEffect(() => {
    if (!content) return;
    const controller = new AbortController();
    loadSession(controller.signal).then((value) => { if (!controller.signal.aborted) setSession(value); }).catch(() => { if (!controller.signal.aborted) setSession(null); });
    return () => controller.abort();
  }, [content, loadSession]);

  /** Runs one step: Facts starts a new session, the Opening continues the current one. */
  /** One step request; each has its own timeout, since an opening continues in further requests. */
  async function postStep(step: Draft2RunStep, payload: Record<string, unknown>): Promise<Draft2SessionView> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STEP_REQUEST_TIMEOUT_MS);
    try {
      let response: Response;
      try {
        response = await fetch(`/api/radar/draft2/${step}?topicId=${encodeURIComponent(topicId)}`, {
          method: "POST", cache: "no-store", signal: controller.signal, headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
      } catch (cause) {
        throw new Draft2LostRequest(cause instanceof Error && cause.name === "AbortError" ? "The request took too long." : "The connection to the server dropped.");
      }
      const body = await response.json().catch(() => undefined) as { session?: Draft2SessionView; error?: string } | undefined;
      if (response.ok && body?.session) return body.session;
      // A gateway's page instead of the route's answer: the run may still be going.
      if (!body?.error) throw new Draft2LostRequest(`The server answered ${response.status} without a result.`);
      throw new Error(body.error);
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Follows a run whose request was lost until it finishes, pauses or goes silent; undefined when the server stays unreachable. */
  async function followRun(step: Draft2FunnelStep | "images"): Promise<Draft2SessionView | undefined> {
    let unreachableSince: number | undefined;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, FOLLOW_POLL_MS));
      let current: Draft2SessionView | null;
      try {
        current = await loadSession();
        unreachableSince = undefined;
      } catch {
        unreachableSince ??= Date.now();
        if (Date.now() - unreachableSince > FOLLOW_UNREACHABLE_MS) return undefined;
        continue;
      }
      const run = current?.[step];
      if (!current || !run) return current ?? undefined;
      setSession(current);
      if (run.status !== "running" || Date.now() - Date.parse(current.updatedAt) > OPENING_STALL_MS) return current;
    }
  }

  /**
   * Runs one step: Facts starts a new session, the others continue the
   * current one; `continuing` picks a paused or stopped opening or closing
   * up. A run that pauses, or whose request is lost, goes on from its last
   * checkpoint in a new request until it finishes.
   */
  async function runStep(step: Exclude<Draft2RunStep, "publication">, { continuing = false } = {}) {
    if (running || (step !== "facts" && !session)) return;
    setRunning(step); setRunError(undefined); setChoiceError(undefined); setFocusError(undefined); setMentionError(undefined);
    try {
      if (step === "facts") {
        setSession(await postStep("facts", { storyId }));
        return;
      }
      if (step === "focus" || step === "inventory" || step === "mentions") {
        setSession(await postStep(step, { storyId, sessionId: session?.id }));
        return;
      }
      let payload: Record<string, unknown> = { storyId, sessionId: session?.id, ...(continuing ? { continue: true } : {}) };
      // Each request advances at least one round or judgment; a round can pause once before its writer and once before its judge. An images run pauses while fal works.
      const maxRounds = step === "caption" ? CAPTION_MAX_ROUNDS : step === "visual" ? VISUAL_MAX_ROUNDS : step === "deck" ? DECK_MAX_ROUNDS : step === "closing" ? CLOSING_MAX_ROUNDS : OPENING_MAX_ROUNDS;
      const maxRequests = step === "images" ? IMAGES_MAX_REQUESTS : maxRounds * 2;
      for (let request = 0; request <= maxRequests; request++) {
        let next: Draft2SessionView | undefined;
        try {
          next = await postStep(step, payload);
        } catch (cause) {
          if (!(cause instanceof Draft2LostRequest)) throw cause;
          setFollowing(cause.message);
          next = await followRun(step);
          setFollowing(undefined);
          if (!next) throw new Error(`${cause.message} The server has not answered since; when it is back, reload and continue the run from where it stopped.`);
        }
        setSession(next);
        // Paused, or silent since its request was lost: pick it up again.
        const status = next[step]?.status;
        if (status !== "paused" && status !== "running") return;
        payload = { storyId, sessionId: next.id, continue: true };
      }
    } catch (cause) {
      const failure = `The ${step} step failed.`;
      const message = cause instanceof Draft2LostRequest ? `${cause.message} The server may still finish the step; reload to see it.` : cause instanceof Error ? cause.message : failure;
      setRunError({ step, message });
      // A failed run keeps its trace on the session; show it.
      loadSession().then(setSession).catch(() => undefined);
    } finally {
      setFollowing(undefined);
      setRunning(undefined);
    }
  }

  /** Saves one focus field the editor changed, or gives it back to Claude's value; one change at a time. */
  async function saveFocus(field: Draft2FocusField, change: { value: unknown } | { reset: true }) {
    if (!session || running || savingFocus) return;
    setSavingFocus(field); setFocusError(undefined);
    try {
      const response = await fetch(`/api/radar/draft2/focus?topicId=${encodeURIComponent(topicId)}`, {
        method: "PATCH", cache: "no-store", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, field, ...change }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save the focus.");
      setSession(body.session as Draft2SessionView);
    } catch (cause) {
      setFocusError(cause instanceof Error ? cause.message : "Could not save the focus.");
    } finally {
      setSavingFocus(undefined);
    }
  }

  /** One people-and-places decision: a person's photo, a place's match, a story photo for either, the story's photos read again, or the characters choice. */
  async function decideInventory(input: Record<string, unknown>) {
    if (!session || running || savingInventory) return;
    setSavingInventory(String(input.entityId ?? input.action)); setInventoryError(undefined);
    try {
      const response = await fetch(`/api/radar/draft2/inventory?topicId=${encodeURIComponent(topicId)}`, {
        method: "PATCH", cache: "no-store", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, ...input }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save the decision.");
      setSession(body.session as Draft2SessionView);
    } catch (cause) {
      setInventoryError(cause instanceof Error ? cause.message : "Could not save the decision.");
    } finally {
      setSavingInventory(undefined);
    }
  }

  /** One image decision: another image of a slide, made at once, or the version a slide shows. */
  async function decideImage(input: Record<string, unknown>) {
    if (!session || running || savingImage) return;
    setSavingImage(String(input.slide)); setImageError(undefined);
    let queued = false;
    try {
      const response = await fetch(`/api/radar/draft2/images?topicId=${encodeURIComponent(topicId)}`, {
        method: "PATCH", cache: "no-store", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, ...input }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save the decision.");
      const next = body.session as Draft2SessionView;
      setSession(next);
      queued = next.images?.status === "paused";
    } catch (cause) {
      setImageError(cause instanceof Error ? cause.message : "Could not save the decision.");
    } finally {
      setSavingImage(undefined);
    }
    if (queued) void runStep("images", { continuing: true });
  }

  /** One decision on the accounts to tag: tag one, say it is not them, take that back, or add one of the editor's (checked on Instagram). */
  async function decideMention(input: Record<string, unknown>): Promise<boolean> {
    if (!session || running || savingMention) return false;
    setSavingMention(String(input.accountId ?? input.action)); setMentionError(undefined);
    try {
      const response = await fetch(`/api/radar/draft2/mentions?topicId=${encodeURIComponent(topicId)}`, {
        method: "PATCH", cache: "no-store", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, ...input }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save the decision.");
      setSession(body.session as Draft2SessionView);
      return true;
    } catch (cause) {
      setMentionError(cause instanceof Error ? cause.message : "Could not save the decision.");
      return false;
    } finally {
      setSavingMention(undefined);
    }
  }

  /** Approves the carousel as it stands for publishing; nothing is published until the editor confirms a channel below. */
  async function approvePublication(acknowledgeIssues = acknowledged) {
    if (!session || running) return;
    setRunning("publication"); setRunError(undefined);
    try {
      setSession(await postStep("publication", { storyId, sessionId: session.id, acknowledgeIssues }));
      setAcknowledged(false);
    } catch (cause) {
      setRunError({ step: "publication", message: cause instanceof Error ? cause.message : "Could not approve the carousel." });
    } finally {
      setRunning(undefined);
    }
  }

  /** Records the editor's pick among the versions of an opening or a closing. */
  async function choose(step: Draft2FunnelStep, candidateId: string) {
    if (!session || choosing || running) return;
    setChoosing({ step, id: candidateId }); setChoiceError(undefined);
    try {
      const response = await fetch(`/api/radar/draft2/${step}?topicId=${encodeURIComponent(topicId)}`, {
        method: "PATCH", cache: "no-store", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, candidateId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not record your choice.");
      setSession(body.session as Draft2SessionView);
    } catch (cause) {
      setChoiceError({ step, message: cause instanceof Error ? cause.message : "Could not record your choice." });
    } finally {
      setChoosing(undefined);
    }
  }

  const host = content ? sourceHost(content.url) : "";
  const words = wordCount(content?.text);
  const text = paragraphs(content?.text);
  const contentReady = content?.contentStatus === "full" || content?.contentStatus === "likely-full";
  // Later steps only start on verified facts, so a session past Facts has them.
  const factsVerified = Boolean(session?.facts) && (session?.step !== "facts" || session?.status === "ready");
  const factsStatus = running === "facts" ? SESSION_STATUS.running : session ? (factsVerified ? SESSION_STATUS.ready : SESSION_STATUS[session.status]) : undefined;
  // A run still marked running whose heartbeat stopped: its request or the server ended, and it can be continued.
  const stalled = !running && session?.opening?.status === "running" && now > 0 && now - Date.parse(session.updatedAt) > OPENING_STALL_MS;
  const openingStatus = running === "opening" ? OPENING_STATUS.running : stalled ? { label: "Stopped", tone: "warning" as const } : session?.opening ? OPENING_STATUS[session.opening.status] : undefined;
  // The focus the opening would follow: decided, not being decided, and free of program findings.
  const focus = session?.focus ?? undefined;
  const focusProblems = focus?.values ? focusFindings(focus.values) : [];
  const focusStalled = !running && focus?.status === "running" && now > 0 && now - Date.parse(session?.updatedAt ?? "") > OPENING_STALL_MS;
  const focusReady = Boolean(focus?.values) && focus?.status !== "running" && focusProblems.length === 0;
  const focusStatus = running === "focus" ? FOCUS_STATUS.running : focusStalled ? { label: "Stopped", tone: "warning" as const }
    : focus?.values && focusProblems.length && focus.status !== "running" ? { label: "Needs a fix", tone: "warning" as const } : focus ? FOCUS_STATUS[focus.status] : undefined;
  // An opening written with another version of the focus, or before the Focus step.
  const openingFocusVersion = session?.opening?.focus?.version;
  const focusChanged = Boolean(session?.opening && focus?.values) && openingFocusVersion !== focus?.version;
  // The closing ends the opening the editor chose (else the judge's winner), once that run has finished and followed a focus.
  const closing = session?.closing ?? undefined;
  const closingStalled = !running && closing?.status === "running" && now > 0 && now - Date.parse(session?.updatedAt ?? "") > OPENING_STALL_MS;
  const closingStatus = running === "closing" ? OPENING_STATUS.running : closingStalled ? { label: "Stopped", tone: "warning" as const } : closing ? OPENING_STATUS[closing.status] : undefined;
  const chosenOpeningId = session?.opening?.editorChoiceId ?? session?.opening?.winnerId;
  const openingFinished = Boolean(session?.opening && chosenOpeningId && session.opening.status !== "running" && session.opening.status !== "paused");
  const closingReady = openingFinished && Boolean(session?.opening?.focus);
  const closingResumable = closing && (closing.status === "paused" || closingStalled) && funnelResumeRound(closing) <= CLOSING_MAX_ROUNDS;
  const closingResumeRound = closingResumable && closing ? funnelResumeRound(closing) : undefined;
  const closingPausedRound = closing?.status === "paused" ? funnelResumeRound(closing) : undefined;
  // A closing written for another opening than the one chosen now.
  const closingOpeningChanged = Boolean(closing?.opening && chosenOpeningId && closing.opening.id !== chosenOpeningId);
  // The deck connects the chosen opening and the closing that ends it, once the closing's run has finished.
  const deck = session?.deck ?? undefined;
  const deckStalled = !running && deck?.status === "running" && now > 0 && now - Date.parse(session?.updatedAt ?? "") > OPENING_STALL_MS;
  const deckStatus = running === "deck" ? OPENING_STATUS.running : deckStalled ? { label: "Stopped", tone: "warning" as const } : deck ? OPENING_STATUS[deck.status] : undefined;
  const chosenClosingId = closing?.editorChoiceId ?? closing?.winnerId;
  const closingFinished = Boolean(closing && chosenClosingId && closing.status !== "running" && closing.status !== "paused");
  const deckReady = closingFinished && !closingOpeningChanged;
  const deckResumable = deck && (deck.status === "paused" || deckStalled) && funnelResumeRound(deck) <= DECK_MAX_ROUNDS;
  const deckResumeRound = deckResumable && deck ? funnelResumeRound(deck) : undefined;
  const deckPausedRound = deck?.status === "paused" ? funnelResumeRound(deck) : undefined;
  // A deck written for another closing or opening than the ones chosen now.
  const deckEndsChanged = Boolean(deck?.closing && deck.opening && ((chosenClosingId && deck.closing.id !== chosenClosingId) || (chosenOpeningId && deck.opening.id !== chosenOpeningId)));
  // People and places: found once the facts are verified; the people Commons matched wait for the editor.
  const inventory = session?.inventory ?? undefined;
  const inventoryStalled = !running && inventory?.status === "running" && now > 0 && now - Date.parse(session?.updatedAt ?? "") > OPENING_STALL_MS;
  const peopleToConfirm = inventory?.entities.filter((entity) => entity.person?.status === "candidates").length ?? 0;
  const inventoryStatus = running === "inventory" ? { label: "Searching", tone: "info" as const } : inventoryStalled ? { label: "Stopped", tone: "warning" as const }
    : inventory?.status === "failed" ? { label: "Failed", tone: "error" as const } : inventory?.status === "ready" ? (peopleToConfirm ? { label: `${peopleToConfirm} to confirm`, tone: "warning" as const } : { label: "Found", tone: "success" as const }) : undefined;
  // The visual script pictures the chosen deck between the chosen opening and closing, once the people and places are found.
  const visual = session?.visual ?? undefined;
  const visualStalled = !running && visual?.status === "running" && now > 0 && now - Date.parse(session?.updatedAt ?? "") > OPENING_STALL_MS;
  const visualStatus = running === "visual" ? OPENING_STATUS.running : visualStalled ? { label: "Stopped", tone: "warning" as const } : visual ? OPENING_STATUS[visual.status] : undefined;
  const chosenDeckId = deck?.editorChoiceId ?? deck?.winnerId;
  const deckFinished = Boolean(deck && chosenDeckId && deck.status !== "running" && deck.status !== "paused");
  const visualReady = deckFinished && !deckEndsChanged && inventory?.status === "ready";
  // A visual script of another deck, or of people and places found or decided since.
  const visualChanged = Boolean(visual?.deckId && ((chosenDeckId && visual.deckId !== chosenDeckId) || (inventory && visual.inventoryVersion !== inventory.version)));
  const visualResumable = visual && (visual.status === "paused" || visualStalled) && funnelResumeRound(visual) <= VISUAL_MAX_ROUNDS;
  // A run that ended unaccepted before the step had its third round takes it, while it still follows the deck and the people and places.
  const visualExtendable = Boolean(visual && !visualChanged && funnelExtendable(visual, visualPlan(visual.carousel ?? []).length));
  const visualResumeRound = (visualResumable || visualExtendable) && visual ? funnelResumeRound(visual) : undefined;
  const visualPausedRound = visual?.status === "paused" ? funnelResumeRound(visual) : undefined;
  const visualDisplay = visualDisplayFor(inventory);
  // The images picture the chosen visual script once its run has finished, while it still follows the deck and the people and places.
  const images = session?.images ?? undefined;
  const imagesStalled = !running && images?.status === "running" && now > 0 && now - Date.parse(session?.updatedAt ?? "") > OPENING_STALL_MS;
  const imagesPending = Boolean(images?.slides.some((slide) => !slideSettled(slide)));
  const imagesResumable = Boolean(images && imagesPending && (images.status === "paused" || images.status === "failed" || imagesStalled));
  const imagesStatus = running === "images" ? { label: "Generating", tone: "info" as const } : imagesStalled ? { label: "Stopped", tone: "warning" as const } : images ? IMAGES_STATUS[images.status] : undefined;
  const chosenVisualId = visual?.editorChoiceId ?? visual?.winnerId;
  const visualFinished = Boolean(visual && chosenVisualId && visual.status !== "running" && visual.status !== "paused");
  const imagesReady = visualFinished && !visualChanged;
  const imagesChanged = Boolean(images && chosenVisualId && images.visualId !== chosenVisualId);
  // The accounts the caption may tag: proposed for the people, places and organizations, checked on Instagram, tagged only once the editor confirms them.
  const mentions = session?.mentions ?? undefined;
  const mentionsStalled = !running && mentions?.status === "running" && now > 0 && now - Date.parse(session?.updatedAt ?? "") > OPENING_STALL_MS;
  const mentionsSearching = mentions?.status === "running" && !mentionsStalled;
  const tagged = confirmedMentions(mentions);
  const mentionsReady = inventory?.status === "ready";
  // The caption accompanies the finished images, while the visual script they picture is still in the session.
  const caption = session?.caption ?? undefined;
  const captionStalled = !running && caption?.status === "running" && now > 0 && now - Date.parse(session?.updatedAt ?? "") > OPENING_STALL_MS;
  const captionStatus = running === "caption" ? OPENING_STATUS.running : captionStalled ? { label: "Stopped", tone: "warning" as const } : caption ? OPENING_STATUS[caption.status] : undefined;
  const imagesFinished = Boolean(images && images.status !== "running" && images.status !== "paused" && images.slides.every((slide) => slideSettled(slide) && shownAttempt(slide)));
  const imagesScriptGone = Boolean(images && !funnelVersions(visual?.rounds ?? []).some((version) => version.candidate.id === images.visualId));
  const captionReady = imagesFinished && !imagesScriptGone;
  const captionResumable = caption && (caption.status === "paused" || captionStalled) && funnelResumeRound(caption) <= CAPTION_MAX_ROUNDS;
  const captionResumeRound = captionResumable && caption ? funnelResumeRound(caption) : undefined;
  const captionPausedRound = caption?.status === "paused" ? funnelResumeRound(caption) : undefined;
  // A caption written for other images, or tagging other accounts, than the ones now.
  const captionImagesChanged = Boolean(caption?.imagesRunId && images && caption.imagesRunId !== images.runId);
  const captionMentionsChanged = Boolean(caption && caption.status !== "running" && !sameMentions(caption.mentions, tagged));
  const captionDisplay = captionDisplayFor(caption);
  // Publish: the carousel as it stands, approved once and copied for v1's publication.
  const publication = session?.publication ?? undefined;
  const { target: publishable, blocker: publishBlocker } = publicationState(session);
  const approvedCurrent = publicationCurrent(publication, publishable);
  const publishStatus = running === "publication" ? { label: "Approving", tone: "info" as const } : approvedCurrent ? { label: "Approved", tone: "success" as const } : publication ? { label: "Changed since", tone: "warning" as const } : undefined;
  const stepStatus: Partial<Record<string, { label: string; tone: StatusTone }>> = { facts: factsStatus, focus: focusStatus, opening: openingStatus, closing: closingStatus, deck: deckStatus, inventory: inventoryStatus, visual: visualStatus, images: imagesStatus, caption: captionStatus, publish: publishStatus };
  const resumable = session?.opening && (session.opening.status === "paused" || stalled) && openingResumeRound(session.opening) <= OPENING_MAX_ROUNDS;
  const resumeRound = resumable && session?.opening ? openingResumeRound(session.opening) : undefined;
  const pausedRound = session?.opening?.status === "paused" ? openingResumeRound(session.opening) : undefined;

  return <main className={styles.shell} style={themeStyle}>
    <div className={styles.topbar}>
      <Link href={back} aria-label="Back to the story">← <span>Story</span></Link>
      <span className={styles.breadcrumb}>{topicName} <span aria-hidden="true">/</span> Production <span aria-hidden="true">/</span> Story <span aria-hidden="true">/</span> Draft 2</span>
    </div>
    {error ? <InlineNotice tone="error" title="Could not open the canvas" className={styles.notice}>{error} <Link href={back}>Back to the story</Link></InlineNotice> : null}
    {!content && !error ? <LoadingState className={styles.notice}>Loading the story…</LoadingState> : null}
    {content ? <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Draft 2 · a new pipeline, built one step at a time</p>
        <h1>{content.title}</h1>
        <p className={styles.meta}>
          {host ? <span>{host}</span> : null}
          <StatusBadge tone={contentReady ? "success" : "warning"}>{contentStatusLabel(content.contentStatus)}</StatusBadge>
          <span>{words.toLocaleString("en-CA")} words</span>
          {content.enrichment?.byline ? <span>{content.enrichment.byline}</span> : null}
          <a href={content.url} target="_blank" rel="noreferrer">Open the original ↗</a>
        </p>
      </header>
      <div className={styles.columns}>
        <Surface className={styles.column} aria-label="Source material">
          <SectionHeader level={3} eyebrow="Source material" title="What the story says" description="The stored text, exactly as every step will read it." />
          {text.length
            ? <div className={styles.reading}>{text.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
            : <EmptyState title="No article text yet">Prepare the content in the studio first; the canvas reads the same stored text.</EmptyState>}
        </Surface>
        <Surface className={styles.column} aria-label="Canvas">
          <SectionHeader level={3} eyebrow="Canvas" title={session?.opening ? "Facts, focus, then the opening" : session?.focus ? "Facts, then the focus" : session ? "Facts first" : "Nothing built yet"} description="Each step is added separately. The current studio keeps working as it does today." />
          <ol className={styles.steps}>
            {DRAFT_2_STEPS.map((step, index) => {
              const status = stepStatus[step.key];
              return <li key={step.key}>
                <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
                <div><strong>{step.title}</strong><p>{step.detail}</p></div>
                {status
                  ? <StatusBadge className={styles.stepStatus} tone={status.tone}>{status.label}</StatusBadge>
                  : <StatusBadge className={styles.stepStatus}>Not started</StatusBadge>}
              </li>;
            })}
          </ol>
          <section className={styles.factsPanel} aria-label="Facts step">
            <div className={styles.factsHeader}>
              <div>
                <p className={styles.eyebrow}>Step 1 · Facts</p>
                <p className={styles.factsIntro}>Sol extracts the facts; Claude checks them against the article; they loop on Claude’s suggestions, at most three extractions.</p>
              </div>
              <Button variant="primary" size="compact" busy={running === "facts"} disabled={!text.length || session === undefined || running !== undefined} onClick={() => { void runStep("facts"); }}>
                {running === "facts" ? "Extracting and verifying…" : session ? "Run the facts again" : "Extract and verify facts"}
              </Button>
            </div>
            {running === "facts" ? <LoadingState>Sol is extracting; Claude reviews each round. This can take a minute or two.</LoadingState> : null}
            {runError?.step === "facts" ? <InlineNotice tone="error" title="The facts step stopped">{runError.message}</InlineNotice> : null}
            {session?.step === "facts" && session.error && running !== "facts" ? <InlineNotice tone={session.status === "failed" ? "error" : "warning"}>{session.error}</InlineNotice> : null}
            {session && running !== "facts" ? <FactsSessionView session={session} verified={factsVerified} /> : null}
          </section>
          <section className={styles.factsPanel} aria-label="Focus step">
            <div className={styles.factsHeader}>
              <div>
                <p className={styles.eyebrow}>Step 2 · Focus</p>
                <p className={styles.factsIntro}>Claude reads the verified facts, the Topic’s creative profile and its editorial lines, and decides what the story is for: the line it serves, its audience, framing, reader consequence, structure, goal, voice and direction. Change any field; your changes stay yours when Claude decides again, and the opening follows the result.</p>
              </div>
              <Button variant="primary" size="compact" busy={running === "focus"} disabled={!factsVerified || running !== undefined || savingFocus !== undefined} onClick={() => { void runStep("focus"); }}>
                {running === "focus" ? "Deciding…" : focus?.values ? "Decide again" : "Decide the focus"}
              </Button>
            </div>
            {!factsVerified && !running ? <p className={styles.factMeta}>The focus builds only on verified facts; verify them first.</p> : null}
            {running === "focus" ? <LoadingState>Claude is deciding the focus{focus?.edited.length ? `, keeping your ${focus.edited.length === 1 ? "change" : `${focus.edited.length} changes`}` : ""}. This can take a minute.</LoadingState> : null}
            {focusStalled ? <InlineNotice tone="warning" title="This decision stopped">Its request or the server ended before Claude answered. Decide the focus again.</InlineNotice> : null}
            {runError?.step === "focus" ? <InlineNotice tone="error" title="The focus step stopped">{runError.message}</InlineNotice> : null}
            {focus?.status === "failed" && focus.error && running !== "focus" ? <InlineNotice tone="error" title="The last decision failed">{focus.error}{focus.values ? " The focus below is the one from before it." : ""}</InlineNotice> : null}
            {focusError ? <InlineNotice tone="error" title="Your change was not saved">{focusError}</InlineNotice> : null}
            {focus?.values && running !== "focus" ? <FocusView
              focus={focus}
              findings={focusProblems}
              saving={savingFocus}
              locked={running !== undefined || savingFocus !== undefined}
              onSave={(field, value) => { void saveFocus(field, { value }); }}
              onReset={(field) => { void saveFocus(field, { reset: true }); }}
            /> : null}
          </section>
          <section className={styles.factsPanel} aria-label="Opening step">
            <div className={styles.factsHeader}>
              <div>
                <p className={styles.eyebrow}>Step 3 · Opening</p>
                <p className={styles.factsIntro}>{TODAY.writer} writes fifteen openings (cover and slide 2) from the verified facts, following the focus; {TODAY.judge} scores them and proposes three of its own. {TODAY.writer} revises the three best and edits {TODAY.judge}’s proposals, which also compete as {TODAY.judge} wrote them; {TODAY.judge} scores all nine without knowing which are its own, and proposes one more, which competes the same way beside {TODAY.writer}’s two best for {TODAY.judge}’s final pick. The better version always stays, and an opening that says what the facts do not never wins. Accepted at 95/100 with no criterion below 85, how well it follows the focus included.</p>
              </div>
              <ActionRow>
                {resumeRound && !running ? <Button variant="secondary" size="compact" onClick={() => { void runStep("opening", { continuing: true }); }}>Continue from round {resumeRound}</Button> : null}
                <Button variant="primary" size="compact" busy={running === "opening"} disabled={!factsVerified || !focusReady || running !== undefined || savingFocus !== undefined} onClick={() => { void runStep("opening"); }}>
                  {running === "opening" ? "Writing and judging…" : session?.opening ? "Write the opening again" : "Write the opening"}
                </Button>
              </ActionRow>
            </div>
            {!factsVerified && !running ? <p className={styles.factMeta}>The opening builds only on verified facts; verify them first.</p> : null}
            {factsVerified && !focusReady && !running ? <p className={styles.factMeta}>{focus?.values && focus.status !== "running" ? "The opening waits until the focus is fixed (see the notes above)." : "The opening follows the story’s focus; decide it first."}</p> : null}
            {focusChanged && running !== "opening" && focus ? <InlineNotice tone="info" title="The focus changed">{openingFocusVersion ? `This opening followed focus v${openingFocusVersion}; the focus is now v${focus.version}.` : "This opening was written before the Focus step."} Write it again to follow the focus as it stands.</InlineNotice> : null}
            {running === "opening" ? <LoadingState>{following ? `${following} Following the run on the server…` : pausedRound ? `Continuing with round ${pausedRound} in a new request…` : `${TODAY.writer} writes fifteen openings; ${TODAY.judge} judges each round. This can take a few minutes.`}</LoadingState> : null}
            {stalled && session ? <InlineNotice tone="warning" title="This run stopped">It has not answered since {new Date(session.updatedAt).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })}: its request or the server ended. Continue from round {resumeRound} picks it up at its last checkpoint; a round already written is judged, not written again.</InlineNotice> : null}
            {runError?.step === "opening" ? <InlineNotice tone="error" title="The opening step stopped">{runError.message}</InlineNotice> : null}
            {session?.step === "opening" && session.error && running !== "opening" ? <InlineNotice tone={session.status === "failed" ? "error" : "warning"}>{session.error}</InlineNotice> : null}
            {choiceError?.step === "opening" ? <InlineNotice tone="error" title="Your choice was not saved">{choiceError.message}</InlineNotice> : null}
            {session?.opening && running !== "opening" ? <FunnelRunView
              run={session.opening}
              display={OPENING_DISPLAY}
              choosing={choosing?.step === "opening" ? choosing.id : undefined}
              locked={running !== undefined || session.opening.status === "running"}
              onChoose={(candidateId) => { void choose("opening", candidateId); }}
            /> : null}
          </section>
          <section className={styles.factsPanel} aria-label="Closing step">
            <div className={styles.factsHeader}>
              <div>
                <p className={styles.eyebrow}>Step 4 · Closing</p>
                <p className={styles.factsIntro}>{TODAY.writer} writes eight endings for the opening you chose, following the focus that opening followed. For an arc, the penultimate slide pays the cover’s promise in full and the last says what it means for the reader, with the one call to action the focus’s goal asks for, in the publication’s call-to-action style; for a list or steps, the last slide alone, with the plan or the result. {TODAY.judge} scores them and proposes two of its own; {TODAY.writer} revises the two best and edits {TODAY.judge}’s proposals, which also compete as {TODAY.judge} wrote them, for {TODAY.judge}’s pick. Accepted at 95/100 with no criterion below 85.</p>
              </div>
              <ActionRow>
                {closingResumeRound && !running ? <Button variant="secondary" size="compact" onClick={() => { void runStep("closing", { continuing: true }); }}>Continue from round {closingResumeRound}</Button> : null}
                <Button variant="primary" size="compact" busy={running === "closing"} disabled={!factsVerified || !closingReady || running !== undefined || savingFocus !== undefined} onClick={() => { void runStep("closing"); }}>
                  {running === "closing" ? "Writing and judging…" : closing ? "Write the closing again" : "Write the closing"}
                </Button>
              </ActionRow>
            </div>
            {factsVerified && !closingReady && !running ? <p className={styles.factMeta}>{openingFinished ? "The opening was written before the Focus step; write it again first." : "The closing ends the opening you choose; finish the opening first."}</p> : null}
            {closingOpeningChanged && running !== "closing" && closing?.opening ? <InlineNotice tone="info" title="The opening changed">This closing ends {closing.opening.id}; the opening chosen now is {chosenOpeningId}. Write the closing again to end it.</InlineNotice> : null}
            {running === "closing" ? <LoadingState>{following ? `${following} Following the run on the server…` : closingPausedRound ? `Continuing with round ${closingPausedRound} in a new request…` : `${TODAY.writer} writes eight endings; ${TODAY.judge} judges each round. This can take a few minutes.`}</LoadingState> : null}
            {closingStalled && session ? <InlineNotice tone="warning" title="This run stopped">It has not answered since {new Date(session.updatedAt).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })}: its request or the server ended. Continue from round {closingResumeRound} picks it up at its last checkpoint; a round already written is judged, not written again.</InlineNotice> : null}
            {runError?.step === "closing" ? <InlineNotice tone="error" title="The closing step stopped">{runError.message}</InlineNotice> : null}
            {session?.step === "closing" && session.error && running !== "closing" ? <InlineNotice tone={session.status === "failed" ? "error" : "warning"}>{session.error}</InlineNotice> : null}
            {choiceError?.step === "closing" ? <InlineNotice tone="error" title="Your choice was not saved">{choiceError.message}</InlineNotice> : null}
            {closing && running !== "closing" ? <FunnelRunView
              run={closing}
              display={CLOSING_DISPLAY}
              choosing={choosing?.step === "closing" ? choosing.id : undefined}
              locked={running !== undefined || closing.status === "running"}
              onChoose={(candidateId) => { void choose("closing", candidateId); }}
            /> : null}
          </section>
          <section className={styles.factsPanel} aria-label="Deck step">
            <div className={styles.factsHeader}>
              <div>
                <p className={styles.eyebrow}>Step 5 · Deck</p>
                <p className={styles.factsIntro}>{TODAY.writer} writes the slides between slide 2 and the closing you chose, one idea each, so the carousel reads as one story: for an arc, four decks of two to five slides; for a list or steps, two decks with the items slide 2 did not cover, one per slide, in order. {TODAY.judge} scores them and proposes a deck of its own; {TODAY.writer} revises the best, touching only the slides the issues name, and edits {TODAY.judge}’s deck, which also competes as {TODAY.judge} wrote it, for {TODAY.judge}’s pick. Accepted at 95/100 with no criterion below 85.</p>
              </div>
              <ActionRow>
                {deckResumeRound && !running ? <Button variant="secondary" size="compact" onClick={() => { void runStep("deck", { continuing: true }); }}>Continue from round {deckResumeRound}</Button> : null}
                <Button variant="primary" size="compact" busy={running === "deck"} disabled={!factsVerified || !deckReady || running !== undefined || savingFocus !== undefined} onClick={() => { void runStep("deck"); }}>
                  {running === "deck" ? "Writing and judging…" : deck ? "Write the deck again" : "Write the deck"}
                </Button>
              </ActionRow>
            </div>
            {factsVerified && !deckReady && !running ? <p className={styles.factMeta}>{closingOpeningChanged ? "The closing ends another opening than the one chosen now; write the closing again first." : "The deck leads to the closing you choose; finish the closing first."}</p> : null}
            {deckEndsChanged && running !== "deck" ? <InlineNotice tone="info" title="The opening or the closing changed">This deck connects {deck?.opening?.id} and {deck?.closing?.id}; the ones chosen now are {chosenOpeningId} and {chosenClosingId}. Write the deck again to connect them.</InlineNotice> : null}
            {running === "deck" ? <LoadingState>{following ? `${following} Following the run on the server…` : deckPausedRound ? `Continuing with round ${deckPausedRound} in a new request…` : `${TODAY.writer} writes the decks; ${TODAY.judge} judges each round. This can take a few minutes.`}</LoadingState> : null}
            {deckStalled && session ? <InlineNotice tone="warning" title="This run stopped">It has not answered since {new Date(session.updatedAt).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })}: its request or the server ended. Continue from round {deckResumeRound} picks it up at its last checkpoint; a round already written is judged, not written again.</InlineNotice> : null}
            {runError?.step === "deck" ? <InlineNotice tone="error" title="The deck step stopped">{runError.message}</InlineNotice> : null}
            {session?.step === "deck" && session.error && running !== "deck" ? <InlineNotice tone={session.status === "failed" ? "error" : "warning"}>{session.error}</InlineNotice> : null}
            {choiceError?.step === "deck" ? <InlineNotice tone="error" title="Your choice was not saved">{choiceError.message}</InlineNotice> : null}
            {deck && running !== "deck" ? <FunnelRunView
              run={deck}
              display={DECK_DISPLAY}
              choosing={choosing?.step === "deck" ? choosing.id : undefined}
              locked={running !== undefined || deck.status === "running"}
              onChoose={(candidateId) => { void choose("deck", candidateId); }}
            /> : null}
          </section>
          <section className={styles.factsPanel} aria-label="People and places step">
            <div className={styles.factsHeader}>
              <div>
                <p className={styles.eyebrow}>Step 6 · People and places</p>
                <p className={styles.factsIntro}>Claude lists the people, places and organizations the verified facts name; the program looks them up as v1 does. A person is never generated: if Commons has a licensed photo of them and you confirm it is them, it can appear as a documentary portrait, pasted unchanged. A place appears only through its verified photo or map, within the Topic’s geo scope: Wikidata first, then Google Maps for the map when Wikidata has no match. When a lookup finds nothing, give the person or place one of the story’s photos: upload it, or find it on Commons under another name. Organizations are never drawn. You also say whether the brand’s characters may narrate.</p>
              </div>
              <Button variant="primary" size="compact" busy={running === "inventory"} disabled={!factsVerified || running !== undefined || savingInventory !== undefined} onClick={() => { void runStep("inventory"); }}>
                {running === "inventory" ? "Searching…" : inventory ? "Search again" : "Find people and places"}
              </Button>
            </div>
            {!factsVerified && !running ? <p className={styles.factMeta}>People and places are found only in verified facts; verify them first.</p> : null}
            {running === "inventory" ? <LoadingState>Claude lists who and where; Wikidata, Commons, Openverse and Google Maps are checked for each. This can take a minute or two.</LoadingState> : null}
            {inventoryStalled ? <InlineNotice tone="warning" title="This search stopped">Its request or the server ended before it finished. Search again.</InlineNotice> : null}
            {runError?.step === "inventory" ? <InlineNotice tone="error" title="The search stopped">{runError.message}</InlineNotice> : null}
            {inventory?.status === "failed" && inventory.error && running !== "inventory" ? <InlineNotice tone="error" title="The last search failed">{inventory.error}</InlineNotice> : null}
            {inventoryError ? <InlineNotice tone="error" title="Your decision was not saved">{inventoryError}</InlineNotice> : null}
            {inventory && inventory.status !== "running" && running !== "inventory" ? <InventoryView
              inventory={inventory}
              story={{ topicId, storyId, secret }}
              saving={savingInventory}
              locked={running !== undefined || savingInventory !== undefined}
              onDecide={(input) => { void decideInventory(input); }}
            /> : null}
          </section>
          <section className={styles.factsPanel} aria-label="Visual script step">
            <div className={styles.factsHeader}>
              <div>
                <p className={styles.eyebrow}>Step 7 · Visual script</p>
                <p className={styles.factsIntro}>{TODAY.writer} writes the carousel’s images as one visual story, in the brand’s identity: a concept, a recurring cast, a motif that evolves from slide to slide and, for each slide, the beat its image adds (never its words again), a reproducible art direction and the verified material or characters it uses. {TODAY.judge} scores three scripts (two for a carousel of more than ten slides) and proposes one of its own; {TODAY.writer} revises the best and edits {TODAY.judge}’s, which also competes as {TODAY.judge} wrote it; a third round revises the best once more, for {TODAY.judge}’s pick. Accepted at 95/100 with no criterion below 85. The images themselves come in a later step.</p>
              </div>
              <ActionRow>
                {visualResumeRound && !running ? <Button variant="secondary" size="compact" onClick={() => { void runStep("visual", { continuing: true }); }}>{visualExtendable ? `Continue with round ${visualResumeRound}` : `Continue from round ${visualResumeRound}`}</Button> : null}
                <Button variant="primary" size="compact" busy={running === "visual"} disabled={!factsVerified || !visualReady || running !== undefined || savingInventory !== undefined} onClick={() => { void runStep("visual"); }}>
                  {running === "visual" ? "Writing and judging…" : visual ? "Write the visual script again" : "Write the visual script"}
                </Button>
              </ActionRow>
            </div>
            {factsVerified && !visualReady && !running ? <p className={styles.factMeta}>{!deckFinished ? "The visual script pictures the whole carousel; finish the deck first." : deckEndsChanged ? "The deck connects another opening or closing than the ones chosen now; write the deck again first." : "Find the people and places first: the script shows only what is verified."}</p> : null}
            {visualExtendable && visual && !running ? <p className={styles.factMeta}>This run ended after {visual.rounds.length} rounds, before the visual script had a third. Continue with round {visualResumeRound} revises its best version once more against Sol’s remaining issues: one write and one judgment.</p> : null}
            {peopleToConfirm && visualReady && !running ? <p className={styles.factMeta}>{peopleToConfirm} {peopleToConfirm === 1 ? "person waits" : "people wait"} for your confirmation; until then the script tells the story without showing them.</p> : null}
            {visualChanged && running !== "visual" ? <InlineNotice tone="info" title="The deck or the people and places changed">This script pictures {visual?.deckId} with people and places v{visual?.inventoryVersion}; the deck chosen now is {chosenDeckId} and the people and places are v{inventory?.version}. Write the visual script again to follow them.</InlineNotice> : null}
            {running === "visual" ? <LoadingState>{following ? `${following} Following the run on the server…` : visualPausedRound ? `Continuing with round ${visualPausedRound} in a new request…` : `${TODAY.writer} writes the scripts; ${TODAY.judge} judges each round. This can take a few minutes.`}</LoadingState> : null}
            {visualStalled && session ? <InlineNotice tone="warning" title="This run stopped">It has not answered since {new Date(session.updatedAt).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })}: its request or the server ended. Continue from round {visualResumeRound} picks it up at its last checkpoint; a round already written is judged, not written again.</InlineNotice> : null}
            {runError?.step === "visual" ? <InlineNotice tone="error" title="The visual script stopped">{runError.message}</InlineNotice> : null}
            {session?.step === "visual" && session.error && running !== "visual" ? <InlineNotice tone={session.status === "failed" ? "error" : "warning"}>{session.error}</InlineNotice> : null}
            {choiceError?.step === "visual" ? <InlineNotice tone="error" title="Your choice was not saved">{choiceError.message}</InlineNotice> : null}
            {visual && running !== "visual" ? <FunnelRunView
              run={visual}
              display={visualDisplay}
              choosing={choosing?.step === "visual" ? choosing.id : undefined}
              locked={running !== undefined || visual.status === "running"}
              onChoose={(candidateId) => { void choose("visual", candidateId); }}
            /> : null}
          </section>
          <section className={styles.factsPanel} aria-label="Images step">
            <div className={styles.factsHeader}>
              <div>
                <p className={styles.eyebrow}>Step 8 · Images</p>
                <p className={styles.factsIntro}>GPT Image makes each slide from the chosen visual script and the brand’s identity, and letters the slide’s words itself; the page number and the logo are added afterwards where the brand puts them, and a verified photo or map is pasted unchanged. {TODAY.judge} reviews each image: the words as they appear, what covers them, real people, other brands’ logos, what the brand avoids and the facts. A slide it flags is corrected once, from its image before the logo and the page number. Low quality, three calls a slide at most.</p>
              </div>
              <ActionRow>
                {imagesResumable && !running ? <Button variant="secondary" size="compact" onClick={() => { void runStep("images", { continuing: true }); }}>Continue</Button> : null}
                <Button variant="primary" size="compact" busy={running === "images"} disabled={!factsVerified || !imagesReady || running !== undefined || savingImage !== undefined} onClick={() => { void runStep("images"); }}>
                  {running === "images" ? "Making the images…" : images ? "Make the images again" : "Make the images"}
                </Button>
              </ActionRow>
            </div>
            {factsVerified && !imagesReady && !running ? <p className={styles.factMeta}>{!visualFinished ? "The images picture the visual script; finish it first." : "The deck or the people and places changed since the visual script; write the visual script again first."}</p> : null}
            {imagesChanged && running !== "images" ? <InlineNotice tone="info" title="The visual script changed">These images picture {images?.visualId}; the visual script chosen now is {chosenVisualId}. Make the images again to follow it.</InlineNotice> : null}
            {running === "images" ? <LoadingState>{following ? `${following} Following the run on the server…` : images?.status === "paused" ? "Continuing in a new request while fal works…" : `GPT Image makes the slides; ${TODAY.judge} reviews each one. This can take a few minutes.`}</LoadingState> : null}
            {imagesStalled && session ? <InlineNotice tone="warning" title="This run stopped">It has not answered since {new Date(session.updatedAt).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })}: its request or the server ended. Continue picks it up; an image already asked for is not asked for again.</InlineNotice> : null}
            {runError?.step === "images" ? <InlineNotice tone="error" title="The images stopped">{runError.message}</InlineNotice> : null}
            {session?.step === "images" && session.error && running !== "images" ? <InlineNotice tone={session.status === "failed" ? "error" : "warning"}>{session.error}</InlineNotice> : null}
            {imageError ? <InlineNotice tone="error" title="Your decision was not saved">{imageError}</InlineNotice> : null}
            {images && session && running !== "images" ? <ImagesView images={images} story={{ topicId, sessionId: session.id, secret }} saving={savingImage} locked={running !== undefined || savingImage !== undefined} onDecide={(input) => { void decideImage(input); }} /> : null}
          </section>
          <section className={styles.factsPanel} aria-label="Caption step">
            <div className={styles.factsHeader}>
              <div>
                <p className={styles.eyebrow}>Step 9 · Caption</p>
                <p className={styles.factsIntro}>The post’s text for the finished carousel, in the publication’s voice: an opening line that stops the reader, short lines with blank lines between them, the emojis the brand allows, the closing’s one call to action, the accounts you tag below and 5 to 8 hashtags at the end. The program adds the photo credits after the text. {TODAY.writer} writes three captions; {TODAY.judge} scores them and proposes one of its own; {TODAY.writer} revises the best and edits {TODAY.judge}’s, which also competes as {TODAY.judge} wrote it, for {TODAY.judge}’s pick. Accepted at 95/100 with no criterion below 85.</p>
              </div>
              <ActionRow>
                {captionResumeRound && !running ? <Button variant="secondary" size="compact" onClick={() => { void runStep("caption", { continuing: true }); }}>Continue from round {captionResumeRound}</Button> : null}
                <Button variant="primary" size="compact" busy={running === "caption"} disabled={!factsVerified || !captionReady || running !== undefined || savingMention !== undefined || mentionsSearching} onClick={() => { void runStep("caption"); }}>
                  {running === "caption" ? "Writing and judging…" : caption ? "Write the caption again" : "Write the caption"}
                </Button>
              </ActionRow>
            </div>
            {factsVerified && !captionReady && !running ? <p className={styles.factMeta}>{imagesScriptGone ? "The visual script these images picture is no longer in the session; make the images again first." : "The caption accompanies the finished carousel; finish the images first, with an image on every slide."}</p> : null}
            <div className={styles.openingGroup}>
              <div className={styles.factsHeader}>
                <SectionHeader level={3} title="Accounts to tag" description="Claude proposes the Instagram accounts of the story’s people, places and organizations; Instagram says which exist and what they are called; only the accounts you tag reach the caption. On Facebook an @username stays plain text." />
                <Button variant="secondary" size="compact" busy={running === "mentions"} disabled={!factsVerified || !mentionsReady || running !== undefined || savingMention !== undefined || mentionsSearching} onClick={() => { void runStep("mentions"); }}>
                  {running === "mentions" ? "Finding…" : mentions ? "Find again" : "Find accounts to tag"}
                </Button>
              </div>
              {factsVerified && !mentionsReady && !running ? <p className={styles.factMeta}>The accounts are those of the people and places; find them first (step 6).</p> : null}
              {running === "mentions" ? <LoadingState>Claude proposes the accounts; each one is checked on Instagram. This can take a minute.</LoadingState> : null}
              {mentionsStalled ? <InlineNotice tone="warning" title="This search stopped">Its request or the server ended before it finished. Find the accounts again.</InlineNotice> : null}
              {runError?.step === "mentions" ? <InlineNotice tone="error" title="The search stopped">{runError.message}</InlineNotice> : null}
              {mentions?.status === "failed" && mentions.error && running !== "mentions" ? <InlineNotice tone="error" title="The last search failed">{mentions.error}</InlineNotice> : null}
              {mentionError ? <InlineNotice tone="error" title="Your decision was not saved">{mentionError}</InlineNotice> : null}
              {inventory && running !== "mentions" && !mentionsSearching ? <MentionsView mentions={mentions} entities={mentionEntities(inventory)} saving={savingMention} locked={running !== undefined || savingMention !== undefined} onDecide={decideMention} /> : null}
            </div>
            {captionImagesChanged && running !== "caption" ? <InlineNotice tone="info" title="The images changed">This caption was written for an earlier images run. Write it again for the images as they are now.</InlineNotice> : null}
            {captionMentionsChanged && !captionImagesChanged && running !== "caption" ? <InlineNotice tone="info" title="The accounts to tag changed">This caption tags {caption?.mentions?.length ? listed(caption.mentions.map((mention) => mention.handle)) : "no account"}; you tag {tagged.length ? listed(tagged.map((mention) => mention.handle)) : "none"} now. Write it again to tag them.</InlineNotice> : null}
            {running === "caption" ? <LoadingState>{following ? `${following} Following the run on the server…` : captionPausedRound ? `Continuing with round ${captionPausedRound} in a new request…` : `${TODAY.writer} writes three captions; ${TODAY.judge} judges each round. This can take a few minutes.`}</LoadingState> : null}
            {captionStalled && session ? <InlineNotice tone="warning" title="This run stopped">It has not answered since {new Date(session.updatedAt).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })}: its request or the server ended. Continue from round {captionResumeRound} picks it up at its last checkpoint; a round already written is judged, not written again.</InlineNotice> : null}
            {runError?.step === "caption" ? <InlineNotice tone="error" title="The caption step stopped">{runError.message}</InlineNotice> : null}
            {session?.step === "caption" && session.error && running !== "caption" ? <InlineNotice tone={session.status === "failed" ? "error" : "warning"}>{session.error}</InlineNotice> : null}
            {choiceError?.step === "caption" ? <InlineNotice tone="error" title="Your choice was not saved">{choiceError.message}</InlineNotice> : null}
            {caption && running !== "caption" ? <FunnelRunView
              run={caption}
              display={captionDisplay}
              choosing={choosing?.step === "caption" ? choosing.id : undefined}
              locked={running !== undefined || caption.status === "running"}
              onChoose={(candidateId) => { void choose("caption", candidateId); }}
            /> : null}
          </section>
          <section className={styles.factsPanel} aria-label="Publish step">
            <div className={styles.factsHeader}>
              <div>
                <p className={styles.eyebrow}>Step 10 · Publish</p>
                <p className={styles.factsIntro}>You approve the carousel as it stands: each slide’s image and the chosen caption, with its credits and hashtags. v1’s publication then freezes it as one exact package and publishes it to the Topic’s Facebook Page, its Instagram account, or both at once, with its queue, retries and links to the posts. Nothing is published until you confirm the exact post. A carousel publishes 2 to 10 images.</p>
              </div>
              <Button variant="primary" size="compact" busy={running === "publication"} disabled={!publishable || approvedCurrent || running !== undefined || Boolean(publishable?.issues.length && !acknowledged)} onClick={() => { void approvePublication(); }}>
                {running === "publication" ? "Approving…" : approvedCurrent ? "Approved" : publication ? "Approve it again" : "Approve for publishing"}
              </Button>
            </div>
            {factsVerified && !running && !caption ? <p className={styles.factMeta}>The post needs its caption; write it first.</p> : null}
            {factsVerified && !running && publishBlocker ? <p className={styles.factMeta}>{publishBlocker}</p> : null}
            {publication && !approvedCurrent && publishable && running !== "publication" ? <InlineNotice tone="info" title="The carousel changed since you approved it">The approved copy is the one from {new Date(publication.approvedAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}. Approve it again to publish the carousel as it stands now; what was already published stays as it is.</InlineNotice> : null}
            {runError?.step === "publication" ? <InlineNotice tone="error" title="The carousel was not approved">{runError.message}</InlineNotice> : null}
            {publishable ? <PublishPreview target={publishable} approved={approvedCurrent} acknowledged={acknowledged} locked={running !== undefined} onAcknowledge={setAcknowledged} /> : null}
            {publication && approvedCurrent ? <PublishedCopy publication={publication} topicId={topicId} secret={secret} locked={running !== undefined} approving={running === "publication"} onApprove={() => { void approvePublication(publication.acknowledgedIssues.length > 0); }} /> : null}
          </section>
          {session?.trace.length && !running ? <details className={styles.trace}>
            <summary>{session.trace.length} provider {session.trace.length === 1 ? "call" : "calls"}</summary>
            <ol className={styles.traceList}>
              {session.trace.map((entry, index) => <li key={index} data-outcome={entry.outcome}>
                <span>{providerLabel(entry.provider)} · {entry.model} · {entry.operation} · {entry.step} round {entry.round}</span>
                <span>{traceUsageLine(entry)}</span>
              </li>)}
            </ol>
          </details> : null}
        </Surface>
      </div>
    </div> : null}
  </main>;
}

function FactsSessionView({ session, verified }: { session: Draft2SessionView; verified: boolean }) {
  return <>
    {session.rounds.length ? <ol className={styles.roundList} aria-label="Rounds">
      {session.rounds.map((round) => <li key={round.round} className={styles.roundCard}>
        <div className={styles.factHead}>
          <strong>Round {round.round}</strong>
          <span>Sol extracted {round.facts.length} {round.facts.length === 1 ? "fact" : "facts"}</span>
          {round.evaluation
            ? <StatusBadge tone={round.evaluation.verdict === "valid" && round.mechanical.length === 0 ? "success" : "warning"}>Claude: {round.evaluation.verdict} · {round.evaluation.score}/100</StatusBadge>
            : <StatusBadge tone="neutral">Claude did not answer</StatusBadge>}
        </div>
        {round.restored?.length ? <p className={styles.factMeta}>Sol dropped {round.restored.length} valid {round.restored.length === 1 ? "fact" : "facts"} without a reason ({round.restored.join(", ")}); the program put them back before the review.</p> : null}
        {round.evaluation ? <p className={styles.factMeta}>{round.evaluation.summary}</p> : null}
        {round.mechanical.length || round.evaluation?.issues.length ? <ul className={styles.issueList}>
          {round.mechanical.map((issue, index) => <li key={`m${index}`}><strong>Program · {issue.code}</strong>{issue.factId ? ` · ${issue.factId}` : ""}: {issue.detail}</li>)}
          {(round.evaluation?.issues ?? []).map((issue, index) => <li key={`r${index}`}><strong>{issue.code}</strong>{issue.factId ? ` · ${issue.factId}` : ""}: {issue.detail}</li>)}
        </ul> : null}
        {round.evaluation?.suggestions.length ? <details><summary>{round.evaluation.suggestions.length} {round.evaluation.suggestions.length === 1 ? "suggestion" : "suggestions"} for the next pass</summary>
          <ul className={styles.issueList}>{round.evaluation.suggestions.map((suggestion, index) => <li key={index}>{suggestion}</li>)}</ul>
        </details> : null}
      </li>)}
    </ol> : null}
    {session.facts?.length ? <div>
      <SectionHeader level={3} title={`${session.facts.length} facts`} description={verified ? "Verified: the next steps build only on these." : "The latest list; not verified yet."} />
      <ol className={styles.factList}>
        {session.facts.map((fact) => <li key={fact.id} className={styles.factItem}>
          <div className={styles.factHead}>
            <span className={styles.factId}>{fact.id}</span>
            <StatusBadge tone={FACT_STATUS[fact.status].tone}>{FACT_STATUS[fact.status].label}</StatusBadge>
            <span className={styles.factMeta}>{fact.kind} · importance {fact.importance}</span>
          </div>
          <p className={styles.factClaim}>{fact.claim}</p>
          {fact.qualifier || fact.attribution ? <p className={styles.factMeta}>{[
            fact.qualifier,
            // "according to X" already names the source; do not say it twice.
            fact.attribution && !fact.qualifier?.toLowerCase().includes(fact.attribution.toLowerCase()) ? `attributed to ${fact.attribution}` : undefined,
          ].filter(Boolean).join(" · ")}</p> : null}
          <details><summary>Evidence</summary><blockquote>{fact.evidence}</blockquote></details>
        </li>)}
      </ol>
    </div> : null}
  </>;
}

/** What a funnel step shows of its runs: its names, its gate and criteria, and how its candidates read. */
type FunnelDisplay<C extends FunnelCandidate> = {
  noun: string;
  plural: string;
  gate: FunnelGate;
  labels: Record<string, string>;
  /** A version in the list of every version: its main line and the lines under it. */
  lines: (candidate: C) => { title: string; details: string[] };
  /** One of the judge's proposals, in one line. */
  proposal: (candidate: C) => string;
  /** The chosen version, as the slides it will be; the run says what it connects (the deck shows the whole carousel). */
  cards: (candidate: C, run: FunnelRun<C, FunnelScore, FunnelIssue> & Partial<Pick<Draft2Deck, "opening" | "closing">> & Partial<Pick<Draft2Visual, "carousel" | "characters">>) => ReactNode;
};

const OPENING_DISPLAY: FunnelDisplay<Draft2OpeningCandidate> = {
  noun: "opening",
  plural: "openings",
  gate: OPENING_GATE,
  labels: CRITERION_LABEL,
  lines: (candidate) => ({ title: candidate.cover.headline, details: [candidate.cover.subheadline, `Slide 2 · ${candidate.slide2.headline}`] }),
  proposal: (candidate) => `${candidate.cover.headline} · slide 2: ${candidate.slide2.headline}`,
  cards: (candidate) => <div className={styles.openingCards}>
    <SlideCard label="Cover" headline={candidate.cover.headline} text={candidate.cover.subheadline} factIds={candidate.cover.factIds} />
    <SlideCard label="Slide 2" headline={candidate.slide2.headline} text={candidate.slide2.body} factIds={candidate.slide2.factIds} />
  </div>,
};

const DECK_DISPLAY: FunnelDisplay<Draft2DeckCandidate> = {
  noun: "deck",
  plural: "decks",
  gate: DECK_GATE,
  labels: DECK_CRITERION_LABEL,
  lines: (candidate) => ({ title: candidate.slides[0]?.headline ?? "", details: [`${candidate.slides.length} ${candidate.slides.length === 1 ? "slide" : "slides"}: ${candidate.slides.map((slide) => slide.headline).join(" / ")}`] }),
  proposal: (candidate) => candidate.slides.map((slide) => slide.headline).join(" / "),
  cards: (candidate, run) => <div className={styles.carouselCards}>
    {run.opening ? <SlideCard label="Cover" headline={run.opening.cover.headline} text={run.opening.cover.subheadline} factIds={run.opening.cover.factIds} quiet /> : null}
    {run.opening ? <SlideCard label="Slide 2" headline={run.opening.slide2.headline} text={run.opening.slide2.body} factIds={run.opening.slide2.factIds} quiet /> : null}
    {candidate.slides.map((slide, index) => <SlideCard key={index} label={`Slide ${index + 3} · deck`} headline={slide.headline} text={slide.body} practical={slide.practical || undefined} factIds={slide.factIds} />)}
    {run.closing?.penultimate ? <SlideCard label="Penultimate" headline={run.closing.penultimate.headline} text={run.closing.penultimate.body} factIds={run.closing.penultimate.factIds} quiet /> : null}
    {run.closing ? <SlideCard label="Last slide" headline={run.closing.last.headline} text={run.closing.last.body} cta={run.closing.last.cta || undefined} factIds={run.closing.last.factIds} quiet /> : null}
  </div>,
};

/** The visual script's display: each slide's words beside its beat and direction; reference ids read as the names of the people and places they stand for. */
function visualDisplayFor(inventory: Draft2Inventory | undefined): FunnelDisplay<Draft2VisualCandidate> {
  const nameOf = (id: string) => inventory?.entities.find((entity) => entity.id === id)?.name ?? inventory?.storyPhotos.find((photo) => photo.id === id)?.name ?? id;
  return {
    noun: "visual script",
    plural: "visual scripts",
    gate: VISUAL_GATE,
    labels: VISUAL_CRITERION_LABEL,
    lines: (candidate) => ({
      title: candidate.concept,
      details: [...(candidate.protagonist ? [`Protagonist · ${candidate.protagonist}`] : []), `Motif · ${candidate.motif}`, `Cast · ${candidate.cast}`, candidate.characterPlan.use ? `Character narrates · ${candidate.characterPlan.role}` : "No brand character"],
    }),
    proposal: (candidate) => candidate.concept,
    cards: (candidate, run) => <div className={styles.visualBody}>
      <p className={styles.factClaim}>{candidate.concept}</p>
      {candidate.protagonist ? <p className={styles.factMeta}>Protagonist · {candidate.protagonist}</p> : null}
      <p className={styles.factMeta}>Motif · {candidate.motif}</p>
      <p className={styles.factMeta}>Cast · {candidate.cast}</p>
      <p className={styles.factMeta}>{candidate.characterPlan.use
        ? `Narrated by ${candidate.characterPlan.characterIds.map((id) => run.characters?.find((character) => character.id === id)?.name ?? id).join(" and ")}: ${candidate.characterPlan.role}`
        : "No brand character narrates."}</p>
      <ol className={styles.carouselCards}>
        {candidate.slides.map((slide) => {
          const words = run.carousel?.find((entry) => entry.slide === slide.slide);
          return <li key={slide.slide} className={styles.visualSlide}>
            <div className={styles.factHead}>
              <strong>{words?.label ?? slide.slide}</strong>
              <StatusBadge tone={slide.need === "real-photo" || slide.need === "verified-map" ? "info" : "neutral"}>{NEED_LABEL[slide.need] ?? slide.need}</StatusBadge>
              {slide.shot ? <span className={styles.factMeta}>{SHOT_LABEL[slide.shot]}</span> : null}
            </div>
            {words ? <p className={styles.visualWords}>{words.headline}</p> : null}
            <p className={styles.factMeta}>Beat · {slide.beat}</p>
            {slide.subject ? <p className={styles.factMeta}>Subject · {slide.subject}{slide.recurring && RECURRING_LABEL[slide.recurring] ? ` · ${RECURRING_LABEL[slide.recurring]}` : ""}</p> : null}
            {slide.discovery ? <p className={styles.factMeta}>New here · {slide.discovery}</p> : null}
            {slide.headlineLink ? <p className={styles.factMeta}>With the headline · {slide.headlineLink}</p> : null}
            <p className={styles.openingText}>{slide.direction}</p>
            {slide.characterIds.length ? <p className={styles.factMeta}>Characters · {slide.characterIds.map((id) => run.characters?.find((character) => character.id === id)?.name ?? id).join(", ")}</p> : null}
            {slide.references.length ? <p className={styles.factMeta}>Verified material · {slide.references.map(nameOf).join(", ")}</p> : null}
          </li>;
        })}
      </ol>
    </div>,
  };
}

const CLOSING_DISPLAY: FunnelDisplay<Draft2ClosingCandidate> = {
  noun: "closing",
  plural: "closings",
  gate: CLOSING_GATE,
  labels: CLOSING_CRITERION_LABEL,
  lines: (candidate) => ({
    title: candidate.penultimate?.headline ?? candidate.last.headline,
    details: [
      ...(candidate.penultimate ? [candidate.penultimate.body, `Last slide · ${candidate.last.headline}`] : [candidate.last.body]),
      candidate.last.cta ? `Call to action · ${candidate.last.cta}` : "No call to action",
    ],
  }),
  proposal: (candidate) => `${candidate.penultimate ? `${candidate.penultimate.headline} · last: ` : ""}${candidate.last.headline}`,
  cards: (candidate) => <div className={styles.openingCards}>
    {candidate.penultimate ? <SlideCard label="Penultimate" headline={candidate.penultimate.headline} text={candidate.penultimate.body} factIds={candidate.penultimate.factIds} /> : null}
    <SlideCard label="Last slide" headline={candidate.last.headline} text={candidate.last.body} cta={candidate.last.cta || undefined} factIds={candidate.last.factIds} />
  </div>,
};

/** The caption's display: each caption by its opening line, and the chosen one as the post will read, with the credits the program adds and its hashtags. */
function captionDisplayFor(caption: Draft2Caption | undefined): FunnelDisplay<Draft2CaptionCandidate> {
  const credits = caption?.credits ?? [];
  const opening = (candidate: Draft2CaptionCandidate) => candidate.text.split("\n")[0] ?? "";
  return {
    noun: "caption",
    plural: "captions",
    gate: CAPTION_GATE,
    labels: CAPTION_CRITERION_LABEL,
    lines: (candidate) => ({ title: opening(candidate), details: [`${[...candidate.text].length} characters · ${candidate.hashtags.map((tag) => `#${tag}`).join(" ")}`] }),
    proposal: opening,
    cards: (candidate) => <CaptionPost text={captionPostText({ text: candidate.text, credits, hashtags: candidate.hashtags })} factIds={candidate.factIds} />,
  };
}

/** The carousel as it can be approved now, or what it still needs. */
function publicationState(session: Draft2SessionView | null | undefined): { target?: Draft2PublicationTarget; blocker?: string } {
  if (!session?.caption) return {};
  try {
    return { target: publicationTarget(session) };
  } catch (cause) {
    return { blocker: cause instanceof Error ? cause.message : "The carousel cannot be approved yet." };
  }
}

/** A funnel step's run: every round's verdict, the version the next steps build on, and every other version to choose from. */
function FunnelRunView<C extends FunnelCandidate>({ run, display, choosing, locked, onChoose }: {
  run: FunnelRun<C, FunnelScore, FunnelIssue> & { writer?: Draft2Opening["writer"]; judge?: Draft2Opening["judge"] } & Partial<Pick<Draft2Deck, "opening" | "closing">> & Partial<Pick<Draft2Visual, "carousel" | "characters">>;
  display: FunnelDisplay<C>;
  choosing?: string;
  locked: boolean;
  onChoose: (candidateId: string) => void;
}) {
  const names = roleNames(run);
  const versions = funnelVersions(run.rounds);
  const chosen = versions.find((version) => version.candidate.id === (run.editorChoiceId ?? run.winnerId));
  const others = versions.filter((version) => version !== chosen).sort((a, b) => (b.score?.overall ?? 0) - (a.score?.overall ?? 0));
  const winnerLabel = run.status === "ready" ? "Accepted" : "Best so far";
  return <>
    {run.rounds.length ? <ol className={styles.roundList} aria-label={`${display.noun[0].toUpperCase()}${display.noun.slice(1)} rounds`}>
      {run.rounds.map((round) => <FunnelRoundView key={round.round} round={round} names={names} display={display} />)}
    </ol> : null}
    {chosen ? <ChosenVersion
      version={chosen}
      run={run}
      names={names}
      display={display}
      label={run.editorChoiceId ? "Your choice" : winnerLabel}
      tone={run.editorChoiceId || run.status === "ready" ? "success" : "warning"}
    /> : null}
    {others.length ? <div className={styles.openingGroup}>
      <SectionHeader level={3} title={chosen ? "Every other version" : "Every version"} description={`All the ${display.plural} of this run, as ${names.judge} scored them. The one you choose is what the next steps build on.`} />
      <ol className={styles.factList}>
        {others.map((version) => {
          const { title, details } = display.lines(version.candidate);
          return <li key={version.candidate.id} className={styles.factItem}>
            <div className={styles.factHead}>
              <span className={styles.factId}>{version.candidate.id}</span>
              {version.score ? <StatusBadge tone={funnelScorePasses(version.score, display.gate) ? "success" : "neutral"}>{version.score.overall}/100</StatusBadge> : null}
              {version.findings.length ? <StatusBadge tone="warning">{version.findings.length} program {version.findings.length === 1 ? "finding" : "findings"}</StatusBadge> : null}
              {hasMaterialError(version) ? <StatusBadge tone="error">Factual error</StatusBadge> : null}
              {version.candidate.id === run.winnerId ? <StatusBadge tone="info">{winnerLabel}</StatusBadge> : null}
              <span className={styles.factMeta}>{versionOrigin(version, names)}</span>
            </div>
            <p className={styles.factClaim}>{title}</p>
            {details.map((detail, index) => <p key={index} className={styles.factMeta}>{detail}</p>)}
            <div>
              <Button variant="quiet" size="compact" busy={choosing === version.candidate.id} disabled={locked || choosing !== undefined} onClick={() => onChoose(version.candidate.id)}>Choose this {display.noun}</Button>
            </div>
          </li>;
        })}
      </ol>
    </div> : null}
  </>;
}

function FunnelRoundView<C extends FunnelCandidate>({ round, names, display }: { round: FunnelRound<C, FunnelScore, FunnelIssue>; names: RoleNames; display: FunnelDisplay<C> }) {
  const evaluation = round.evaluation;
  const programWinner = evaluation ? funnelAcceptedWinner(round.mechanical, evaluation, display.gate) : undefined;
  const winnerId = programWinner ?? evaluation?.winnerId;
  const winner = evaluation?.scores.find((score) => score.candidateId === winnerId);
  const revised = round.candidates.flatMap((candidate) => candidate.revisionOf ? [candidate.revisionOf] : []);
  const edited = round.candidates.filter((candidate) => candidate.proposalOf && !candidate.asProposed).map((candidate) => candidate.id);
  const originals = round.candidates.filter((candidate) => candidate.asProposed);
  const fresh = round.candidates.filter((candidate) => !candidate.revisionOf && !candidate.proposalOf).map((candidate) => candidate.id);
  const wrote = listed([
    revised.length ? `revised ${listed(revised)}` : "",
    edited.length ? `edited ${edited.length} of ${names.judge}’s proposals (${edited.join(", ")})` : "",
    fresh.length ? (revised.length || edited.length || originals.length ? `tried ${fresh.length} new ${fresh.length === 1 ? "angle" : "angles"} (${fresh.join(", ")})` : `wrote ${fresh.length} ${fresh.length === 1 ? display.noun : display.plural}`) : "",
  ].filter(Boolean));
  const proposals = evaluation?.proposals ?? [];
  // Each proposal as the judge wrote it against the writer's edit: whose version scored higher.
  const scoreOf = (id?: string) => evaluation?.scores.find((score) => score.candidateId === id)?.overall;
  const duels = originals.map((original) => {
    const edit = round.candidates.find((candidate) => candidate.proposalOf === original.proposalOf && !candidate.asProposed);
    return `${original.proposalOf} ${scoreOf(original.id) ?? "–"} as written / ${edit ? `${scoreOf(edit.id) ?? "–"} edited` : "not edited"}`;
  });
  return <li className={styles.roundCard}>
    <div className={styles.factHead}>
      <strong>Round {round.round}</strong>
      <span>{wrote ? `${names.writer} ${wrote}` : ""}{originals.length ? `${wrote ? "; " : ""}${names.judge}’s ${originals.length === 1 ? "proposal competes" : "proposals compete"} as written too (${originals.map((original) => original.id).join(", ")})` : ""}</span>
      {evaluation
        ? <StatusBadge tone={programWinner ? "success" : "warning"}>{names.judge}: {evaluation.verdict} · {winnerId} {winner?.overall}/100</StatusBadge>
        : <StatusBadge tone="neutral">{names.judge} did not answer</StatusBadge>}
    </div>
    {duels.length ? <p className={styles.factMeta}>{names.judge}’s proposals, as written against {names.writer}’s edits: {duels.join(" · ")}.</p> : null}
    {(round.regressions ?? []).map((regression) => <p key={regression.candidateId} className={styles.factMeta}>{regressionNote(regression)}</p>)}
    {evaluation && programWinner && programWinner !== evaluation.winnerId ? <p className={styles.factMeta}>{names.judge} picked {evaluation.winnerId}, which has a program finding; {programWinner}, the best clean candidate, meets the thresholds and wins.</p> : null}
    {evaluation ? <p className={styles.factMeta}>{evaluation.summary}</p> : null}
    {winner ? <ScoreRow score={winner} display={display} /> : null}
    {round.mechanical.length || evaluation?.issues.length ? <ul className={styles.issueList}>
      {round.mechanical.map((issue, index) => <li key={`m${index}`}><strong>Program · {issue.code}</strong>{issueTarget(issue)}: {issue.detail}</li>)}
      {(evaluation?.issues ?? []).map((issue, index) => <li key={`j${index}`}><strong>{issue.material ? `Material · ${issue.code}` : issue.code}</strong>{issueTarget(issue)}: {issue.detail}</li>)}
    </ul> : null}
    {evaluation?.suggestions.length ? <details><summary>{evaluation.suggestions.length} {evaluation.suggestions.length === 1 ? "suggestion" : "suggestions"} for the next round</summary>
      <ul className={styles.issueList}>{evaluation.suggestions.map((suggestion, index) => <li key={index}>{suggestion}</li>)}</ul>
    </details> : null}
    {proposals.length ? <details><summary>{names.judge} proposed {proposals.length} {proposals.length === 1 ? display.noun : display.plural} for the next round</summary>
      <ul className={styles.issueList}>{proposals.map((proposal) => <li key={proposal.id}><strong>{proposal.id}</strong>: {display.proposal(proposal)}</li>)}</ul>
    </details> : null}
  </li>;
}

/** The version the next steps build on, with its scores, as the slides it will be. */
function ChosenVersion<C extends FunnelCandidate>({ version, run, names, display, label, tone }: {
  version: FunnelVersion<C, FunnelScore, FunnelIssue>;
  run: Parameters<FunnelDisplay<C>["cards"]>[1];
  names: RoleNames;
  display: FunnelDisplay<C>;
  label: string;
  tone: StatusTone;
}) {
  const { candidate, score } = version;
  return <div className={styles.openingGroup}>
    <div className={styles.factHead}>
      <span className={styles.factId}>{candidate.id}</span>
      <StatusBadge tone={tone}>{label}</StatusBadge>
      {score ? <strong>{score.overall}/100</strong> : null}
      {candidate.angle ? <span>{candidate.angle}</span> : null}
      <span className={styles.factMeta}>{versionOrigin(version, names)}</span>
    </div>
    {score ? <ScoreRow score={score} display={display} /> : null}
    {score?.note ? <p className={styles.factMeta}>{score.note}</p> : null}
    {display.cards(candidate, run)}
  </div>;
}

/**
 * One slide as a 4:5 card: its headline, its text, a list item's practical
 * line, the call to action on the last, and the facts it cites. A quiet card
 * is a slide another step wrote, shown for context.
 */
function SlideCard({ label, headline, text, practical, cta, factIds, quiet = false }: { label: string; headline: string; text: string; practical?: string; cta?: string; factIds: readonly string[]; quiet?: boolean }) {
  return <article className={styles.openingCard} aria-label={label} data-quiet={quiet ? "" : undefined}>
    <p className={styles.eyebrow}>{label}</p>
    <p className={styles.openingHeadline}>{headline}</p>
    <p className={styles.openingText}>{text}</p>
    {practical ? <p className={styles.openingPractical}>{practical}</p> : null}
    {cta ? <p className={styles.openingCta}>{cta}</p> : null}
    <p className={styles.openingFacts}>Facts · {factIds.join(", ")}</p>
  </article>;
}

function ScoreRow<C extends FunnelCandidate>({ score, display }: { score: FunnelScore; display: FunnelDisplay<C> }) {
  return <p className={styles.scoreRow}>
    {display.gate.criteria.map((criterion) => {
      // A score stored before a criterion existed (the opening's focus) has none.
      const value = criterionOf(score, criterion);
      return value === undefined ? null : <span key={criterion} data-low={value < display.gate.floor ? "" : undefined}>{display.labels[criterion] ?? criterion} <strong>{value}</strong></span>;
    })}
    <span>Overall <strong>{score.overall}</strong></span>
  </p>;
}

/**
 * The people, places and organizations the facts name, with what verified
 * material each has: Commons candidates a person waits on the editor for, a
 * place's photo and map, and the story's own photos, which the editor gives
 * to a person or place the lookups could not show. The characters choice
 * says whether the brand's characters may narrate.
 */
function InventoryView({ inventory, story, saving, locked, onDecide }: {
  inventory: Draft2Inventory;
  /** For the story's photos panel: the editor adds a photo there, then gives it to a person or place. */
  story: { topicId: string; storyId: string; secret: string };
  saving?: string;
  locked: boolean;
  onDecide: (input: Record<string, unknown>) => void;
}) {
  const people = inventory.entities.filter((entity) => entity.kind === "person");
  const places = inventory.entities.filter((entity) => entity.kind === "place");
  const organizations = inventory.entities.filter((entity) => entity.kind === "organization");
  return <div className={styles.focusBody}>
    <p className={styles.factMeta}>People and places v{inventory.version}{inventory.foundAt ? ` · found ${new Date(inventory.foundAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}` : ""}. The visual script uses only what is verified here.</p>
    <FormField label="The brand’s characters" description={inventory.roster.length ? `${inventory.roster.map((character) => character.name).join(" and ")}, the Topic’s ${inventory.roster.length === 1 ? "character" : "characters"} with a reference image.` : "The Topic has no character with a reference image; none can narrate."}>
      <select value={inventory.characters} disabled={locked || !inventory.roster.length} onChange={(event) => onDecide({ action: "characters", characters: event.target.value })}>
        {INVENTORY_CHARACTER_CHOICES.map((choice) => <option key={choice} value={choice}>{CHARACTER_CHOICE_LABEL[choice]}</option>)}
      </select>
    </FormField>
    {inventory.entities.length ? null : <p className={styles.factMeta}>The facts name no person, place or organization.</p>}
    {people.length ? <div className={styles.openingGroup}>
      <SectionHeader level={3} title="People" description="Never generated. A confirmed Commons photo, or one of the story’s photos you give them, can appear as a documentary portrait, pasted unchanged; anyone else is told without being shown." />
      <ol className={styles.factList}>{people.map((entity) => <PersonItem key={entity.id} entity={entity} photos={inventory.storyPhotos} saving={saving === entity.id} locked={locked} onDecide={onDecide} />)}</ol>
    </div> : null}
    {places.length ? <div className={styles.openingGroup}>
      <SectionHeader level={3} title="Places" description="A real place appears only through its verified photo or map, or one of the story’s photos you give it; otherwise as a generic scene of its kind." />
      <ol className={styles.factList}>{places.map((entity) => <PlaceItem key={entity.id} entity={entity} photos={inventory.storyPhotos} locked={locked} onDecide={onDecide} />)}</ol>
    </div> : null}
    {organizations.length ? <p className={styles.factMeta}>Organizations, never drawn and never named in an image (no logos): {organizations.map((entity) => entity.name).join(", ")}.</p> : null}
    {inventory.storyPhotos.length ? <p className={styles.factMeta}>The story’s photos: {inventory.storyPhotos.map((photo) => `${photo.name}${photo.transmissionAllowed ? "" : " (documentary portrait only)"}`).join(", ")}.</p> : null}
    <details>
      <summary>Add a photo, or find one on Commons under another name</summary>
      <p className={styles.factMeta}>For a person or place the lookups could not show: upload a photo you have the rights to, or search Commons (a person by their exact full name, a place by the larger place it belongs to). Then give it to the person or place above.</p>
      <StoryPhotosPanel topicId={story.topicId} storyId={story.storyId} secret={story.secret} onChanged={() => onDecide({ action: "photos" })} />
    </details>
  </div>;
}

/** One of the story's photos for a person or place: a person's appears only as their documentary portrait, pasted unchanged. */
function StoryPhotoChoice({ entity, photos, locked, onDecide }: { entity: Draft2InventoryEntity; photos: readonly Draft2InventoryStoryPhoto[]; locked: boolean; onDecide: (input: Record<string, unknown>) => void }) {
  if (!photos.length && !entity.storyPhoto) return null;
  const person = entity.kind === "person";
  return <FormField label={person ? "Their photo from the story" : "Its photo from the story"} description={person ? "Pasted unchanged as a documentary portrait, never redrawn. Check it is them." : "Shows this place. Check it is the place."}>
    <select value={entity.storyPhoto?.id ?? ""} disabled={locked} onChange={(event) => onDecide({ action: "photo", entityId: entity.id, storyPhotoId: event.target.value || null })}>
      <option value="">No story photo</option>
      {photos.map((photo) => <option key={photo.id} value={photo.id}>{photo.name}{photo.transmissionAllowed ? "" : " · documentary only"}</option>)}
      {entity.storyPhoto && !photos.some((photo) => photo.id === entity.storyPhoto?.id) ? <option value={entity.storyPhoto.id}>{entity.storyPhoto.name} · removed</option> : null}
    </select>
  </FormField>;
}

/** A person and their Commons candidates: confirm the one that is them, or say none is; or give them one of the story's photos. */
function PersonItem({ entity, photos, saving, locked, onDecide }: { entity: Draft2InventoryEntity; photos: readonly Draft2InventoryStoryPhoto[]; saving: boolean; locked: boolean; onDecide: (input: Record<string, unknown>) => void }) {
  const person = entity.person;
  const status = person?.status;
  return <li className={styles.factItem}>
    <div className={styles.factHead}>
      <span className={styles.factId}>{entity.id}</span>
      <strong>{entity.name}</strong>
      <StatusBadge tone={status === "confirmed" || entity.storyPhoto ? "success" : status === "candidates" ? "warning" : "neutral"}>{status === "confirmed" ? "Portrait confirmed" : entity.storyPhoto ? "Story photo" : status === "candidates" ? "Confirm the photo" : status === "rejected" ? "No photo" : status === "none" ? "Not on Commons" : "Not checked"}</StatusBadge>
      <span className={styles.factMeta}>{entity.role} · {entity.factIds.join(", ")}</span>
    </div>
    {entity.description ? <p className={styles.factMeta}>{entity.description}</p> : null}
    {person?.note ? <p className={styles.factMeta}>{person.note}</p> : null}
    {status === "confirmed" && person?.confirmed ? <p className={styles.factMeta}>{person.confirmed.name}{person.confirmed.description ? ` · ${person.confirmed.description}` : ""} · {person.confirmed.author} · {person.confirmed.license}</p> : null}
    {entity.storyPhoto ? <p className={styles.factMeta}>Story photo · {entity.storyPhoto.name} · {entity.storyPhoto.provenance}</p> : null}
    {status === "candidates" ? <ul className={styles.candidateList}>
      {person!.candidates.map((candidate) => <li key={candidate.entityId} className={styles.candidate}>
        <Image className={styles.candidateThumb} src={candidate.thumbnailUrl} alt={`Wikimedia Commons photo of ${candidate.name}`} width={160} height={120} unoptimized />
        <div>
          <p className={styles.factClaim}>{candidate.name}{candidate.birthYear ? ` (born ${candidate.birthYear})` : ""}</p>
          {candidate.description ? <p className={styles.factMeta}>{candidate.description}</p> : null}
          <p className={styles.factMeta}>{candidate.author} · {candidate.license} · <a href={candidate.commonsUrl} target="_blank" rel="noreferrer">Commons ↗</a></p>
          <Button variant="secondary" size="compact" busy={saving} disabled={locked} onClick={() => onDecide({ action: "confirm", entityId: entity.id, candidateId: candidate.entityId })}>This is them</Button>
        </div>
      </li>)}
    </ul> : null}
    {status !== "confirmed" ? <StoryPhotoChoice entity={entity} photos={photos} locked={locked} onDecide={onDecide} /> : null}
    <ActionRow>
      {status === "candidates" ? <Button variant="quiet" size="compact" disabled={locked} onClick={() => onDecide({ action: "reject", entityId: entity.id })}>None of these</Button> : null}
      {status === "confirmed" || status === "rejected" ? <Button variant="quiet" size="compact" disabled={locked} onClick={() => onDecide({ action: "reopen", entityId: entity.id })}>Change</Button> : null}
    </ActionRow>
  </li>;
}

const PLACE_STATUS_LABEL = { verified: "Verified", "not-found": "Not found", unavailable: "Not checked", rejected: "Set aside" } as const;

/**
 * A place and what the lookups found: its Wikidata item with a photo, or
 * Google Maps' match for its map. The editor sets a wrong match aside, or
 * gives the place one of the story's photos.
 */
function PlaceItem({ entity, photos, locked, onDecide }: { entity: Draft2InventoryEntity; photos: readonly Draft2InventoryStoryPhoto[]; locked: boolean; onDecide: (input: Record<string, unknown>) => void }) {
  const place = entity.place;
  const status = place?.status;
  const found = status === "verified" || status === "rejected";
  return <li className={styles.factItem}>
    <div className={styles.factHead}>
      <span className={styles.factId}>{entity.id}</span>
      <strong>{entity.name}</strong>
      <StatusBadge tone={status === "verified" || entity.storyPhoto ? "success" : status === "unavailable" ? "warning" : "neutral"}>{status !== "verified" && entity.storyPhoto ? "Story photo" : status ? PLACE_STATUS_LABEL[status] : "Not checked"}</StatusBadge>
      <span className={styles.factMeta}>{entity.role} · {entity.factIds.join(", ")}</span>
    </div>
    {entity.description ? <p className={styles.factMeta}>{entity.description}</p> : null}
    {found && place?.wikidataId ? <p className={styles.factMeta}>Wikidata <a href={place.sourceUrl} target="_blank" rel="noreferrer">{place.wikidataId} ↗</a> · {place.photo ? `photo · ${place.photo.author} · ${place.photo.license} · ${place.photo.source === "openverse" ? "Openverse" : "Wikimedia Commons"}` : "no eligible photo"}</p> : null}
    {found && place?.google ? <p className={styles.factMeta}>Google Maps · {place.google.name} · {place.google.address} · <a href={place.google.sourceUrl} target="_blank" rel="noreferrer">Map ↗</a>{place.google.exactName ? "" : " · Google’s name differs from the story’s: check it is the same place"}</p> : null}
    {found ? <p className={styles.factMeta}>{place?.map ? "A map can be drawn." : "No coordinates for a map."}{status === "rejected" ? " Set aside: the script shows nothing of this match." : ""}</p> : null}
    {place?.note ? <p className={styles.factMeta}>{place.note}</p> : null}
    {entity.storyPhoto ? <p className={styles.factMeta}>Story photo · {entity.storyPhoto.name} · {entity.storyPhoto.provenance}</p> : null}
    <StoryPhotoChoice entity={entity} photos={photos} locked={locked} onDecide={onDecide} />
    <ActionRow>
      {status === "verified" ? <Button variant="quiet" size="compact" disabled={locked} onClick={() => onDecide({ action: "reject", entityId: entity.id })}>Not this place</Button> : null}
      {status === "rejected" ? <Button variant="quiet" size="compact" disabled={locked} onClick={() => onDecide({ action: "reopen", entityId: entity.id })}>It is this place</Button> : null}
    </ActionRow>
  </li>;
}

/**
 * The carousel's images in order, each with the version it shows and Sol's
 * review of it, and the editor's choices: another image (with what to
 * change, optionally as an edit of the one shown), or another version.
 */
function ImagesView({ images, story, saving, locked, onDecide }: {
  images: Draft2Images;
  /** Where the images are read from; the secret authorizes it when the editor is not signed in. */
  story: { topicId: string; sessionId: string; secret: string };
  saving?: string;
  locked: boolean;
  onDecide: (input: Record<string, unknown>) => void;
}) {
  const shown = images.slides.filter((slide) => shownAttempt(slide)).length;
  const costMicros = images.slides.flatMap((slide) => slide.attempts).reduce((sum, attempt) => sum + (attempt.costMicros ?? 0), 0);
  return <div className={styles.focusBody}>
    <p className={styles.factMeta}>{shown} of {images.slides.length} slides · from visual script {images.visualId} · {images.quality} quality · {images.model}{costMicros ? ` · ≈US$${(costMicros / 1_000_000).toFixed(2)} in images` : ""}</p>
    <ol className={styles.imageGrid}>{images.slides.map((slide) => <SlideImageCard key={slide.slide} slide={slide} runId={images.runId} story={story} saving={saving === slide.slide} locked={locked} onDecide={onDecide} />)}</ol>
  </div>;
}

const IMAGE_STATUS_LABEL: Record<Draft2ImageAttempt["status"], string> = { queued: "Waiting", submitting: "Sending", generating: "Generating", generated: "Made", failed: "Failed" };

/** What Sol found on an image: passed, its blocking issues, or why it could not look. */
function ImageReviewLines({ review }: { review: Draft2ImageReview }) {
  if (review.status === "passed") return <p className={styles.factMeta}>Sol: passed.{review.note ? ` ${review.note}` : ""}</p>;
  if (review.status === "unavailable") return <p className={styles.factMeta}>{review.note}</p>;
  return <>
    <ul className={styles.issueList}>{review.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
    {review.note ? <p className={styles.factMeta}>{review.note}</p> : null}
  </>;
}

/** One slide: its image, its versions, the review, what it could not show, and another image. */
function SlideImageCard({ slide, runId, story, saving, locked, onDecide }: {
  slide: Draft2SlideImage;
  runId: string;
  story: { topicId: string; sessionId: string; secret: string };
  saving: boolean;
  locked: boolean;
  onDecide: (input: Record<string, unknown>) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [edit, setEdit] = useState(false);
  const shown = shownAttempt(slide);
  const latest = latestAttempt(slide);
  const generated = slide.attempts.filter((attempt) => attempt.status === "generated");
  const pending = !slideSettled(slide);
  const corrected = shown?.kind === "correct" ? slide.attempts.find((attempt) => attempt.version === shown.baseVersion) : undefined;
  const tone: StatusTone = !shown ? (latest?.status === "failed" ? "error" : "info") : shown.review?.status === "passed" ? "success" : "warning";
  const url = shown ? `/api/radar/draft2/images/file?topicId=${encodeURIComponent(story.topicId)}&sessionId=${encodeURIComponent(story.sessionId)}&run=${encodeURIComponent(runId)}&slide=${encodeURIComponent(slide.slide)}&version=${shown.version}` : undefined;
  return <li className={styles.imageCard}>
    <div className={styles.factHead}>
      <strong>{slide.label}</strong>
      <StatusBadge tone={tone}>{shown ? (shown.review?.status === "passed" ? "Passed" : shown.kind === "correct" ? "Corrected" : shown.review?.status === "issues" ? "Issues" : "Made") : latest ? IMAGE_STATUS_LABEL[latest.status] : "No image"}</StatusBadge>
      {shown ? <span className={styles.factMeta}>v{shown.version}</span> : null}
    </div>
    {url ? <PrivateDraft2Image url={url} secret={story.secret} alt={`${slide.label}, version ${shown?.version}`} /> : <div className={styles.imageFrame}><p className={styles.factMeta}>{latest?.status === "failed" ? latest.error : pending ? "Being made…" : "No image"}</p></div>}
    {generated.length > 1 ? <div className={styles.imageVersions} role="group" aria-label={`${slide.label}: versions`}>
      {generated.map((attempt) => <Button key={attempt.version} size="compact" variant={attempt.version === shown?.version ? "secondary" : "quiet"} disabled={locked || attempt.version === shown?.version} onClick={() => onDecide({ action: "choose", slide: slide.slide, version: attempt.version })}>
        v{attempt.version}{attempt.kind === "correct" ? " · corrected" : attempt.kind === "regenerate" ? " · yours" : ""}
      </Button>)}
    </div> : null}
    {shown?.review ? <ImageReviewLines review={shown.review} /> : null}
    {corrected?.review ? <p className={styles.factMeta}>Corrected from v{corrected.version} for: {corrected.review.issues.join(" ")} Not reviewed again: look at it yourself.</p> : null}
    {latest && latest !== shown && latest.status === "failed" ? <p className={styles.factMeta}>v{latest.version} failed: {latest.error}</p> : null}
    {slide.notes.map((entry) => <p key={entry} className={styles.factMeta}>{entry}</p>)}
    <details>
      <summary>Another image</summary>
      <FormField label="What to change" description="Optional for a new image; needed to edit this one.">
        <textarea value={instruction} maxLength={600} rows={2} disabled={locked || pending} onChange={(event) => setInstruction(event.target.value)} />
      </FormField>
      <label className={styles.factMeta}><input type="checkbox" checked={edit} disabled={locked || pending || !shown} onChange={(event) => setEdit(event.target.checked)} /> Edit this image, keeping its layout</label>
      <ActionRow>
        <Button size="compact" variant="secondary" busy={saving} disabled={locked || pending || (edit && !instruction.trim())} onClick={() => onDecide({ action: "regenerate", slide: slide.slide, instruction, edit })}>{edit ? "Edit the image" : "Make another image"}</Button>
      </ActionRow>
    </details>
  </li>;
}

/** A private image: fetched with the editor's credentials and shown from memory. */
function PrivateDraft2Image({ url, secret, alt }: { url: string; secret: string; alt: string }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    fetch(url, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The image is unavailable.");
        const blob = await response.blob();
        if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setSrc(objectUrl); }
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, secret]);
  return <div className={styles.imageFrame}>
    {src ? <Image className={styles.imageFill} src={src} alt={alt} width={432} height={540} unoptimized /> : <p className={styles.factMeta}>{failed ? "Could not load the image." : "Loading…"}</p>}
  </div>;
}

/**
 * The Instagram accounts the caption may tag: Claude proposes usernames for
 * the story's people, places and organizations, Instagram says which exist
 * and what they are called, and the editor tags the ones that are them, or
 * adds an account of their own. Only tagged accounts reach the caption.
 */
function MentionsView({ mentions, entities, saving, locked, onDecide }: {
  mentions: Draft2Mentions | undefined;
  entities: readonly Draft2InventoryEntity[];
  saving?: string;
  locked: boolean;
  onDecide: (input: Record<string, unknown>) => Promise<boolean>;
}) {
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [entityId, setEntityId] = useState("");
  const accounts = mentions?.accounts ?? [];
  const nameOf = (id?: string) => entities.find((entity) => entity.id === id)?.name;
  async function add() {
    if (await onDecide({ action: "add", handle, name, ...(entityId ? { entityId } : {}) })) { setHandle(""); setName(""); setEntityId(""); }
  }
  return <div className={styles.focusBody}>
    {mentions ? <p className={styles.factMeta}>Accounts v{mentions.version}{mentions.foundAt ? ` · found ${new Date(mentions.foundAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}` : ""}{mentions.lookup === "instagram-page" ? " · checked on Instagram through the Topic’s Facebook Page" : ""}.</p> : null}
    {mentions?.note ? <p className={styles.factMeta}>{mentions.note}</p> : null}
    {accounts.length
      ? <ol className={styles.factList}>{accounts.map((account) => <MentionItem key={account.id} account={account} entityName={nameOf(account.entityId)} saving={saving === account.id} locked={locked} onDecide={onDecide} />)}</ol>
      : mentions?.status === "ready" ? <p className={styles.factMeta}>No account to tag was found.</p> : null}
    <details>
      <summary>Add an account</summary>
      <p className={styles.factMeta}>An Instagram account you know is theirs. It is checked on Instagram; tag it once it is found.</p>
      <div className={styles.mentionForm}>
        <FormField label="Instagram username">
          <input value={handle} maxLength={31} placeholder="@username" autoComplete="off" disabled={locked} onChange={(event) => setHandle(event.target.value)} />
        </FormField>
        <FormField label="Who it is">
          <input value={name} maxLength={120} disabled={locked} onChange={(event) => setName(event.target.value)} />
        </FormField>
        {entities.length ? <FormField label="In the story">
          <select value={entityId} disabled={locked} onChange={(event) => { setEntityId(event.target.value); if (!name.trim()) setName(nameOf(event.target.value) ?? ""); }}>
            <option value="">No one the story names</option>
            {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
          </select>
        </FormField> : null}
      </div>
      <ActionRow>
        <Button size="compact" variant="secondary" busy={saving === "add"} disabled={locked || !handle.trim() || !name.trim()} onClick={() => { void add(); }}>Check and add</Button>
      </ActionRow>
    </details>
  </div>;
}

/** One account: who it should be, what Instagram calls it, and the editor's decision. */
function MentionItem({ account, entityName, saving, locked, onDecide }: {
  account: Draft2MentionAccount;
  entityName?: string;
  saving: boolean;
  locked: boolean;
  onDecide: (input: Record<string, unknown>) => Promise<boolean>;
}) {
  const status = MENTION_STATUS[account.status];
  const found = account.account;
  return <li className={styles.factItem}>
    <div className={styles.factHead}>
      <span className={styles.factId}>{account.id}</span>
      <strong>@{found?.username ?? account.handle}</strong>
      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      <span className={styles.factMeta}>{account.name}{entityName && entityName !== account.name ? ` · ${entityName}` : ""}{account.source === "editor" ? " · added by you" : ""}</span>
    </div>
    {found ? <p className={styles.factMeta}>Instagram: {found.name || "no name"}{found.followers !== undefined ? ` · ${found.followers.toLocaleString("en-CA")} followers` : ""}{found.website ? ` · ${found.website}` : ""} · <a href={`https://www.instagram.com/${encodeURIComponent(found.username)}/`} target="_blank" rel="noreferrer">Profile ↗</a></p> : null}
    {found && account.match === "weak" && account.status === "verified" ? <p className={styles.factMeta}>Its name is not {account.name}’s: check it is them before you tag it.</p> : null}
    {account.note ? <p className={styles.factMeta}>{account.note}</p> : null}
    <ActionRow>
      {found && (account.status === "verified" || account.status === "rejected") ? <Button size="compact" variant="secondary" busy={saving} disabled={locked} onClick={() => { void onDecide({ action: "confirm", accountId: account.id }); }}>Tag this account</Button> : null}
      {account.status === "verified" ? <Button size="compact" variant="quiet" disabled={locked} onClick={() => { void onDecide({ action: "reject", accountId: account.id }); }}>Not them</Button> : null}
      {account.status === "confirmed" ? <Button size="compact" variant="quiet" busy={saving} disabled={locked} onClick={() => { void onDecide({ action: "reopen", accountId: account.id }); }}>Untag</Button> : null}
    </ActionRow>
  </li>;
}

/** The post as Facebook and Instagram will show it: its line breaks and blank lines kept, then the credits and the hashtags. */
function CaptionPost({ text, factIds }: { text: string; factIds: readonly string[] }) {
  return <div className={styles.captionPost}>
    <p className={styles.captionText}>{text}</p>
    <p className={styles.openingFacts}>{[...text].length.toLocaleString("en-CA")} of {CAPTION_MAX_CHARACTERS.toLocaleString("en-CA")} characters · Facts · {factIds.join(", ")}</p>
  </div>;
}

/** What approving publishes: the images in order and the post as it will read, with what the review left for the editor to look at. */
function PublishPreview({ target, approved, acknowledged, locked, onAcknowledge }: {
  target: Draft2PublicationTarget;
  approved: boolean;
  acknowledged: boolean;
  locked: boolean;
  onAcknowledge: (value: boolean) => void;
}) {
  const one = target.issues.length === 1;
  return <div className={styles.openingGroup}>
    <p className={styles.factMeta}>{target.slides.length} images, in order: {target.slides.map((slide) => `${slide.label} v${slide.version}`).join(" · ")}.</p>
    <CaptionPost text={targetPostText(target)} factIds={target.caption.factIds} />
    {target.issues.length ? <InlineNotice tone={approved ? "info" : "warning"} title={approved ? `Approved as ${one ? "it is" : "they are"}` : `Look at ${one ? "this image" : "these images"} before publishing`}>
      <ul className={styles.issueList}>{target.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
      {approved ? null : <label className={styles.factMeta}><input type="checkbox" checked={acknowledged} disabled={locked} onChange={(event) => onAcknowledge(event.target.checked)} /> I looked at {one ? "it" : "them"}: publish {one ? "it" : "them"} as {one ? "it is" : "they are"}</label>}
    </InlineNotice> : null}
  </div>;
}

/**
 * The approved copy and v1's publication on it: one confirmation for the
 * Facebook Page, its Instagram account or both, then each channel in detail,
 * with its checks, the exact post, its orders and their retries.
 */
function PublishedCopy({ publication, topicId, secret, locked, approving, onApprove }: {
  publication: Draft2Publication;
  topicId: string;
  secret: string;
  locked: boolean;
  approving: boolean;
  onApprove: () => void;
}) {
  return <div className={styles.openingGroup}>
    <p className={styles.factMeta}>Approved {new Date(publication.approvedAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })} · {publication.slides.length} images{publication.acknowledgedIssues.length ? ` · ${publication.acknowledgedIssues.length} ${publication.acknowledgedIssues.length === 1 ? "image" : "images"} you looked at yourself` : ""}.</p>
    <RunPublishActions topicId={topicId} draftId={publication.draftId} batchId={publication.batchId} secret={secret} disabled={locked} />
    <details>
      <summary>Each channel in detail: its checks, the exact post, its orders and retries</summary>
      <PublicationChannelsPanel topicId={topicId} draftId={publication.draftId} batchId={publication.batchId} secret={secret} disabled={locked} />
    </details>
    <details>
      <summary>Publishing says the approval is no longer current?</summary>
      <p className={styles.factMeta}>A change to the Topic’s visual policy retires every approval. Approve the carousel again: it is copied once more for publishing, exactly as it stands.</p>
      <ActionRow>
        <Button variant="quiet" size="compact" busy={approving} disabled={locked} onClick={onApprove}>Approve it again</Button>
      </ActionRow>
    </details>
  </div>;
}

const clip = (value: string, max = 140) => value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;

/** A field's value in a few words, for Claude's value beside the editor's choice. */
function focusValueText(field: Draft2FocusField, values: Draft2FocusValues): string {
  switch (field) {
    case "line": return values.line?.name ?? "no line";
    case "audience": return values.audience;
    case "framing": return FRAMING_LABEL[values.framing];
    case "readerConsequence": return values.readerConsequence?.text ?? "none";
    case "structure": return STRUCTURE_LABEL[values.structure.kind];
    case "goal": return GOAL_LABEL[values.goal];
    case "voice": return `${GRAVITY_LABEL[values.voice.gravity]} · ${TONE_KEYS.map((key) => `${key} ${values.voice[key]}`).join(" · ")}`;
    case "direction": return values.direction;
  }
}

/**
 * The Focus step: every field with Claude's reason, or the editor's choice
 * beside Claude's value. Selects save when they change, text when it loses
 * focus; the controls wait while a change is saved or a step runs.
 */
function FocusView({ focus, findings, saving, locked, onSave, onReset }: {
  focus: Draft2Focus;
  findings: readonly Draft2FocusFinding[];
  saving?: Draft2FocusField;
  locked: boolean;
  onSave: (field: Draft2FocusField, value: unknown) => void;
  onReset: (field: Draft2FocusField) => void;
}) {
  const values = focus.values!;
  const decided = focus.decidedAt ? new Date(focus.decidedAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : undefined;
  const edited = (field: Draft2FocusField) => focus.edited.includes(field);
  /** Claude's reason, or, for the editor's field, Claude's value beside it. */
  const about = (field: Draft2FocusField, detail?: string) => [
    edited(field) ? `Your choice. Claude’s: ${focus.ai ? clip(focusValueText(field, focus.ai)) : "none"}.` : focus.reasons?.[field],
    detail,
  ].filter(Boolean).join(" ") || undefined;
  const reset = (field: Draft2FocusField) => edited(field)
    ? <div><Button variant="quiet" size="compact" busy={saving === field} disabled={locked} onClick={() => onReset(field)}>Use Claude’s</Button></div>
    : null;
  const consequence = values.readerConsequence;
  const items = values.structure.itemFactIds;
  // Text fields start again from the saved value whenever the focus changes.
  const key = (field: Draft2FocusField) => `${field}-${focus.version}`;
  return <div className={styles.focusBody}>
    <p className={styles.factMeta}>Focus v{focus.version}{decided ? ` · decided by Claude, ${decided}` : ""}{focus.edited.length ? ` · ${focus.edited.length} of your ${focus.edited.length === 1 ? "change" : "changes"} kept` : ""}. The opening follows this version.</p>
    {findings.length ? <InlineNotice tone="warning" title="The opening waits for this">{findings.map((finding) => finding.detail).join(" ")}</InlineNotice> : null}
    <div className={styles.focusGrid}>
      <div className={styles.focusField}>
        <FormField label="Editorial line" description={about("line", values.line?.objective ? `The line: ${clip(values.line.objective, 220)}` : undefined)}>
          <select value={values.line?.id ?? ""} disabled={locked || !focus.lineOptions.length} onChange={(event) => onSave("line", event.target.value)}>
            {focus.lineOptions.length
              ? focus.lineOptions.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)
              : <option value="">The Topic has no editorial line</option>}
          </select>
        </FormField>
        {reset("line")}
      </div>
      <div className={styles.focusField}>
        <FocusText key={key("audience")} label="Audience" description={about("audience")} value={values.audience} max={FOCUS_AUDIENCE_MAX_CHARACTERS} disabled={locked} onCommit={(value) => onSave("audience", value)} />
        {reset("audience")}
      </div>
      <div className={styles.focusField}>
        <FormField label="Framing" description={about("framing")}>
          <select value={values.framing} disabled={locked} onChange={(event) => onSave("framing", event.target.value)}>
            {FOCUS_FRAMINGS.map((framing) => <option key={framing} value={framing}>{FRAMING_LABEL[framing]}</option>)}
          </select>
        </FormField>
        {reset("framing")}
      </div>
      <div className={styles.focusField}>
        <FocusText
          key={key("readerConsequence")}
          label="Reader consequence"
          description={about("readerConsequence", consequence?.factIds.length ? `Facts · ${consequence.factIds.join(", ")}` : consequence ? "Your words: guidance, not a fact." : "None: no fact establishes one.")}
          value={consequence?.text ?? ""}
          max={FOCUS_CONSEQUENCE_MAX_CHARACTERS}
          allowEmpty
          disabled={locked}
          onCommit={(value) => onSave("readerConsequence", value)}
        />
        {reset("readerConsequence")}
      </div>
      <div className={styles.focusField}>
        <FormField label="Structure" description={about("structure", values.structure.kind === "arc" ? undefined : items.length ? `${items.length} ${values.structure.kind === "list" ? "items" : "steps"} · ${items.join(", ")}` : "No items yet: decide again for Claude to find them.")}>
          <select value={values.structure.kind} disabled={locked} onChange={(event) => onSave("structure", event.target.value)}>
            {FOCUS_STRUCTURES.map((kind) => <option key={kind} value={kind}>{STRUCTURE_LABEL[kind]}</option>)}
          </select>
        </FormField>
        {reset("structure")}
      </div>
      <div className={styles.focusField}>
        <FormField label="Goal" description={about("goal")}>
          <select value={values.goal} disabled={locked} onChange={(event) => onSave("goal", event.target.value)}>
            {FOCUS_GOALS.map((goal) => <option key={goal} value={goal}>{GOAL_LABEL[goal]}</option>)}
          </select>
        </FormField>
        {reset("goal")}
      </div>
      <div className={`${styles.focusField} ${styles.focusWide}`}>
        <FocusVoice key={key("voice")} voice={values.voice} description={about("voice")} disabled={locked} onCommit={(voice) => onSave("voice", voice)} />
        {reset("voice")}
      </div>
      <div className={`${styles.focusField} ${styles.focusWide}`}>
        <FocusText key={key("direction")} label="Direction" description={about("direction")} value={values.direction} max={FOCUS_DIRECTION_MAX_CHARACTERS} rows={5} disabled={locked} onCommit={(value) => onSave("direction", value)} />
        {reset("direction")}
      </div>
    </div>
  </div>;
}

/** A text field that saves when it loses focus and changed; an emptied required field goes back to the saved value. */
function FocusText({ label, description, value, max, rows = 2, allowEmpty = false, disabled, onCommit }: {
  label: string; description?: string; value: string; max: number; rows?: number; allowEmpty?: boolean; disabled: boolean; onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return <FormField label={label} description={description}>
    <textarea
      value={draft}
      rows={rows}
      maxLength={max}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft.trim() === value.trim()) return;
        if (!draft.trim() && !allowEmpty) { setDraft(value); return; }
        onCommit(draft);
      }}
    />
  </FormField>;
}

/** The story's gravity and its five tone dials, saved together: the gravity when it changes, a dial when it loses focus. */
function FocusVoice({ voice, description, disabled, onCommit }: { voice: Draft2FocusVoice; description?: string; disabled: boolean; onCommit: (voice: Draft2FocusVoice) => void }) {
  const [draft, setDraft] = useState(voice);
  const commit = (next: Draft2FocusVoice) => { if (JSON.stringify(next) !== JSON.stringify(voice)) onCommit(next); };
  return <fieldset className={styles.focusVoice}>
    <legend className={styles.focusLegend}>Voice</legend>
    <div className={styles.voiceDials}>
      <FormField label="Gravity">
        <select value={draft.gravity} disabled={disabled} onChange={(event) => {
          const next = { ...draft, gravity: event.target.value as Draft2FocusVoice["gravity"] };
          setDraft(next);
          commit(next);
        }}>
          {FOCUS_GRAVITIES.map((gravity) => <option key={gravity} value={gravity}>{GRAVITY_LABEL[gravity]}</option>)}
        </select>
      </FormField>
      {TONE_KEYS.map((key) => <FormField key={key} label={TONE_LABEL[key]} description={toneWords(key, draft[key])}>
        <input
          type="number"
          min={1}
          max={100}
          step={1}
          value={Number.isFinite(draft[key]) ? draft[key] : ""}
          disabled={disabled}
          onChange={(event) => setDraft({ ...draft, [key]: event.target.valueAsNumber })}
          onBlur={() => {
            const value = Math.round(draft[key]);
            if (Number.isInteger(value) && value >= 1 && value <= 100) commit({ ...draft, [key]: value });
            else setDraft(voice);
          }}
        />
      </FormField>)}
    </div>
    {description ? <p className={styles.factMeta}>{description}</p> : null}
  </fieldset>;
}
