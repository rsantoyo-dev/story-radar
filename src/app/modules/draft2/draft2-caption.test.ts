import assert from "node:assert/strict";
import test from "node:test";
import * as types from "./draft2-facts.types";
import * as funnel from "./draft2-funnel";
import * as focusTypes from "./draft2-focus.types";
import * as imagesTypes from "./draft2-images.types";
import * as mentionsTypes from "./draft2-mentions.types";
import * as captionTypes from "./draft2-caption.types";
import * as models from "./draft2-models";
import * as skills from "./skills/draft2-skills";
import * as captions from "./skills/captions";
import { loadInSandbox } from "./draft2-test-sandbox";
import type { Draft2Caption, Draft2CaptionCandidate, Draft2CaptionScore } from "./draft2-caption.types";
import type { Draft2Images, Draft2ImageAttempt, Draft2SlideImage, Draft2SlideMaterial } from "./draft2-images.types";
import type { Draft2Inventory } from "./draft2-inventory.types";
import type { Draft2Mentions } from "./draft2-mentions.types";
import type { Draft2CarouselSlide, Draft2Visual, Draft2VisualCandidate } from "./draft2-visual.types";

const topicId = "11111111-1111-4111-8111-111111111111";
const storyId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const json = (value: unknown) => JSON.stringify(value);

const facts: types.Draft2Fact[] = [
  { id: "f1", claim: "The Vieux-Longueuil library reopens Saturday at 10 a.m.", evidence: "reopens Saturday at 10 a.m.", kind: "event", status: "established", importance: 90 },
  { id: "f2", claim: "Admission is free for children under 12.", evidence: "free for children under 12", kind: "event", status: "established", importance: 70 },
];
const carousel: Draft2CarouselSlide[] = [
  { slide: "cover", label: "Cover", headline: "The library is back", text: "Saturday, in Vieux-Longueuil.", factIds: ["f1"] },
  { slide: "slide2", label: "Slide 2", headline: "Free for kids", text: "Under 12, admission is free.", factIds: ["f2"] },
  { slide: "last", label: "Slide 3", headline: "See you Saturday", text: "Doors open at 10 a.m.", cta: "Save this for Saturday.", factIds: ["f1"] },
];
const VALUES: focusTypes.Draft2FocusValues = {
  line: null, audience: "Families in Vieux-Longueuil", framing: "reader-consequence", readerConsequence: { text: "A free Saturday plan for the kids", factIds: ["f2"] },
  structure: { kind: "arc", itemFactIds: [] }, goal: "saves",
  voice: { gravity: "light", formality: 30, humor: 40, energy: 60, optimism: 70, provocation: 20 },
  direction: "Lead with the reopening; pay it with the free admission.",
};
const FOCUS: focusTypes.Draft2FocusSnapshot = { version: 3, values: VALUES };
const SCRIPT = { id: "c2", angle: "x", concept: "Doors that open", motif: "A key", cast: "A child", characterPlan: { use: false, characterIds: [], role: "" }, slides: [] } as unknown as Draft2VisualCandidate;
const VISUAL = { status: "ready", winnerId: "c2", candidates: [SCRIPT], carousel, focus: FOCUS, rounds: [{ round: 1, candidates: [SCRIPT], mechanical: [], at: "t" }] } as unknown as Draft2Visual;
const generated = (version: number, extra: Partial<Draft2ImageAttempt> = {}): Draft2ImageAttempt => ({ version, kind: "generate", status: "generated", sha256: `${version}`.repeat(64).slice(0, 64), queuedAt: "t", review: { status: "passed", issues: [], note: "", transcription: "", model: "sol", at: "t" }, ...extra });
const slideImage = (slide: string, order: number, material: Draft2SlideMaterial[] = [], attempts = [generated(1)]): Draft2SlideImage =>
  ({ slide, label: carousel[order - 1].label, order, need: "generic-illustration", characterIds: [], material, notes: [], attempts });
