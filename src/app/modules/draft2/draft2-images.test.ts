import assert from "node:assert/strict";
import test from "node:test";
import * as types from "./draft2-facts.types";
import * as funnel from "./draft2-funnel";
import * as models from "./draft2-models";
import * as imagesTypes from "./draft2-images.types";
import * as openingTypes from "./draft2-opening.types";
import * as skills from "./skills/draft2-skills";
import * as imageSkills from "./skills/images";
import * as review from "../stories/creative-image-review";
import * as imageModels from "../stories/creative-image-models";
import * as falCost from "../stories/fal-image-cost";
import * as storyRefs from "../stories/story-reference-generation";
import * as brandOverlayModule from "../stories/creative-brand-overlay";
import * as contentTypes from "../stories/creative-content.types";
import * as geoContact from "../stories/creative-geo-contact";
import * as characterGeneration from "../stories/creative-character-generation";
import * as selectBrand from "../stories/select-brand-references";
import { loadInSandbox } from "./draft2-test-sandbox";
import type { Draft2Images } from "./draft2-images.types";
import type { Draft2Inventory } from "./draft2-inventory.types";
import type { Draft2CarouselSlide, Draft2Visual, Draft2VisualCandidate, Draft2VisualSlide } from "./draft2-visual.types";

const topicId = "11111111-1111-4111-8111-111111111111";
const storyId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const json = (value: unknown) => JSON.stringify(value);

const facts: types.Draft2Fact[] = [
  { id: "f1", claim: "Children bring treats to the animals on Saturday.", evidence: "bring treats to the animals", kind: "event", status: "established", importance: 90 },
  { id: "f2", claim: "Naturalists explain toads, spiders and bats.", evidence: "toads, spiders and bats", kind: "event", status: "established", importance: 70 },
];
const carousel: Draft2CarouselSlide[] = [
  { slide: "cover", label: "Cover", headline: "Treats for the animals", text: "A free rally on Saturday.", factIds: ["f1"] },
  { slide: "s1", label: "Slide 2", headline: "Toads, spiders and bats", text: "Naturalists explain them.", factIds: ["f2"] },
  { slide: "last", label: "Slide 3", headline: "See you there", text: "Light rain is fine.", cta: "Follow us.", factIds: ["f1"] },
];
const scriptSlide = (slide: string, overrides: Partial<Draft2VisualSlide> = {}): Draft2VisualSlide => ({
  slide, beat: `A child walks on ${slide}`, subject: `the ${slide} trail`, discovery: `What ${slide} shows first`, recurring: "none", shot: slide === "s1" ? "close" : "wide", headlineLink: "", direction: `Photographic collage on cream: a child's boots on a trail, ${slide}.`, need: "generic-illustration", characterIds: [], references: [], ...overrides,
});
const SCRIPT: Draft2VisualCandidate = {
  id: "c4", angle: "The walk", concept: "A family walks the trail and meets its animals.", protagonist: "A child seen from behind", motif: "Boots that get muddier", cast: "A child and an adult",
  characterPlan: { use: true, characterIds: ["char-jo"], role: "Guide" },
  slides: [scriptSlide("cover"), scriptSlide("s1", { characterIds: ["char-jo"], need: "character-reference" }), scriptSlide("last")],
};
const VISUAL: Draft2Visual = {
  status: "needs-review", winnerId: "c4", candidates: [SCRIPT], carousel, deckId: "c3", inventoryVersion: 2, mode: "illustration-editorial",
  focus: { version: 1, values: { voice: { gravity: "light", formality: 30, humor: 60, energy: 70, optimism: 70, provocation: 20 } } as never },
  rounds: [{ round: 1, candidates: [SCRIPT], mechanical: [], at: "t", evaluation: { verdict: "revise", winnerId: "c4", scores: [{ candidateId: "c4", narrative: 94, progression: 94, beat: 94, continuity: 94, brand: 94, truth: 94, craft: 94, focus: 94, overall: 94, note: "x" }], issues: [], suggestions: [], summary: "x" } }],
};
const INVENTORY: Draft2Inventory = { status: "ready", version: 2, entities: [], storyPhotos: [], characters: "auto", roster: [{ id: "char-jo", name: "Jo", description: "An illustrated guide" }] };
const ASSET = { id: "logo-1", fileName: "logo.png", contentType: "image/png", fileSize: 10, width: 400, height: 200, createdAt: new Date(0) };
const profile = {
  name: "Salut St-Jean", language: "French", region: "Saint-Jean", platform: "Instagram", audience: "Families", brandPersonality: ["warm"], formality: 30, humor: 40, energy: 60, optimism: 60, provocation: 20,
  visualGuidance: "", creativeIdentity: { avoid: [{ category: "Marks", items: ["Polaroid frames"] }], allowed: [], acceptance: [] }, brandPalette: [{ name: "Navy", color: "#173F52", role: "primary" }, { name: "Cream", color: "#F6F0E4", role: "surface" }, { name: "Gold", color: "#E3A62F", role: "secondary" }],
  brandOverlay: { enabled: true, scope: "first-unit", placement: "top-left", sizePercent: 12, insetPercent: 2, backdropMode: "none", backdropColor: "#F6F0E4", backdropOpacity: 0, assetId: "logo-1", asset: ASSET },
  carouselChrome: { enabled: true, style: "blob", backgroundColor: "#173F52", textColor: "#E3A62F", accentColor: "#F6F0E4" },
  geoScope: { municipality: "Saint-Jean-sur-Richelieu", region: "Québec", country: "Canada", validatedLocationId: null }, geoProviderContact: "editor@example.com",
};

