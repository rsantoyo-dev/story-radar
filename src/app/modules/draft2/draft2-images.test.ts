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
import { fitPortrait } from "../stories/creative-portrait-composite";
import { loadInSandbox } from "./draft2-test-sandbox";
import { createHash } from "node:crypto";

const hashOf = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
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
    submits: [] as { endpoint: string; prompt: string; files: string[]; width?: number; height?: number }[],
    reviews: [] as { slide: string; contents: Record<string, unknown> }[],
    charges: [] as Record<string, unknown>[],
    prompts: [] as Record<string, unknown>[],
    sections: [] as Record<string, unknown>[],
    /** Luna's looks at real photos (the person named), the zones the prompts reserve and the windows the composite shows. */
    located: [] as string[],
    zones: [] as string[],
    portraits: [] as Record<string, unknown>[],
  };
  const r2 = new Map<string, Buffer>();
  const pollsLeft = new Map<string, number>();
  let requestCount = 0;
  let row: Row = { id: sessionId, topicId, storyId, step: "visual", status: "needs-review", facts, visual: VISUAL, deck: { editorChoiceId: "c3" }, inventory: INVENTORY, images: null, error: null, trace: [], updatedAt: new Date(), ...session } as Row;
  /** Each compositor appends its name, so the stored image shows the order they ran in. */
  const step = (name: string) => async ({ image }: { image: Uint8Array }) => Buffer.from(`${Buffer.from(image).toString()}|${name}`);
  const expected = (unit: { headline: string; subheadline?: string; body?: string; ctaQuestion?: string }) => [unit.headline, unit.subheadline, unit.body, unit.ctaQuestion].filter(Boolean).join("\n");
  const fakeSharp = () => ({
    png: () => ({ toBuffer: async () => Buffer.from("map-png") }), resize: () => ({ jpeg: () => ({ toBuffer: async () => Buffer.from("jpeg") }) }),
    // A real photo before its slide: its size, and the preview Luna looks at.
    metadata: async () => ({ width: 800, height: 1000 }),
    rotate: () => ({ resize: () => ({ jpeg: () => ({ toBuffer: async () => Buffer.from("preview") }) }) }),
    // A slide's section of a master scene: the rectangle cut and the size it is drawn at.
    extract: (rect: { left: number; top: number; width: number; height: number }) => ({ resize: (width: number, height: number) => ({ png: () => ({ toBuffer: async () => {
      calls.sections.push({ ...rect, to: `${width}x${height}` });
      return Buffer.from(`section ${rect.left}`);
    } }) }) }),
  });
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
      compositeDocumentaryPortrait: async (input: { image: Uint8Array; layout?: string; crop?: unknown }) => { calls.portraits.push({ layout: input.layout, crop: input.crop }); return step("portrait")(input); },
      portraitAccent: () => "#E3A62F", portraitLayoutForSlide: () => "rounded-left", fitPortrait,
      portraitPhotoRegion: () => ({ left: 10, top: 40, right: 50, bottom: 90 }), portraitZonePrompt: (layout: string) => { calls.zones.push(layout); return "\n<DOCUMENTARY_PHOTO_ZONE>"; },
    },
    "../stories/creative-map-panel": {
      compositeMapPanel: async (input: { image: Uint8Array; position?: string }) => Buffer.from(`${Buffer.from(input.image).toString()}|map${input.position ? `@${input.position}` : ""}`),
      // A direction that asks for geography gives way to the scene alone.
      mapInsetVisualDirection: (direction: string, asksForGeography: boolean) => asksForGeography ? "SCENE ONLY MAP INSET" : `${direction} MAP INSET`, mapPaletteFromBrand: () => ({ surface: "#F6F0E4", primary: "#173F52", accent: "#E3A62F" }),
      mapPanelRegion: () => ({ left: 54, top: 63, right: 95, bottom: 90 }), mapPanelZonePrompt: (_layout: string, position?: string) => `\n<VERIFIED_MAP_ZONE${position ? ` ${position}` : ""}>`, streetAddress: (address: string) => address.split(",")[0],
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
      submitFalImage: async (input: { endpoint: string; prompt: string; referenceImages: File[]; width: number; height: number }) => {
        calls.submits.push({ endpoint: input.endpoint, prompt: input.prompt, files: input.referenceImages.map((file) => file.name), width: input.width, height: input.height });
        const id = `req-${++requestCount}`;
        pollsLeft.set(id, polls);
        return id;
      },
      pollFalImage: async (input: { requestId: string; targetWidth: number; targetHeight: number; postProcess: (value: { normalizedPng: Uint8Array; requestId: string; width: number; height: number }) => Promise<Uint8Array> }) => {
        const left = pollsLeft.get(input.requestId) ?? 0;
        if (clock) clock.now += pollMs;
        if (left > 0) { pollsLeft.set(input.requestId, left - 1); return { status: "generating" }; }
        await input.postProcess({ normalizedPng: Buffer.from(`raw:${input.requestId}`), requestId: input.requestId, width: input.targetWidth, height: input.targetHeight });
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
    "../stories/openai-structured-response": { generateOpenAiStructuredResponse: async (input: { contents: { slide: { label: string }; visibleText: string; person?: string }; schemaName: string; images: string[] }) => {
      if (input.schemaName === "draft2_portrait_subject") {
        calls.located.push(input.contents.person ?? "");
        // A medium shot: the face high in the middle, the person to the bottom.
        const text = JSON.stringify({ faceVisible: true, people: 1, face: { left: 0.4, top: 0.12, right: 0.6, bottom: 0.32 }, person: { left: 0.15, top: 0.06, right: 0.85, bottom: 1 } });
        return { text, provider: "openai", model: "gpt-6-luna", usage: { promptTokens: 700, outputTokens: 60, thoughtsTokens: 20, totalTokens: 760 }, cachedInputTokens: 0 };
      }
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
    archive: () => exports.draft2ImagesArchive({ topicId, sessionId }) as unknown as Promise<{ fileName: string; archive: Buffer; count: number; reviewCopies: number }>,
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
    ["images", "draft2_image_review", "Cover", { images: "3" }], ["images", "draft2_image_review", "Slide 2", { images: "3" }], ["images", "draft2_image_review", "Slide 3", { images: "3" }],
  ]));
  const file = await h.file({ runId: images.runId, slide: "cover", version: 1 });
  assert.equal(Buffer.from(await file.arrayBuffer()).toString(), `raw:${request(0)}|1/3|logo`);
  await assert.rejects(h.file({ runId: images.runId, slide: "cover", version: 2 }), /not one of this session's finished images/);
});