const IMAGES: Draft2Images = {
  runId: "run-1", status: "ready", visualId: "c2", inventoryVersion: 2, quality: "low", model: "gpt-image-2.5", startedAt: "t", updatedAt: "t",
  slides: [slideImage("cover", 1), slideImage("slide2", 2), slideImage("last", 3)],
};
const INVENTORY = { status: "ready", version: 2, entities: [], storyPhotos: [], roster: [], characters: "auto" } as unknown as Draft2Inventory;
const MENTIONS: Draft2Mentions = {
  status: "ready", version: 4, lookup: "instagram-page",
  accounts: [
    { id: "m1", entityId: "e2", name: "Bibliothèques de Longueuil", handle: "biblio.longueuil", source: "claude", status: "confirmed", account: { username: "biblio.longueuil", name: "Bibliothèques de Longueuil" }, match: "strong" },
    { id: "m2", entityId: "e1", name: "Catherine Fournier", handle: "cfournier", source: "claude", status: "verified", account: { username: "cfournier", name: "Catherine Fournier" }, match: "strong" },
  ],
};
const profile = { name: "Salut Longueuil", language: "French", region: "Longueuil", platform: "Instagram", audience: "Families", brandPersonality: ["warm"], formality: 30, humor: 40, energy: 60, optimism: 70, provocation: 20, allowEmojis: true, maxEmojis: 3, callToActionStyle: "One warm, concrete step" };

const TAGS = ["Longueuil", "VieuxLongueuil", "Bibliotheque", "SortieFamille", "Samedi"];
const OPENINGS = ["📚 The Vieux-Longueuil library is back on Saturday.", "Saturday morning has a new plan in Vieux-Longueuil.", "Kids under 12 get in free this Saturday."];
const COMMENT = "The library is back on Saturday, and it may be the best free plan of the weekend. Which book will your kids pick first?";
const caption = (id: string, opening: string, extra: Partial<Draft2CaptionCandidate> = {}): Draft2CaptionCandidate => ({
  id, angle: `Way in ${id}`, text: `${opening}\n\nDoors open at 10 a.m. with @biblio.longueuil.\nFree for children under 12.\n\nSave this for Saturday.`, hashtags: TAGS, factIds: ["f1", "f2"], comment: COMMENT, ...extra,
});
type WriterContents = { task: string; candidatesWanted?: number; captions?: { id: string }[]; develop?: { id: string }[] };
type JudgeContents = { round: number; candidates: { id: string }[]; proposalsWanted?: number };
const writer = (contents: WriterContents) => contents.task === "revise"
  ? { candidates: [
    ...(contents.captions ?? []).map((target) => caption(target.id, "The library on Rue Saint-Charles is back on Saturday.")),
    ...(contents.develop ?? []).map((proposal) => caption(proposal.id, "An edit of Sol's opening for Saturday.")),
  ] }
  : { candidates: OPENINGS.slice(0, contents.candidatesWanted).map((opening, index) => caption(`c${index + 1}`, opening)) };
const score = (candidateId: string, overall: number): Draft2CaptionScore => ({ candidateId, hook: overall, scan: overall, grounding: overall, voice: overall, action: overall, hashtags: overall, fit: overall, conversation: overall, overall, note: "Why." });
const judge = (verdict: "accept" | "revise", winnerId: string, overall: Record<string, number>) => (contents: JudgeContents) => ({
  verdict, winnerId, summary: `${verdict} ${winnerId}.`, issues: [], suggestions: [],
  scores: contents.candidates.map((candidate) => score(candidate.id, overall[candidate.id] ?? 70)),
  proposals: contents.proposalsWanted ? [caption("p1", "Sol's own way into Saturday at the library.")] : [],
});

type Call = { provider: string; role: "writer" | "judge"; input: Record<string, unknown> };
type Row = Record<string, unknown> & { caption: Draft2Caption | null; trace: types.Draft2TraceEntry[] };