type Row = Record<string, unknown> & { images: Draft2Images | null; trace: types.Draft2TraceEntry[]; updatedAt: Date; status: string };
type Review = (slide: string, version: number) => Record<string, unknown>;
/** Sol's answer for a slide whose words came out exactly as expected. */
const clean: Review = () => ({ transcription: "", textCovered: false, textNote: "", storyNote: "The walk reads." });

/** polls: how many times fal answers "generating" before an image is done; clock: a fake clock each poll moves by pollMs. */
function harness({ session, polls = 1, reviewOf = clean, clock, pollMs = 30_000 }: { session?: Record<string, unknown>; polls?: number; reviewOf?: Review; clock?: { now: number }; pollMs?: number } = {}) {
  const calls = {
    submits: [] as { endpoint: string; prompt: string; files: string[] }[],
    reviews: [] as { slide: string; contents: Record<string, unknown> }[],
    charges: [] as Record<string, unknown>[],
    prompts: [] as Record<string, unknown>[],
  };
  const r2 = new Map<string, Buffer>();
  const pollsLeft = new Map<string, number>();
  let requestCount = 0;
  let row: Row = { id: sessionId, topicId, storyId, step: "visual", status: "needs-review", facts, visual: VISUAL, deck: { editorChoiceId: "c3" }, inventory: INVENTORY, images: null, error: null, trace: [], updatedAt: new Date(), ...session } as Row;
  /** Each compositor appends its name, so the stored image shows the order they ran in. */
  const step = (name: string) => async ({ image }: { image: Uint8Array }) => Buffer.from(`${Buffer.from(image).toString()}|${name}`);
  const expected = (unit: { headline: string; subheadline?: string; body?: string; ctaQuestion?: string }) => [unit.headline, unit.subheadline, unit.body, unit.ctaQuestion].filter(Boolean).join("\n");
  const fakeSharp = () => ({ png: () => ({ toBuffer: async () => Buffer.from("map-png") }), resize: () => ({ jpeg: () => ({ toBuffer: async () => Buffer.from("jpeg") }) }) });
  const fakeDate = (source: { now: number }) => class extends Date { constructor(...args: unknown[]) { if (args.length) super(...(args as [string])); else super(source.now); } static now() { return source.now; } };
  const FakeDate = clock ? fakeDate(clock) : Date;
  const mocks: Record<string, unknown> = {
    "server-only": {},
    // A default import, as the sandbox transpiles it.
    "sharp": { default: fakeSharp },
    "./draft2-facts.types": types,
    "./draft2-funnel": funnel,
    "./draft2-models": models,
    "./draft2-images.types": imagesTypes,
    "./draft2-opening.types": openingTypes,
    "./skills/draft2-skills": skills,
    "./skills/images": imageSkills,
    "./draft2-dev-trace": { draft2DevTrace: () => undefined },
    "./draft2-inventory": { placeMention: (entity: { name: string }) => ({ name: entity.name, kind: "named", role: "event", excerpt: entity.name, municipality: "", region: "", country: "", purpose: "location" }) },
    "../stories/creative-text-meter": { withCreativeTextBudget: async (_context: unknown, work: () => Promise<unknown>) => work() },
    "../stories/creative-profile.repository": { getCreativeProfile: async () => profile },
    "../stories/build-creative-image-prompt": { buildCreativeImagePrompt: (input: { unit: { order: number; visualDirection: string; headline: string }; characters: { name: string }[]; verifiedImagery: boolean; brandOverlay?: unknown; draft: { concept: string }; brief: { tone: unknown } }) => {
      calls.prompts.push({ order: input.unit.order, characters: input.characters.map((character) => character.name), verifiedImagery: input.verifiedImagery, logo: Boolean(input.brandOverlay), concept: input.draft.concept, tone: input.brief.tone, direction: input.unit.visualDirection });
      return { prompt: `PROMPT ${input.unit.order}: ${input.unit.visualDirection}`, expectedText: expected(input.unit) };
    } },
    "../stories/creative-content.types": contentTypes,
    "../stories/creative-carousel-chrome": {
      buildCreativeCarouselChrome: (input: { unitOrder: number; totalSlides: number }) => ({ copy: {}, overlay: { order: input.unitOrder, total: input.totalSlides }, promptReservation: "<CHROME>" }),
      compositeCreativeCarouselChrome: async ({ image, chrome }: { image: Uint8Array; chrome: { overlay: { order: number; total: number } } }) => Buffer.from(`${Buffer.from(image).toString()}|${chrome.overlay.order}/${chrome.overlay.total}`),
    },
    "../stories/creative-brand-overlay": brandOverlayModule,
    "../stories/creative-brand-assets.repository": {
      findCreativeBrandAsset: async () => ({ ...ASSET, objectKey: "brand/logo.png", sha256: "b".repeat(64) }),
      creativeBrandOverlaySnapshot: (settings: Record<string, unknown>, asset: Record<string, unknown>) => ({ ...settings, compositorVersion: 1, asset }),
    },
    "../stories/manage-creative-assets": { compositeStoredCreativeBrand: step("logo"), isTransientFalSubmitError: () => false },
    "../stories/creative-portrait-composite": {
      compositeDocumentaryPortrait: step("portrait"), portraitAccent: () => "#E3A62F", portraitLayoutForSlide: () => "rounded-left",
      portraitPhotoRegion: () => ({ left: 10, top: 40, right: 50, bottom: 90 }), portraitZonePrompt: () => "\n<DOCUMENTARY_PHOTO_ZONE>",
    },
    "../stories/creative-map-panel": {
      compositeMapPanel: step("map"), mapInsetVisualDirection: (direction: string) => `${direction} MAP INSET`, mapPaletteFromBrand: () => ({ surface: "#F6F0E4", primary: "#173F52", accent: "#E3A62F" }),
      mapPanelRegion: () => ({ left: 54, top: 63, right: 95, bottom: 90 }), mapPanelZonePrompt: () => "\n<VERIFIED_MAP_ZONE>", streetAddress: (address: string) => address.split(",")[0],
    },
    "../stories/story-reference-generation": storyRefs,
    "../stories/manage-story-photos": {
      resolveStoryReferences: async (_topic: string, _story: string, selections: { id: string; purpose: string }[]) => selections.map((selection) => ({ ...selection, name: selection.id, description: "", provenance: "Editor", providerTransmissionAllowed: true, active: true, topicId, storyId, objectKey: `story/${selection.id}`, sha256: "c".repeat(64), contentType: "image/png", fileName: `${selection.id}.png` })),
      loadStoryReferenceImages: async (references: { id: string }[]) => references.map((reference) => new File([Buffer.from(reference.id)], `${reference.id}.png`, { type: "image/png" })),
      loadDocumentaryPortraitPhoto: async () => Buffer.from("portrait"),
      currentPortraitFocus: async () => undefined,
    },
    "../stories/creative-characters.repository": { snapshotsForCreativeCharacterIds: async (_topic: string, ids: string[]) => new Map(ids.map((id) => [id, { id, name: "Jo", description: "An illustrated guide", referenceFingerprint: "x", referenceImages: [{ id: "ref-1", fileName: "jo.png", contentType: "image/png", fileSize: 3, order: 0, createdAt: new Date(0), objectKey: "characters/jo.png" }] }])) },
    "../stories/creative-character-generation": characterGeneration,
    "../stories/creative-brand-references.repository": { listActivatedBrandReferences: async () => [] },
    "../stories/select-brand-references": selectBrand,
    "../stories/resolve-brand-generation": { resolveBrandGenerationReferences: async () => [], loadBrandGenerationImages: async () => [] },
    "../stories/creative-brand-generation": { brandReferencePrompt: () => "" },
    "../stories/fal-image-generation.config": {
      getFalImageRuntimeConfig: () => ({ provider: "fal", model: "openai/gpt-image-2.5/sunburst/text-to-image", width: 1080, height: 1350, promptVersion: "v13", generationWidth: 1088, generationHeight: 1360, aspectRatio: "4:5", apiKey: "fal-key", retention: "30d" }),
      resolveDefaultCreativeImageModel: () => "gpt-image",
      FalImageConfigurationError: class extends Error {},
    },
    "../stories/creative-image-models": imageModels,
    "../stories/fal-image-client": {
      submitFalImage: async (input: { endpoint: string; prompt: string; referenceImages: File[] }) => {
        calls.submits.push({ endpoint: input.endpoint, prompt: input.prompt, files: input.referenceImages.map((file) => file.name) });
        const id = `req-${++requestCount}`;
        pollsLeft.set(id, polls);
        return id;
      },
      pollFalImage: async (input: { requestId: string; postProcess: (value: { normalizedPng: Uint8Array; requestId: string; width: number; height: number }) => Promise<Uint8Array> }) => {
        const left = pollsLeft.get(input.requestId) ?? 0;
        if (clock) clock.now += pollMs;
        if (left > 0) { pollsLeft.set(input.requestId, left - 1); return { status: "generating" }; }
        await input.postProcess({ normalizedPng: Buffer.from(`raw:${input.requestId}`), requestId: input.requestId, width: 1080, height: 1350 });
        return { status: "generated", image: { url: `https://v3.fal.media/${input.requestId}.png`, seed: 1 } };
      },
    },
    "../stories/fal-image-cost": falCost,
    "../credits/usage-charges.repository": { recordUsageCharge: async (input: Record<string, unknown>) => { calls.charges.push(input); } },
    "../stories/r2-storage": {
      buildDraft2ImageObjectKey: (input: { runId: string; file: string }) => `draft2/${input.runId}/${input.file}`,
      putPrivateR2Object: async (input: { objectKey: string; body: Uint8Array }) => { r2.set(input.objectKey, Buffer.from(input.body)); return { objectKey: input.objectKey }; },
      readPrivateR2ImageFile: async (input: { objectKey: string; fileName?: string }) => {
        const bytes = r2.get(input.objectKey) ?? (input.objectKey.startsWith("characters/") ? Buffer.from("jo") : undefined);
        if (!bytes) throw new Error(`No object ${input.objectKey}`);
        return new File([new Uint8Array(bytes)], input.fileName ?? input.objectKey.split("/").pop()!, { type: "image/png" });
      },
    },
    "../stories/creative-documentary-providers": { documentaryProviders: () => ({ resolve: async () => ({ id: "Q2", name: "Parc", sourceUrl: "s", revision: 1, scope: profile.geoScope, hierarchy: [], coordinates: { latitude: 45.3, longitude: -73.2, precision: 0.001 } }), photo: async () => ({ evidence: { contentType: "image/jpeg" }, bytes: Buffer.from("park") }) }) },
    "../stories/creative-documentary": { eligiblePhoto: () => true },
    "../stories/openverse-place-photo": { openversePlacePhoto: async () => undefined },
    "../stories/google-maps-provider": { googleMapsConfig: () => ({ enabled: true, apiKey: "g", signingSecret: "", maxPhotos: 2, maxPreviewsPerDay: 10 }), googleMapsProvider: () => ({ map: async () => Buffer.from("google-map") }) },
    "../stories/open-map-render": { renderOpenMap: async () => Buffer.from("osm-map") },
    "../stories/open-map-geometry": { OSM_ATTRIBUTION: "© OpenStreetMap contributors" },
    "../stories/creative-geo-contact": geoContact,
    "../stories/creative-place-visual": { verifiedPlacePhotoInstruction: (name: string) => `\nPLACE PHOTO ${name}` },
    "../stories/creative-image-review": review,
    "../stories/openai-structured-response": { generateOpenAiStructuredResponse: async (input: { contents: { slide: { label: string }; visibleText: string }; schemaName: string; images: string[] }) => {
      const slide = carousel.find((entry) => entry.label === input.contents.slide.label)!.slide;
      calls.reviews.push({ slide, contents: input.contents as unknown as Record<string, unknown> });
      const version = calls.reviews.filter((entry) => entry.slide === slide).length;
      const answer = { peopleOutsideVerifiedPhoto: false, possibleRealPersonLikeness: false, thirdPartyLogos: [], brandAvoidViolations: [], factContradictions: [], inventedNamedSubject: "", summary: "", transcription: input.contents.visibleText, textCovered: false, textNote: "", storyNote: "", ...reviewOf(slide, version) };
      if (!answer.transcription) answer.transcription = input.contents.visibleText;
      return { text: JSON.stringify(answer), provider: "openai", model: "gpt-6.1-sol", usage: { promptTokens: 900, outputTokens: 200, thoughtsTokens: 40, totalTokens: 1100 }, cachedInputTokens: 0 };
    } },
    "./draft2-session.repository": {
      activeDraft2Session: async () => undefined,
      getDraft2Session: async (topic: string, id: string) => topic === topicId && id === row.id ? row : undefined,
      claimDraft2Session: async (_id: string, patch: Record<string, unknown>) => { row = { ...row, ...patch, status: "running", updatedAt: new Date() } as Row; return row; },
      updateDraft2Session: async (_id: string, patch: Record<string, unknown>) => { row = { ...row, ...JSON.parse(JSON.stringify(patch)), updatedAt: new Date() } as Row; return row; },
      touchDraft2Session: async () => undefined,
    },
  };
  const exports = loadInSandbox("./draft2-images.ts", mocks, {
    Date: FakeDate, Buffer, File, AbortController, setTimeout: (callback: () => void) => { queueMicrotask(callback); return 0; }, clearTimeout: () => undefined,
    process: { env: { OPENAI_API_KEY: "sk-test", FAL_KEY: "fal-key" } }, encodeURIComponent,
  }) as Record<string, (...args: unknown[]) => Promise<Row & { arrayBuffer?: () => Promise<ArrayBuffer> }>>;
  return {
    run: (options: { resume?: boolean } = {}) => exports.runDraft2Images({ topicId, storyId, sessionId, ...options }),
    decide: (input: Record<string, unknown>) => exports.editDraft2Images({ topicId, sessionId, input }),
    file: (input: Record<string, unknown>) => exports.draft2ImageFile({ topicId, sessionId, ...input }) as unknown as Promise<File>,
    calls,
    r2,
    row: () => row,
    setRow: (patch: Record<string, unknown>) => { row = { ...row, ...patch } as Row; },
  };
}