test("a first image the review flags is corrected once, from its image before the overlays; the correction is reviewed and never corrected again", async () => {
  const h = harness({ reviewOf: (slide) => slide === "s1" ? { transcription: "Toads, spiders and bat\nNaturalists explain them." } : {} });
  const session = await h.run();
  const s1 = session.images!.slides[1];
  assert.equal(json(s1.attempts.map((attempt) => [attempt.version, attempt.kind, attempt.status, attempt.baseVersion ?? null, attempt.review?.status ?? null])), json([[1, "generate", "generated", null, "issues"], [2, "correct", "generated", 1, "issues"]]), "the correction is reviewed (the fake reviewer flags s1 every time) and stays as it is");
  const correction = h.calls.submits.find((submit) => submit.prompt.includes("IMAGE EDIT v1"))!;
  assert.equal(json([correction.endpoint, correction.files]), json(["openai/gpt-image-2.5/sunburst/edit", ["jo.png", "s1-v1-base.png"]]), "the base, before the logo and page number, is the last input image");
  assert.match(correction.prompt, /IMAGE EDIT v1\nThe LAST input image is the base image to edit[^]*missing «bats»; not in the slide «bat»/);
  assert.equal(stored(h, "s1-v2.png"), `raw:${s1.attempts[1].requestId}|2/3`);
  assert.equal(h.calls.reviews.length, 4, "four reviews: the three first images and the correction, which is never corrected again");
  const cover = h.calls.submits.find((submit) => submit.prompt.startsWith("PROMPT 1:"))!;
  assert.match(cover.prompt, /COVER: the headline is the dominant element/, "the cover's lettering: the hook dominates");
  assert.doesNotMatch(h.calls.submits.find((submit) => submit.prompt.startsWith("PROMPT 2:"))!.prompt, /COVER:/);
  assert.equal(json([session.status, session.images!.status, session.error]), json(["needs-review", "needs-review", "1 image needs your review."]));
});