function harness({ writes = [], judgments = [], session, sources = [] }: { writes?: ((contents: WriterContents) => unknown)[]; judgments?: ((contents: JudgeContents) => unknown)[]; session?: Record<string, unknown>; sources?: string[] } = {}) {
  const calls: Call[] = [];
  let row: Row = { id: sessionId, topicId, storyId, step: "images", status: "ready", facts, visual: VISUAL, inventory: INVENTORY, images: IMAGES, mentions: MENTIONS, caption: null, error: null, trace: [], updatedAt: new Date(), ...session };
  let write = 0;
  let judgment = 0;
  const usage = { promptTokens: 100, outputTokens: 50, thoughtsTokens: 0, totalTokens: 150 };
  const answer = (provider: string, input: Record<string, unknown>) => {
    // The fix pass: the flagged candidates come back as they are (this harness fixes nothing), and the call stays out of the scripted ones.
    if (String(input.schemaName).endsWith("_fix")) return { text: JSON.stringify({ candidates: (input.contents as Record<string, unknown[]>).captions ?? [] }), provider, model: input.model, usage };
    const role = input.schemaName === "draft2_caption" ? "writer" : "judge";
    calls.push({ provider, role, input });
    const text = role === "writer" ? writes[write++](input.contents as WriterContents) : judgments[judgment++](input.contents as JudgeContents);
    return { text: JSON.stringify(text), provider, model: input.model, usage };
  };
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "./draft2-facts.types": types,
    "./draft2-funnel": funnel,
    "./draft2-focus.types": focusTypes,
    "./draft2-images.types": imagesTypes,
    "./draft2-mentions.types": mentionsTypes,
    "./draft2-caption.types": captionTypes,
    "./draft2-models": models,
    "./skills/draft2-skills": skills,
    "./skills/captions": captions,
    "./draft2-dev-trace": { draft2DevTrace: () => undefined },
    "../stories/creative-portrait-composite": {
      portraitCreditLine: (provenance: string) => `Portrait: ${provenance}`,
      adaptationCreditLine: (provenance: string) => `Adapted from: ${provenance}`,
      placePhotoAdaptationCreditLine: ({ author, license, provider }: { author: string; license: string; provider?: string }) => `Place photo: ${author} · ${license}${provider ? ` · ${provider}` : ""}`,
    },
    "../stories/creative-text-meter": { withCreativeTextBudget: async (_context: unknown, work: () => Promise<unknown>) => work() },
    "../stories/anthropic.config": { getAnthropicRuntimeConfig: () => ({ apiKey: "k", model: "claude-sonnet-5-5" }), requireAnthropicApiKey: () => "k" },
    "../stories/creative-profile.repository": { getCreativeProfile: async () => profile },
    "../stories/story-content.repository": { storySourceUrls: async (id: string) => id === storyId ? sources : [], storySourceCredits: async (id: string) => id === storyId ? sources.map((url) => ({ url, title: "A story" })) : [] },
    "../stories/openai-structured-response": { generateOpenAiStructuredResponse: async (input: Record<string, unknown>) => ({ ...answer("openai", input), cachedInputTokens: 900 }) },
    "../stories/anthropic-structured-response": { generateAnthropicStructuredResponse: async (input: Record<string, unknown>) => ({ ...answer("anthropic", input), cachedInputTokens: 0 }) },
    "./draft2-session.repository": {
      activeDraft2Session: async () => undefined,
      getDraft2Session: async (topic: string, id: string) => topic === topicId && id === row.id ? row : undefined,
      claimDraft2Session: async (_id: string, patch: Record<string, unknown>) => { row = { ...row, ...patch, status: "running" }; return row; },
      updateDraft2Session: async (_id: string, patch: Record<string, unknown>) => { row = { ...row, ...patch }; return row; },
      touchDraft2Session: async () => undefined,
    },
  };
  const exports = loadInSandbox("./draft2-caption.ts", mocks, { Date, process: { env: { OPENAI_API_KEY: "sk-test" } } }) as Record<string, (...args: unknown[]) => unknown>;
  return {
    run: (resume = false) => exports.runDraft2Caption({ topicId, storyId, sessionId, resume }) as Promise<Row>,
    choose: (candidateId: string) => exports.recordCaptionChoice({ topicId, sessionId, candidateId }) as Promise<Row>,
    credits: (images: Pick<Draft2Images, "slides">, inventory: unknown) => exports.captionCredits(images, inventory) as string[],
    showCredits: (shown: boolean) => exports.recordCaptionCredits({ topicId, sessionId, shown }) as Promise<Row>,
    showSource: (shown: boolean) => exports.recordCaptionSource({ topicId, sessionId, shown }) as Promise<Row>,
    calls,
    row: () => row,
  };
}