const stored = (h: ReturnType<typeof harness>, file: string) => h.r2.get(`draft2/${h.row().images!.runId}/${file}`)?.toString();

test("every slide is made from v1's prompt, finished with v1's post-production in v1's order, stored, charged once and reviewed by Sol", async () => {
  const h = harness();
  const session = await h.run();
  const images = session.images!;
  assert.equal(json([session.status, session.step, images.status, images.quality, images.visualId]), json(["ready", "images", "ready", "low", "c4"]));
  assert.equal(json(h.calls.submits.map((submit) => [submit.endpoint, submit.files])), json([
    ["openai/gpt-image-2.5/sunburst/text-to-image", []],
    ["openai/gpt-image-2.5/sunburst/edit", ["jo.png"]],
    ["openai/gpt-image-2.5/sunburst/text-to-image", []],
  ]), "Jo's reference image goes to the edit endpoint");
  assert.equal(json(h.calls.prompts.map((prompt) => [prompt.order, prompt.characters, prompt.logo])), json([[1, [], true], [2, ["Jo"], true], [3, [], true]]));
  assert.equal(h.calls.prompts[0].concept, "A family walks the trail and meets its animals. When a slide shows them, the recurring cast looks the same on every slide: A child and an adult.", "never the protagonist or the motif on every slide");
  assert.equal(json(h.calls.prompts[0].tone), json({ primary: "playful", energy: 70, humor: 60, reason: "The story's focus." }), "the focus's voice");
  assert.match(String(h.calls.prompts[1].direction), /^What happens: A child walks on s1\. Its subject: the s1 trail\. Photographic collage/);
  // The page number on every slide, then the logo on the cover only (first-unit); the image before them is kept for edits.
  const request = (slide: number) => images.slides[slide].attempts[0].requestId;
  assert.equal(json([stored(h, "cover-v1.png"), stored(h, "s1-v1.png"), stored(h, "last-v1.png"), stored(h, "cover-v1-base.png")]), json([`raw:${request(0)}|1/3|logo`, `raw:${request(1)}|2/3`, `raw:${request(2)}|3/3`, `raw:${request(0)}`]));
  assert.match(String(stored(h, "s1-v1-prompt.txt")), /^PROMPT 2: /);
  assert.equal(json(h.calls.charges.map((charge) => [charge.kind, charge.provider, charge.operation, charge.idempotencyKey, charge.estimated]).sort((a, b) => String(a[3]).localeCompare(String(b[3])))), json([
    ["image", "fal", "draft2_image", `draft2-image:${images.runId}:cover:v1`, true], ["image", "fal", "draft2_image", `draft2-image:${images.runId}:last:v1`, true], ["image", "fal", "draft2_image", `draft2-image:${images.runId}:s1:v1`, true],
  ]));
  assert.equal(json(images.slides.map((slide) => [slide.slide, slide.attempts.map((attempt) => [attempt.version, attempt.kind, attempt.status, attempt.review?.status])])), json([
    ["cover", [[1, "generate", "generated", "passed"]]], ["s1", [[1, "generate", "generated", "passed"]]], ["last", [[1, "generate", "generated", "passed"]]],
  ]));
  assert.equal(json(h.calls.reviews.map((entry) => [entry.slide, (entry.contents.addedAfterwards as Record<string, unknown>).logo, (entry.contents.addedAfterwards as Record<string, unknown>).pageNumber])), json([["cover", true, "1/3"], ["s1", false, "2/3"], ["last", false, "3/3"]]));
  assert.equal(json((h.calls.reviews[1].contents as { approvedFictionalCharacters: unknown }).approvedFictionalCharacters), json([{ name: "Jo", description: "An illustrated guide" }]));
  assert.equal(json(session.trace.map((entry) => [entry.step, entry.operation, entry.note, entry.skillVersions])), json([
    ["images", "draft2_image_review", "Cover", { images: "1" }], ["images", "draft2_image_review", "Slide 2", { images: "1" }], ["images", "draft2_image_review", "Slide 3", { images: "1" }],
  ]));
  const file = await h.file({ runId: images.runId, slide: "cover", version: 1 });
  assert.equal(Buffer.from(await file.arrayBuffer()).toString(), `raw:${request(0)}|1/3|logo`);
  await assert.rejects(h.file({ runId: images.runId, slide: "cover", version: 2 }), /not one of this session's finished images/);
});

test("a first image the review flags is corrected once, from its image before the overlays; the correction is not reviewed again", async () => {
  const h = harness({ reviewOf: (slide) => slide === "s1" ? { transcription: "Toads, spiders and bat\nNaturalists explain them." } : {} });
  const session = await h.run();
  const s1 = session.images!.slides[1];
  assert.equal(json(s1.attempts.map((attempt) => [attempt.version, attempt.kind, attempt.status, attempt.baseVersion ?? null, attempt.review?.status ?? null])), json([[1, "generate", "generated", null, "issues"], [2, "correct", "generated", 1, null]]));
  const correction = h.calls.submits.find((submit) => submit.prompt.includes("IMAGE EDIT v1"))!;
  assert.equal(json([correction.endpoint, correction.files]), json(["openai/gpt-image-2.5/sunburst/edit", ["jo.png", "s1-v1-base.png"]]), "the base, before the logo and page number, is the last input image");
  assert.match(correction.prompt, /IMAGE EDIT v1\nThe LAST input image is the base image to edit[^]*missing «bats»; not in the slide «bat»/);
  assert.equal(stored(h, "s1-v2.png"), `raw:${s1.attempts[1].requestId}|2/3`);
  assert.equal(h.calls.reviews.length, 3, "three reviews: the correction is final as it comes");
  assert.equal(json([session.status, session.images!.status, session.error]), json(["needs-review", "needs-review", "1 image needs your review."]));
});

test("a request whose time is spent pauses; the next one polls the same requests and never sends an image twice", async () => {
  const clock = { now: Date.parse("2026-10-10T18:00:00.000Z") };
  // Three slides polled 30 s apart: a sweep moves the clock 90 s, so the third sweep ends past the 230 s budget.
  const h = harness({ polls: 3, clock });
  const paused = await h.run();
  assert.equal(json([paused.images!.status, paused.status, h.calls.submits.length]), json(["paused", "needs-review", 3]));
  assert.match(String(paused.error), /continue in a new request/);
  const done = await h.run({ resume: true });
  assert.equal(json([done.images!.status, h.calls.submits.length]), json(["ready", 3]), "the same three requests");
  await assert.rejects(h.run({ resume: true }), /There are no images waiting to be made/);
});

test("a submission lost while it was being sent fails after the grace period and is never sent again on its own", async () => {
  const h = harness();
  const first = await h.run();
  const lost = JSON.parse(JSON.stringify(first.images)) as Draft2Images;
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  lost.slides[2].attempts.push({ version: 2, kind: "regenerate", status: "submitting", queuedAt: tenMinutesAgo, submittedAt: tenMinutesAgo });
  lost.status = "running";
  h.setRow({ images: lost, status: "needs-review" });
  const resumed = await h.run({ resume: true });
  const attempt = resumed.images!.slides[2].attempts[1];
  assert.equal(json([attempt.status, h.calls.submits.length]), json(["failed", 3]));
  assert.match(String(attempt.error), /request was lost while it was being sent/);
  assert.equal(resumed.images!.slides[2].chosenVersion ?? imagesTypes.shownAttempt(resumed.images!.slides[2])?.version, 1, "the slide still shows its first image");
});

test("the editor asks for an edit of the image shown, which is made and reviewed (never corrected on its own), and picks the version a slide shows", async () => {
  const h = harness({ reviewOf: (slide, version) => slide === "cover" && version === 2 ? { textCovered: true } : {} });
  await h.run();
  const queued = await h.decide({ action: "regenerate", slide: "cover", instruction: "Show the boots closer", edit: true });
  assert.equal(json([queued.images!.status, queued.images!.slides[0].attempts[1]]), json(["paused", { version: 2, kind: "regenerate", status: "queued", instruction: "Show the boots closer", baseVersion: 1, queuedAt: queued.images!.slides[0].attempts[1].queuedAt }]));
  const done = await h.run({ resume: true });
  const cover = done.images!.slides[0];
  assert.equal(json(cover.attempts.map((attempt) => [attempt.version, attempt.kind, attempt.review?.status])), json([[1, "generate", "passed"], [2, "regenerate", "issues"]]), "reviewed, not corrected");
  const edit = h.calls.submits.find((submit) => submit.prompt.includes("IMAGE EDIT v1"))!;
  assert.match(edit.prompt, /^PROMPT 1:[^]*IMAGE EDIT v1[^]*"Show the boots closer"/);
  assert.equal(json(edit.files), json(["cover-v1-base.png"]));
  assert.equal(done.images!.status, "needs-review");
  const chosen = await h.decide({ action: "choose", slide: "cover", version: 1 });
  assert.equal(json([chosen.images!.slides[0].chosenVersion, chosen.images!.status, chosen.status]), json([1, "ready", "ready"]));
  await assert.rejects(h.decide({ action: "choose", slide: "cover", version: 9 }), /has no finished version 9/);
  await assert.rejects(h.decide({ action: "regenerate", slide: "s9" }), /s9 is not one of this carousel's slides/);
});

test("a real person's portrait and a verified map are pasted after generation, under the page number and the logo, and Sol is told where", async () => {
  const inventory: Draft2Inventory = {
    ...INVENTORY,
    entities: [
      { id: "e1", name: "Catherine Fournier", kind: "person", role: "subject", description: "", factIds: ["f1"], person: { status: "confirmed", candidates: [], confirmed: { entityId: "Q1", name: "Catherine Fournier", thumbnailUrl: "u", author: "A", license: "CC BY 4.0", commonsUrl: "c", storyPhotoId: "55555555-5555-4555-8555-555555555555" } } },
      { id: "e2", name: "Parc des Parulines", kind: "place", role: "subject", description: "", factIds: ["f1"], place: { status: "verified", map: true, google: { placeId: "g1", name: "Parc des Parulines", address: "166 chemin du Clocher, Saint-Jean", latitude: 45.3, longitude: -73.2, sourceUrl: "s", exactName: true } } },
    ],
  };
  const script = { ...SCRIPT, slides: [scriptSlide("cover", { need: "real-photo", references: ["e1"] }), scriptSlide("s1", { need: "verified-map", references: ["e2"] }), scriptSlide("last")] };
  const visual = { ...VISUAL, candidates: [script], rounds: [{ ...VISUAL.rounds[0], candidates: [script] }] };
  const h = harness({ session: { visual, inventory } });
  const session = await h.run();
  const [cover, s1] = session.images!.slides;
  assert.equal(json([stored(h, "cover-v1.png"), stored(h, "s1-v1.png")]), json([`raw:${cover.attempts[0].requestId}|portrait|1/3|logo`, `raw:${s1.attempts[0].requestId}|map|2/3`]));
  assert.equal(stored(h, "s1-map.png"), "map-png", "the map is fetched once and stored beside the slide's images");
  const prompt = (order: number) => h.calls.submits.find((submit) => submit.prompt.startsWith(`PROMPT ${order}:`))!.prompt;
  assert.match(prompt(1), /<DOCUMENTARY_PHOTO_ZONE>/);
  assert.match(prompt(2), /MAP INSET[^]*<VERIFIED_MAP_ZONE>/);
  assert.equal(json(h.calls.prompts.filter((entry) => entry.order !== 3).sort((a, b) => Number(a.order) - Number(b.order)).map((entry) => [entry.characters, entry.verifiedImagery])), json([[[], true], [[], true]]));
  assert.equal(json([cover.material[0], s1.material[0]]), json([
    { kind: "pasted-photo", storyPhotoId: "55555555-5555-4555-8555-555555555555", name: "Catherine Fournier", person: true, entityId: "e1", sha256: "c".repeat(64) },
    { kind: "map", entityId: "e2", name: "Parc des Parulines", source: "google", panel: { provider: "Google", layout: "inset-labelled", label: { name: "Parc des Parulines", address: "166 chemin du Clocher" }, sha256: s1.material[0].kind === "map" ? s1.material[0].panel!.sha256 : "" } },
  ]));
  const reviewed = (slide: string) => h.calls.reviews.find((entry) => entry.slide === slide)!.contents;
  assert.equal(json([(reviewed("cover").verifiedPhoto as { person: string }).person, (reviewed("s1").verifiedMap as { provider: string }).provider]), json(["Catherine Fournier", "Google"]));
});

test("images wait for a finished visual script, and for fal and Sol to be configured", async () => {
  await assert.rejects(harness({ session: { visual: null } }).run(), (error: Error) => error instanceof types.Draft2InputError && /Finish the visual script first/.test(error.message));
  await assert.rejects(harness({ session: { facts: [] } }).run(), /Images build only on verified facts/);
  await assert.rejects(harness().decide({ action: "choose", slide: "cover", version: 1 }), /Generate the images first/);
  await assert.rejects(harness().run({ resume: true }), /There are no images waiting to be made/);
});