test("an image that shows what it must not is made again from the slide's prompt, with no base, the refused problems as requirements; the new image is reviewed", async () => {
  const h = harness({ reviewOf: (slide, version) => slide === "s1" && version === 1 ? { inventedDetails: ["a vegetable stall"] } : {} });
  const session = await h.run();
  const s1 = session.images!.slides[1];
  assert.equal(json(s1.attempts.map((attempt) => [attempt.version, attempt.kind, attempt.baseVersion ?? null, attempt.correctsVersion ?? null, attempt.review?.status ?? null])), json([[1, "generate", null, null, "issues"], [2, "correct", null, 1, "passed"]]));
  const remade = h.calls.submits.filter((submit) => submit.prompt.startsWith("PROMPT 2:"))[1];
  assert.doesNotMatch(remade.prompt, /IMAGE EDIT v1/, "not an edit of the refused image");
  assert.match(remade.prompt, /Requested change: "A first image of this slide was refused for these problems: \(1\) The image shows what the slide's facts and words do not give: a vegetable stall\./);
  assert.equal(json(remade.files), json(["jo.png"]), "no base image: only the slide's own references");
  assert.equal(json([session.images!.status, session.status]), json(["ready", "ready"]), "every shown image passed");
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
  // Luna looked at the photo once, before the slide went out; its layout is the one the prompt reserved and the composite filled, with the window on her face.
  const portrait = cover.material[0].kind === "pasted-photo" ? cover.material[0].portrait! : undefined;
  assert.equal(json([h.calls.located, portrait?.source, portrait?.face, h.calls.zones, h.calls.portraits]), json([
    ["Catherine Fournier"], "ai", { left: 0.4, top: 0.12, right: 0.6, bottom: 0.32 }, [portrait?.layout], [{ layout: portrait?.layout, crop: portrait?.crop }],
  ]));
  assert.ok(portrait?.crop && portrait.crop.top <= 0.12 * 1000, "the window keeps her whole face");
  assert.ok(session.trace.some((entry) => entry.operation === "draft2_portrait_subject" && entry.model === "gpt-6-luna" && entry.outcome === "ok"));
  assert.equal(json([{ ...cover.material[0], portrait: undefined }, s1.material[0]]), json([
    { kind: "pasted-photo", storyPhotoId: "55555555-5555-4555-8555-555555555555", name: "Catherine Fournier", person: true, entityId: "e1", sha256: "c".repeat(64) },
    { kind: "map", entityId: "e2", name: "Parc des Parulines", source: "google", panel: { provider: "Google", layout: "inset-labelled", label: { name: "Parc des Parulines", address: "166 chemin du Clocher" }, sha256: s1.material[0].kind === "map" ? s1.material[0].panel!.sha256 : "" } },
  ]));
  const reviewed = (slide: string) => h.calls.reviews.find((entry) => entry.slide === slide)!.contents;
  assert.equal(json([(reviewed("cover").verifiedPhoto as { person: string }).person, (reviewed("s1").verifiedMap as { provider: string }).provider]), json(["Catherine Fournier", "Google"]));
});

test("an image made before its photo was fitted keeps the slide's layout when edited; made again from its prompt, it is fitted", async () => {
  const inventory: Draft2Inventory = {
    ...INVENTORY,
    entities: [{ id: "e1", name: "Catherine Fournier", kind: "person", role: "subject", description: "", factIds: ["f1"], person: { status: "confirmed", candidates: [], confirmed: { entityId: "Q1", name: "Catherine Fournier", thumbnailUrl: "u", author: "A", license: "CC BY 4.0", commonsUrl: "c", storyPhotoId: "55555555-5555-4555-8555-555555555555" } } }],
  };
  const script = { ...SCRIPT, slides: [scriptSlide("cover", { need: "real-photo", references: ["e1"] }), scriptSlide("s1"), scriptSlide("last")] };
  const visual = { ...VISUAL, candidates: [script], rounds: [{ ...VISUAL.rounds[0], candidates: [script] }] };
  const h = harness({ session: { visual, inventory } });
  const first = await h.run();
  // The run as it was before photos were fitted: no fit on the photo, none on its image.
  const before = JSON.parse(JSON.stringify(first.images)) as Draft2Images;
  const cover = before.slides[0];
  if (cover.material[0].kind === "pasted-photo") delete cover.material[0].portrait;
  delete cover.attempts[0].portrait;
  h.setRow({ images: before });
  await h.decide({ action: "regenerate", slide: "cover", instruction: "Warmer light", edit: true });
  const edited = await h.run({ resume: true });
  assert.equal(json([edited.images!.slides[0].attempts[1].portrait, h.calls.located.length, h.calls.zones.at(-1)]), json([{ layout: "rounded-left" }, 1, "rounded-left"]), "the edit keeps the layout its base image was made with; nobody looks at the photo again");
  await h.decide({ action: "regenerate", slide: "cover" });
  const fresh = await h.run({ resume: true });
  const slide = fresh.images!.slides[0];
  const fit = slide.material[0].kind === "pasted-photo" ? slide.material[0].portrait : undefined;
  assert.equal(json([h.calls.located.length, fit?.source, slide.attempts[2].portrait]), json([2, "ai", { layout: fit?.layout, crop: fit?.crop }]), "a fresh image of a photo not fitted yet is fitted first");
});

test("the editor moves a map card to another corner: a new image is made around it, with its zone and its paste there; asking the model about the map never makes it draw one, and a direction about a plan gives way to the scene", async () => {
  const inventory: Draft2Inventory = {
    ...INVENTORY,
    entities: [{ id: "e2", name: "Vieux-Saint-Jean", kind: "place", role: "subject", description: "", factIds: ["f1"], place: { status: "verified", map: true, google: { placeId: "g1", name: "Vieux-Saint-Jean", address: "Vieux-Saint-Jean, Saint-Jean", latitude: 45.3, longitude: -73.2, sourceUrl: "s", exactName: true } } }],
  };
  const script = { ...SCRIPT, slides: [scriptSlide("cover"), scriptSlide("s1", { need: "verified-map", references: ["e2"], direction: "Le plan vérifié du Vieux-Saint-Jean porte le tournant gratuit/payant, entre platines et lampions." }), scriptSlide("last")] };
  const visual = { ...VISUAL, candidates: [script], rounds: [{ ...VISUAL.rounds[0], candidates: [script] }] };
  const h = harness({ session: { visual, inventory } });
  await h.run();
  const first = h.calls.prompts.find((entry) => entry.order === 2)!;
  assert.equal(first.direction, "SCENE ONLY MAP INSET", "the plan the direction mentions is the card's job: the model gets the scene");
  const moved = await h.decide({ action: "map", slide: "s1", position: "top-right" });
  const s1 = moved.images!.slides[1];
  assert.equal(json([s1.material[0].kind === "map" ? s1.material[0].panel?.position : null, s1.attempts.at(-1)?.kind, s1.attempts.at(-1)?.baseVersion ?? null, moved.images!.status]), json(["top-right", "regenerate", null, "paused"]), "a new image from the prompt, never an edit of the old layout");
  await assert.rejects(h.decide({ action: "map", slide: "s1", position: "top-right" }), /already there/);
  const done = await h.run({ resume: true });
  const remade = h.calls.submits.filter((submit) => submit.prompt.startsWith("PROMPT 2:")).at(-1)!;
  assert.match(remade.prompt, /<VERIFIED_MAP_ZONE top-right>/);
  assert.match(stored(h, `s1-v${done.images!.slides[1].attempts.at(-1)!.version}.png`) ?? "", /\|map@top-right/);
  await h.decide({ action: "regenerate", slide: "s1", instruction: "Mets la carte en haut à droite", edit: false });
  await h.run({ resume: true });
  assert.match(h.calls.submits.filter((submit) => submit.prompt.startsWith("PROMPT 2:")).at(-1)!.prompt, /never draw a map, a plan, streets or a route yourself/);
  await assert.rejects(h.decide({ action: "map", slide: "cover", position: "top-right" }), /has no verified map card to move/);
});

test("the editor casts the brand's characters on a slide's next image: their references go with the request, and taking them off leaves none; an unknown character is refused", async () => {
  const h = harness();
  await h.run();
  const cast = await h.decide({ action: "regenerate", slide: "last", instruction: "Jo dances the line dance", edit: false, characterIds: ["char-jo"] });
  assert.equal(json(cast.images!.slides[2].characterIds), json(["char-jo"]));
  await h.run({ resume: true });
  const last = h.calls.submits.filter((submit) => submit.prompt.startsWith("PROMPT 3:")).at(-1)!;
  assert.ok(last.files.includes("jo.png"), "Jo's reference image goes with the request");
  assert.equal(json(h.calls.prompts.filter((entry) => entry.order === 3).at(-1)!.characters), json(["Jo"]));
  assert.match(last.prompt, /Requested change: "Jo dances the line dance"/);
  const uncast = await h.decide({ action: "regenerate", slide: "s1", edit: false, characterIds: [] });
  assert.equal(json(uncast.images!.slides[1].characterIds), json([]));
  await h.run({ resume: true });
  assert.ok(!h.calls.submits.filter((submit) => submit.prompt.startsWith("PROMPT 2:")).at(-1)!.files.includes("jo.png"), "taken off: no reference");
  await assert.rejects(h.decide({ action: "regenerate", slide: "s1", edit: false, characterIds: ["char-zed"] }), /char-zed is not one of the brand's characters/);
});

test("images wait for a finished visual script, and for fal and Sol to be configured", async () => {
  await assert.rejects(harness({ session: { visual: null } }).run(), (error: Error) => error instanceof types.Draft2InputError && /Finish the visual script first/.test(error.message));
  await assert.rejects(harness({ session: { facts: [] } }).run(), /Images build only on verified facts/);
  await assert.rejects(harness().decide({ action: "choose", slide: "cover", version: 1 }), /Generate the images first/);
  await assert.rejects(harness().run({ resume: true }), /There are no images waiting to be made/);
});

/** The entries of a stored (uncompressed) ZIP, read from its central directory. */
function unzipStored(archive: Buffer): { name: string; data: string }[] {
  const end = archive.length - 22;
  assert.equal(archive.readUInt32LE(end), 0x06054b50);
  let at = archive.readUInt32LE(end + 16);
  return Array.from({ length: archive.readUInt16LE(end + 10) }, () => {
    const size = archive.readUInt32LE(at + 20);
    const nameLength = archive.readUInt16LE(at + 28);
    const local = archive.readUInt32LE(at + 42);
    const name = archive.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    at += 46 + nameLength + archive.readUInt16LE(at + 30) + archive.readUInt16LE(at + 32);
    const start = local + 30 + archive.readUInt16LE(local + 26);
    return { name, data: archive.subarray(start, start + size).toString() };
  });
}

test("download all: one ZIP of each slide's shown image in slide order, checked against its record; review copies until the editor approves them as they stand", async () => {
  const h = harness();
  await assert.rejects(h.archive(), /no finished images to download yet/, "nothing made yet");
  const session = await h.run();
  const images = session.images!;
  const first = await h.archive();
  assert.match(first.fileName, new RegExp(`^carousel-draft2-${images.runId.slice(0, 8)}-review-\\d{4}-\\d{2}-\\d{2}\\.zip$`));
  assert.equal(json([first.count, first.reviewCopies]), json([3, 3]));
  assert.equal(json(unzipStored(first.archive)), json([
    { name: "slide-01-review.png", data: stored(h, "cover-v1.png") }, { name: "slide-02-review.png", data: stored(h, "s1-v1.png") }, { name: "slide-03-review.png", data: stored(h, "last-v1.png") },
  ]), "the finished images exactly as stored");
  h.setRow({ publication: { imagesRunId: images.runId, slides: images.slides.map((slide) => ({ slide: slide.slide, label: slide.label, order: slide.order, version: 1, sha256: slide.attempts[0].sha256 })) } });
  const approved = await h.archive();
  assert.equal(json([approved.reviewCopies, unzipStored(approved.archive).map((entry) => entry.name)]), json([0, ["slide-01.png", "slide-02.png", "slide-03.png"]]));
  assert.doesNotMatch(approved.fileName, /-review-/);
  h.r2.set(`draft2/${images.runId}/s1-v1.png`, Buffer.from("tampered"));
  await assert.rejects(h.archive(), /does not match its record/, "an image that is not the one recorded never reaches the archive");
});

test("a narrative form's anchor is drawn once, without words, before the slides; every slide that carries it receives it after the characters; Sol checks it, and a slide without it is corrected", async () => {
  const toad = { form: "character-guide", anchorKind: "figure", characterId: null, anchor: "A curious toad", anchorFactIds: ["f1"], progression: "From the kiosk to each animal", ending: "resolves" };
  const visual = { ...VISUAL, focus: { version: 1, values: { ...VISUAL.focus!.values, narrative: toad } } };
  const h = harness({ session: { visual }, reviewOf: (slide, version) => slide === "s1" && version === 1 ? { anchorShown: false } : {} });
  const session = await h.run();
  const images = session.images!;
  assert.equal(json([images.anchorPlate?.anchor, images.anchorPlate?.status, images.anchorPlate?.sha256 === hashOf(h.r2.get(`draft2/${images.runId}/anchor-plate.png`)!)]), json(["A curious toad", "generated", true]));
  const [plate, ...slides] = h.calls.submits;
  assert.match(plate.prompt, /^ANCHOR PLATE\n\nOne reference image of A curious toad, the guide that is on every slide of this carousel/);
  assert.match(plate.prompt, /No words, letters, numbers, logos, signs, frames or interface of any kind\./);
  assert.equal(json(plate.files), json([]), "drawn from the script's words alone, first");
  const byOrder = (order: number) => slides.filter((submit) => submit.prompt.startsWith(`PROMPT ${order}:`));
  assert.equal(json(byOrder(1)[0].files), json(["anchor-plate.png"]));
  assert.equal(json(byOrder(2)[0].files), json(["jo.png", "anchor-plate.png"]), "after the brand character's references");
  assert.match(byOrder(2)[0].prompt, /ANCHOR REFERENCE\nInput image 2 is A curious toad, the guide that is on every slide of this carousel/);
  assert.match(byOrder(1)[0].prompt, /Input image 1 is A curious toad/);
  assert.equal(json(h.calls.reviews.map((review) => (review.contents.anchor as { what: string } | undefined)?.what)), json(["A curious toad", "A curious toad", "A curious toad", "A curious toad"]), "the three first images and the correction");
  const s1 = images.slides.find((slide) => slide.slide === "s1")!;
  assert.match(s1.attempts[0].review!.issues.join(" "), /A curious toad, which is on every slide of this carousel, is missing or does not look as it does on the others\./);
  assert.equal(json(s1.attempts.map((attempt) => [attempt.version, attempt.kind, attempt.status])), json([[1, "generate", "generated"], [2, "correct", "generated"]]));
  assert.equal(json(byOrder(2)[1].files), json(["jo.png", "anchor-plate.png", "s1-v1-base.png"]), "the correction keeps the plate, with its base last");
  assert.equal(json(h.calls.charges.filter((charge) => charge.operation === "draft2_anchor_plate").map((charge) => charge.idempotencyKey)), json([`draft2-anchor-plate:${images.runId}`]), "charged once");
});

test("a brand character anchor needs no plate, and a classic story none either", async () => {
  const jo = { form: "character-guide", anchorKind: "character", characterId: "char-jo", anchor: "Jo", anchorFactIds: [], progression: "p", ending: "resolves" };
  const visual = { ...VISUAL, focus: { version: 1, values: { ...VISUAL.focus!.values, narrative: jo } } };
  const guided = await harness({ session: { visual } }).run();
  assert.equal(guided.images?.anchorPlate, undefined);
  const classic = await harness().run();
  assert.equal(classic.images?.anchorPlate, undefined);
});

test("a panorama or a line is drawn once as one wide master scene; each slide is redrawn from its section, given last, and Sol checks the line", async () => {
  const line = { form: "follow-the-line", anchorKind: "line", characterId: null, anchor: "The boardwalk trail", anchorFactIds: ["f1"], progression: "What the trail reaches", ending: "resolves" };
  const visual = { ...VISUAL, focus: { version: 1, values: { ...VISUAL.focus!.values, narrative: line } } };
  const h = harness({ session: { visual } });
  const session = await h.run();
  const images = session.images!;
  const master = images.masterPlate!;
  assert.equal(json([master.anchor, master.status, master.width, master.height, master.sections.map((section) => [section.slide, section.left, section.width, section.height])]),
    json(["The boardwalk trail", "generated", 3232, 1344, [["cover", 3, 1075, 1344], ["s1", 1078, 1075, 1344], ["last", 2153, 1075, 1344]]]));
  assert.equal(images.anchorPlate, undefined, "a line needs no anchor plate");
  const [first, ...slides] = h.calls.submits;
  assert.equal(json([first.width, first.height, first.files]), json([3232, 1344, []]), "the master first, wide, from words alone");
  assert.match(first.prompt, /^MASTER SCENE\n\nOne wide image: the whole world of a 3-slide carousel, read from left to right\./);
  assert.match(first.prompt, /One continuous line runs through the whole image from the left edge to the right edge: The boardwalk trail\./);
  assert.match(first.prompt, /From left to right, one section per slide:\n1\. Cover: the cover trail/);
  const byOrder = (order: number) => slides.filter((submit) => submit.prompt.startsWith(`PROMPT ${order}:`))[0];
  assert.equal(json(h.calls.sections), json([
    { left: 3, top: 0, width: 1075, height: 1344, to: "1088x1360" }, { left: 1078, top: 0, width: 1075, height: 1344, to: "1088x1360" }, { left: 2153, top: 0, width: 1075, height: 1344, to: "1088x1360" },
  ]), "each section cut from the master once and drawn at the slide's size");
  assert.equal(json([byOrder(1).files, byOrder(2).files, byOrder(3).files]), json([["master-section-cover.png"], ["jo.png", "master-section-s1.png"], ["master-section-last.png"]]), "each slide's section, last");
  assert.match(byOrder(2).prompt, /MASTER SECTION\nThe LAST input image is this slide's section of the carousel's one wide scene, with the line \(The boardwalk trail\) entering at its left edge and leaving at its right edge\./);
  assert.equal(json(h.calls.reviews.map((review) => (review.contents.anchor as { what: string; role: string } | undefined)?.role)), json(["line", "line", "line"]));
  assert.equal(json(h.calls.charges.filter((charge) => charge.operation === "draft2_master_scene").map((charge) => charge.idempotencyKey)), json([`draft2-master-scene:${images.runId}`]));
  const panorama = { ...line, form: "panorama", anchorKind: "scene", anchor: "An autumn trail", anchorFactIds: [] };
  const scene = harness({ session: { visual: { ...VISUAL, focus: { version: 1, values: { ...VISUAL.focus!.values, narrative: panorama } } } } });
  await scene.run();
  assert.match(scene.calls.submits[0].prompt, /The scene: An autumn trail\./);
  assert.equal(scene.calls.reviews.some((review) => "anchor" in review.contents), false, "a panorama's scene is every slide by construction");
});