test("Claude writes three captions for the finished carousel and Sol judges them; both read the carousel, the focus, the accounts tagged, the credits and the post's limits", async () => {
  const h = harness({ writes: [writer], judgments: [judge("accept", "c2", { c2: 96 })] });
  const session = await h.run();
  const [claude, sol] = h.calls;
  assert.equal(json(claude.input.context), json({
    focus: focusTypes.focusForModels(FOCUS.values), carousel, mentions: [{ name: "Bibliothèques de Longueuil", handle: "@biblio.longueuil" }], credits: [],
    limits: { postCharacters: 2200, hashtags: { min: 5, max: 8 } }, verifiedFacts: funnel.factsSnapshot(facts),
  }), "only the account the editor confirmed; the one Instagram verified but nobody confirmed is not offered");
  assert.equal(json([(claude.input.contents as WriterContents).candidatesWanted, claude.input.effort, (sol.input.contents as JudgeContents).proposalsWanted]), json([3, "medium", 1]));
  for (const call of [claude, sol]) {
    assert.ok(String(call.input.instructions).includes(captions.CAPTIONS_SKILL.text));
    assert.ok(String(call.input.instructions).includes("- Emojis: at most 3 in the whole caption."));
    assert.ok(String(call.input.instructions).includes("the same single action, stated once (Save this for Saturday.)"));
  }
  assert.equal(json(session.trace.map((entry) => [entry.step, entry.operation, entry.skillVersions])), json([["caption", "draft2_caption", { captions: "4", fairness: "2", reader: "3" }], ["caption", "draft2_caption_review", { captions: "4", fairness: "2", reader: "3" }]]));
  const run = session.caption!;
  assert.equal(json([session.step, session.status, run.status, run.winnerId, run.imagesRunId, run.mentionsVersion, run.credits, run.rules]),
    json(["caption", "ready", "ready", "c2", "run-1", 4, [], { emojis: 3, ctaStyle: "One warm, concrete step", cta: "Save this for Saturday.", grave: false }]));
  assert.ok(run.rounds[0].candidates[0].text.includes("\n\n"), "the line breaks are kept");
});

test("then the best revised beside Sol's caption as written and as edited, for Sol's pick", async () => {
  const h = harness({ writes: [writer, writer], judgments: [judge("revise", "c2", { c2: 90 }), judge("revise", "c4", { "c2.2": 92, c4: 93, c5: 91 })] });
  const session = await h.run();
  assert.equal(json(session.caption?.rounds.map((round) => round.candidates.map((candidate) => [candidate.id, candidate.proposalOf ?? null, candidate.asProposed ?? false]))),
    json([[["c1", null, false], ["c2", null, false], ["c3", null, false]], [["c2.2", null, false], ["c4", "p1", false], ["c5", "p1", true]]]));
  assert.match(String(session.error), /^Sol did not accept a caption after 2 rounds\. The best version, c4, scored 93\/100/);
});

test("a caption that tags an account the editor did not confirm can never win", async () => {
  const unconfirmed = (contents: WriterContents) => ({ candidates: (writer(contents).candidates as Draft2CaptionCandidate[]).map((candidate) => candidate.id === "c1" ? { ...candidate, text: `${candidate.text}\nWith @cfournier.` } : candidate) });
  const h = harness({ writes: [unconfirmed], judgments: [judge("accept", "c1", { c1: 98, c2: 96 })] });
  const session = await h.run();
  assert.equal(json(session.caption?.rounds[0].mechanical.map((issue) => [issue.candidateId, issue.code])), json([["c1", "UNVERIFIED_MENTION"]]));
  assert.equal(session.caption?.winnerId, "c2", "Sol's pick has a program finding; the best clean caption wins");
});

test("a caption that leaves out an account the editor confirmed can never win", async () => {
  const untagged = (contents: WriterContents) => ({ candidates: (writer(contents).candidates as Draft2CaptionCandidate[]).map((candidate) => candidate.id === "c1" ? { ...candidate, text: candidate.text.replace(" with @biblio.longueuil.", ".") } : candidate) });
  const h = harness({ writes: [untagged], judgments: [judge("accept", "c1", { c1: 98, c2: 96 })] });
  const session = await h.run();
  assert.equal(json(session.caption?.rounds[0].mechanical.map((issue) => [issue.candidateId, issue.code, issue.detail])),
    json([["c1", "MENTION_MISSING", "@biblio.longueuil is an account the editor confirmed; tag it once, where its name would go or right after it."]]));
  assert.equal(session.caption?.winnerId, "c2", "the editor confirmed the account to have it tagged; the best caption that tags it wins");
});

test("the caption waits for the finished carousel: every slide made, from a visual script still in the session", async () => {
  const refused = (session: Record<string, unknown>, pattern: RegExp) => assert.rejects(harness({ session }).run(), (error: Error) => error instanceof types.Draft2InputError && pattern.test(error.message));
  await refused({ images: null }, /Finish the images first/);
  await refused({ images: { ...IMAGES, status: "paused" } }, /Finish the images first/);
  await refused({ images: { ...IMAGES, slides: [IMAGES.slides[0], { ...IMAGES.slides[1], attempts: [generated(1, { status: "generating", review: undefined })] }, IMAGES.slides[2]] } }, /Finish the images first/);
  await refused({ images: { ...IMAGES, slides: [IMAGES.slides[0], { ...IMAGES.slides[1], attempts: [generated(1, { status: "failed", review: undefined })] }, IMAGES.slides[2]] } }, /Make the missing ones first/);
  await refused({ images: { ...IMAGES, visualId: "c9" } }, /The visual script changed since the images were made/);
});

test("a stopped run continues only while the images and the accounts tagged are the ones it wrote for", async () => {
  const stopped: Partial<Draft2Caption> = { status: "paused", resumeRound: 2, rounds: [], candidates: [], imagesRunId: "run-1", carousel, focus: FOCUS, mentions: [{ name: "Bibliothèques de Longueuil", handle: "@biblio.longueuil" }], mentionsVersion: 4, credits: [] };
  await assert.rejects(harness({ session: { caption: stopped, images: { ...IMAGES, runId: "run-2" } } }).run(true), /The images changed since this run started/);
  const untagged = { ...MENTIONS, version: 5, accounts: MENTIONS.accounts.map((account) => ({ ...account, status: "verified" as const })) };
  await assert.rejects(harness({ session: { caption: stopped, mentions: untagged } }).run(true), /The accounts to tag changed since this run started/);
  const sameTags = { ...MENTIONS, version: 6, accounts: [MENTIONS.accounts[0], { ...MENTIONS.accounts[1], status: "rejected" as const }] };
  const h = harness({ writes: [writer], judgments: [judge("accept", "c2.2", { "c2.2": 97 })], session: { caption: { ...stopped, rounds: [{ round: 1, candidates: [caption("c1", OPENINGS[0]), caption("c2", OPENINGS[1])], mechanical: [], at: "t", evaluation: { verdict: "revise", winnerId: "c2", summary: "x", issues: [], suggestions: [], scores: [score("c2", 90), score("c1", 80)], proposals: [] } }] }, mentions: sameTags } });
  const session = await h.run(true);
  assert.equal(json([session.caption?.status, session.caption?.winnerId]), json(["ready", "c2.2"]), "a decision on another account changes nothing the caption tags");
});

test("the credits the post owes, as v1 owes them: a photo pasted unchanged, a Commons photo the model adapted, a verified place photo it received", () => {
  const h = harness();
  const inventory = {
    entities: [{ id: "e4", name: "Bibliothèque Raymond-Lévesque", kind: "place", place: { photo: { author: "B. Lens", license: "CC BY 4.0", source: "openverse" } } }, { id: "e5", name: "Parc", kind: "place", place: { photo: { author: "C. Field", license: "CC BY-SA 4.0", source: "commons" } } }],
    storyPhotos: [{ id: "p1", name: "Mayor", provenance: "Photo: Ville de Longueuil" }, { id: "p2", name: "Library", provenance: "A. Lens via Wikimedia Commons, CC BY-SA 4.0" }, { id: "p3", name: "Editor's", provenance: "Editor upload" }],
  };
  const images = { slides: [
    slideImage("cover", 1, [{ kind: "pasted-photo", storyPhotoId: "p1", name: "Mayor", person: true }]),
    slideImage("slide2", 2, [{ kind: "story-photo", storyPhotoId: "p2", name: "Library", purpose: "place" }, { kind: "story-photo", storyPhotoId: "p3", name: "Editor's", purpose: "subject" }, { kind: "place-photo", entityId: "e4", name: "Bibliothèque Raymond-Lévesque" }], [generated(1, { placePhoto: "Bibliothèque Raymond-Lévesque" })]),
    slideImage("last", 3, [{ kind: "place-photo", entityId: "e5", name: "Parc" }, { kind: "pasted-photo", storyPhotoId: "p1", name: "Mayor", person: true }]),
  ] };
  assert.equal(json(h.credits(images, inventory)), json(["Portrait: Photo: Ville de Longueuil", "Adapted from: A. Lens via Wikimedia Commons, CC BY-SA 4.0", "Place photo: B. Lens · CC BY 4.0 · openverse"]),
    "the editor's own upload owes no credit; a place photo the model did not receive owes none; each credit once");
  assert.equal(json(h.credits({ slides: [slideImage("cover", 1, [{ kind: "pasted-photo", storyPhotoId: "p1", name: "Mayor", person: true }], [generated(1, { status: "failed", review: undefined })])] }, inventory)), json([]), "a slide without an image owes nothing");
});

test("the editor's own images owe their own credit when licensed: a photo on a slide instead of the slide's material, a section of their scene beside it", () => {
  const h = harness();
  const inventory = { entities: [], storyPhotos: [{ id: "p1", name: "Mayor", provenance: "Photo: Ville de Longueuil" }] };
  const own = (fill: "slide" | "scene", rights: "own" | "licensed", provenance?: string) => ({ fill, source: fill === "slide" ? "story-photo" as const : "upload" as const, name: "x", rights, ...(provenance ? { provenance } : {}), sha256: "a", width: 1, height: 1 });
  const images = { slides: [
    slideImage("cover", 1, [{ kind: "pasted-photo", storyPhotoId: "p1", name: "Mayor", person: true }], [generated(1), generated(2, { kind: "own", review: undefined, own: own("slide", "licensed", "Photo: Ana Ruiz · CC BY 4.0") })]),
    slideImage("slide2", 2, [], [generated(1, { kind: "own", review: undefined, own: own("slide", "own") })]),
    slideImage("last", 3, [{ kind: "pasted-photo", storyPhotoId: "p1", name: "Mayor", person: true }], [generated(1, { kind: "section", review: undefined, own: own("scene", "licensed", "Scene: Luis Paz · CC BY 4.0") })]),
  ] };
  assert.equal(json(h.credits(images, inventory)), json(["Portrait: Photo: Ana Ruiz · CC BY 4.0", "Portrait: Scene: Luis Paz · CC BY 4.0", "Portrait: Photo: Ville de Longueuil"]),
    "the cover's portrait is not on the editor's photo; their own photo owes nothing; a section of their scene keeps its slide's portrait");
});

test("the editor shows or leaves out the photo credits: no provider call, the choice stays with the next run, never while a run writes", async () => {
  const h = harness({ writes: [writer, writer], judgments: [judge("accept", "c1", { c1: 96 }), judge("accept", "c1", { c1: 96 })] });
  await h.run();
  const calls = h.calls.length;
  const hidden = await h.showCredits(false);
  assert.equal(hidden.caption?.creditsHidden, true);
  assert.equal(await h.showCredits(false), hidden, "the same choice changes nothing");
  assert.equal(h.calls.length, calls, "no provider call");
  const next = await h.run();
  assert.equal(json([next.caption?.creditsHidden, next.caption?.previousRuns?.length]), json([true, 1]), "a new run keeps the editor's choice");
  assert.equal((await h.showCredits(true)).caption?.creditsHidden, undefined);
  await assert.rejects(harness({ session: { caption: { ...next.caption, status: "running" } } }).showCredits(false), (error: Error) => error instanceof types.Draft2BusyError && /The caption is being written/.test(error.message));
  await assert.rejects(harness().showCredits(false), /Write the caption first/);
});

test("the post names where the story was reported, after the caption and before the credits: the models know the line, it counts toward the limit, and the editor may leave it out", async () => {
  const h = harness({ writes: [writer, writer], judgments: [judge("accept", "c1", { c1: 96 }), judge("accept", "c1", { c1: 96 })], sources: ["https://www.journaldemontreal.com/2026/10/14/houston", "https://presscraftor.local/owned-content/1", "https://journaldemontreal.com/autre"] });
  const session = await h.run();
  const line = "Source\u00a0: journaldemontreal.com";
  assert.equal(json([session.caption?.sources, session.caption?.source, (h.calls[0].input.context as { source?: string }).source]), json([["journaldemontreal.com"], line, line]), "one host once, the publication's own content left out, in the publication's language");
  assert.equal(captionTypes.captionPostText({ text: "Le Houston perd son permis d'alcool.", source: session.caption?.source, credits: ["Photo : A. Lens"], hashtags: ["Brossard"] }), `Le Houston perd son permis d'alcool.\n\n${line}\nPhoto : A. Lens\n\n#Brossard`);
  const calls = h.calls.length;
  const hidden = await h.showSource(false);
  assert.equal(json([hidden.caption?.sourceHidden, captionTypes.shownSource(hidden.caption), h.calls.length]), json([true, undefined, calls]), "left out with no provider call");
  const next = await h.run();
  assert.equal(json([next.caption?.sourceHidden, next.caption?.source]), json([true, line]), "a new run keeps the editor's choice and its line");
  assert.equal(captionTypes.shownSource((await h.showSource(true)).caption), line);
  await assert.rejects(harness().showSource(false), /Write the caption first/);
  assert.equal((await harness({ writes: [writer], judgments: [judge("accept", "c1", { c1: 96 })] }).run()).caption?.source, undefined, "a story without an outside source has no line");
});

test("the source line reads in the publication's language and names at most three hosts", () => {
  assert.equal(captionTypes.captionSourceLine(["a.com", "b.org"], "English"), "Sources: a.com, b.org");
  assert.equal(captionTypes.captionSourceLine(["a.com"], "Spanish"), "Fuente: a.com");
  assert.equal(captionTypes.captionSourceLine(["a.com"], "french"), "Source\u00a0: a.com");
  assert.equal(captionTypes.captionSourceLine([], "French"), undefined);
  assert.equal(json(captionTypes.captionSourceHosts(["https://www.a.com/x", "not a url", "https://b.org/y", "https://c.net", "https://d.io", "https://A.com/z"])), json(["a.com", "b.org", "c.net"]));
});

test("a Google News item credits the outlet its title names, never news.google.com (Salut Brossard read \"Source : news.google.com\" until 2026-10-20); an outlet already credited by its address is not credited twice", () => {
  const google = (title: string) => ({ url: "https://news.google.com/rss/articles/CBMiXYZ?oc=5", title });
  assert.equal(json(captionTypes.captionSourceHosts([google("Patinage thématique – Soirée costumée d’Halloween - Ville de Brossard")])), json(["Ville de Brossard"]));
  assert.equal(json(captionTypes.captionSourceHosts([google("Actualités | Les marchés de Noël sont de retour sur la Rive-Sud - https://www.tvrs.ca/")])), json(["tvrs.ca"]), "an outlet given as its address is credited as its host");
  assert.equal(json(captionTypes.captionSourceHosts([google("A headline without its outlet")])), json([]), "no outlet named: the aggregator is not credited");
  assert.equal(json(captionTypes.captionSourceHosts(["https://lecourrierdusud.ca/brossard-x", google("Brossard: ils percutent une auto de police - Le Courrier du sud"), { url: "https://www.fm1033.ca/a", title: "x" }, google("Un titre - FM 103,3")])), json(["lecourrierdusud.ca", "fm1033.ca"]), "the same outlet, by its address and by its name, once");
  assert.equal(captionTypes.aggregatorOutlet("No outlet here"), undefined);
});

test("the editor can choose any caption of the run", async () => {
  const h = harness({ writes: [writer], judgments: [judge("accept", "c1", { c1: 96 })] });
  await h.run();
  assert.equal((await h.choose("c3")).caption?.editorChoiceId, "c3");
  await assert.rejects(h.choose("c99"), /c99 is not one of this caption's versions/);
});
