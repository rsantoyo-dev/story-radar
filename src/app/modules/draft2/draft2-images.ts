import "server-only";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { withCreativeTextBudget } from "../stories/creative-text-meter";
import { generateOpenAiStructuredResponse } from "../stories/openai-structured-response";
import { getCreativeProfile } from "../stories/creative-profile.repository";
import { buildCreativeImagePrompt } from "../stories/build-creative-image-prompt";
import {
  MAX_CREATIVE_IMAGE_PROMPT_CHARACTERS,
  type BrandReferenceSelection, type CreativeBrandOverlay, type CreativeBrandOverlaySnapshot, type CreativeBrief, type CreativeCharacterSnapshot,
  type CreativeDraft, type CreativeProfile, type CreativeTone, type CreativeUnit,
} from "../stories/creative-content.types";
import { buildCreativeCarouselChrome, compositeCreativeCarouselChrome } from "../stories/creative-carousel-chrome";
import { computeCreativeBrandPromptExclusionRect, creativeCanvasDimensions, shouldApplyCreativeBrandOverlay } from "../stories/creative-brand-overlay";
import { creativeBrandOverlaySnapshot, findCreativeBrandAsset } from "../stories/creative-brand-assets.repository";
import { compositeStoredCreativeBrand, isTransientFalSubmitError } from "../stories/manage-creative-assets";
import { compositeDocumentaryPortrait, portraitAccent, portraitLayoutForSlide, portraitPhotoRegion, portraitZonePrompt } from "../stories/creative-portrait-composite";
import { compositeMapPanel, mapInsetVisualDirection, mapPaletteFromBrand, mapPanelRegion, mapPanelZonePrompt, streetAddress } from "../stories/creative-map-panel";
import { photoLedVisualDirection, storyReferencePrompt } from "../stories/story-reference-generation";
import { currentPortraitFocus, loadDocumentaryPortraitPhoto, loadStoryReferenceImages, resolveStoryReferences } from "../stories/manage-story-photos";
import { snapshotsForCreativeCharacterIds } from "../stories/creative-characters.repository";
import { charactersForImageGeneration } from "../stories/creative-character-generation";
import { listActivatedBrandReferences } from "../stories/creative-brand-references.repository";
import { getBrandReferenceSelectionBudget, selectBrandReferencesForDraft } from "../stories/select-brand-references";
import { loadBrandGenerationImages, resolveBrandGenerationReferences } from "../stories/resolve-brand-generation";
import { brandReferencePrompt } from "../stories/creative-brand-generation";
import { FalImageConfigurationError, getFalImageRuntimeConfig, resolveDefaultCreativeImageModel } from "../stories/fal-image-generation.config";
import { assertCreativeImageModelSupports, creativeImageEndpoint, creativeImageModel } from "../stories/creative-image-models";
import { pollFalImage, submitFalImage } from "../stories/fal-image-client";
import { estimateFalImageCost } from "../stories/fal-image-cost";
import { recordUsageCharge } from "../credits/usage-charges.repository";
import { buildDraft2ImageObjectKey, putPrivateR2Object, readPrivateR2ImageFile } from "../stories/r2-storage";
import { documentaryProviders } from "../stories/creative-documentary-providers";
import { eligiblePhoto, type PlaceEvidence } from "../stories/creative-documentary";
import { openversePlacePhoto } from "../stories/openverse-place-photo";
import { googleMapsConfig, googleMapsProvider, type GoogleMapsConfig, type GooglePlaceCandidate } from "../stories/google-maps-provider";
import { renderOpenMap } from "../stories/open-map-render";
import { OSM_ATTRIBUTION } from "../stories/open-map-geometry";
import { resolveGeoContact } from "../stories/creative-geo-contact";
import { verifiedPlacePhotoInstruction } from "../stories/creative-place-visual";
import { buildImageReviewInstructions, buildImageReviewText, type CreativeImageReviewInput } from "../stories/creative-image-review";
import { activeDraft2Session, claimDraft2Session, getDraft2Session, touchDraft2Session, updateDraft2Session, type Draft2SessionPatch } from "./draft2-session.repository";
import { draft2DevTrace } from "./draft2-dev-trace";
import { traceCost } from "./draft2-trace-cost";
import { Draft2BusyError, Draft2InputError, type Draft2Fact, type Draft2TraceEntry } from "./draft2-facts.types";
import { failedCall } from "./draft2-funnel";
import { draft2SolModel } from "./draft2-models";
import { placeMention } from "./draft2-inventory";
import {
  DRAFT2_IMAGE_REVIEW_SCHEMA, IMAGE_SUBMISSION_GRACE_MS, IMAGE_SUBMIT_CONCURRENCY, IMAGES_QUALITY,
  awaitsReview, chosenSlide, correctionFor, draft2ImageReview, imageBaseFile, imageFile, imagePromptFile, imagesNote, imagesTarget, latestAttempt, mapFile,
  newImagesRun, parseDraft2ImageReview, parseImagesAction, regeneratedSlide, settledStatus, slideFacts, slideSettled, slideUnit,
  type Draft2ImageAttempt, type Draft2Images, type Draft2ImagesRun, type Draft2MapPanel, type Draft2SlideImage, type Draft2SlideMaterial,
} from "./draft2-images.types";
import { OPENING_STALL_MS } from "./draft2-opening.types";
import type { Draft2FocusValues } from "./draft2-focus.types";
import type { Draft2Inventory, Draft2InventoryEntity } from "./draft2-inventory.types";
import type { Draft2CarouselSlide, Draft2VisualCandidate } from "./draft2-visual.types";
import { brandBrief, composeInstructions } from "./skills/draft2-skills";
import { IMAGES_SKILL } from "./skills/images";
import type { Draft2SessionRow } from "@/db/schema";

/** A request stops starting work past this point and pauses; the route allows 300 s. */
const TIME_BUDGET_MS = 230_000;
const REQUEST_DEADLINE_MS = 280_000;
const POLL_INTERVAL_MS = 4_000;
const HEARTBEAT_MS = 30_000;
const REVIEW_TIMEOUT_MS = 120_000;
const REVIEW_MAX_OUTPUT_TOKENS = 6_000;
const REVIEW_CONCURRENCY = 6;
/** A poll that fails this many times in one request (network, storage) fails its image. */
const POLL_ATTEMPTS = 3;
const MAX_REFERENCE_FILES = 16;
const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;
const OUTPUT = creativeCanvasDimensions("4:5");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const message = (error: unknown) => error instanceof Error ? error.message.slice(0, 300) : "unknown error";

async function inBatches<T>(items: readonly T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  for (let index = 0; index < items.length; index += size) await Promise.all(items.slice(index, index + size).map(work));
}

type Context = {
  topicId: string;
  storyId: string;
  sessionId: string;
  run: Draft2ImagesRun;
  script: Draft2VisualCandidate;
  carousel: readonly Draft2CarouselSlide[];
  inventory: Draft2Inventory;
  facts: readonly Draft2Fact[];
  profile: CreativeProfile;
  overlay?: CreativeBrandOverlay;
  brandSnapshot?: CreativeBrandOverlaySnapshot;
  characters: Map<string, CreativeCharacterSnapshot>;
  brandSelections: Map<number, BrandReferenceSelection>;
  units: CreativeUnit[];
  draft: CreativeDraft;
  brief: CreativeBrief;
  fal: ReturnType<typeof getFalImageRuntimeConfig>;
  descriptor: ReturnType<typeof creativeImageModel>;
  google?: GoogleMapsConfig;
  signal: AbortSignal;
  trace: Draft2TraceEntry[];
};

const objectKey = (ctx: Pick<Context, "topicId" | "sessionId" | "run">, file: string) =>
  buildDraft2ImageObjectKey({ topicId: ctx.topicId, sessionId: ctx.sessionId, runId: ctx.run.runId, file });

const note = (slide: Draft2SlideImage, text: string) => { if (!slide.notes.includes(text)) slide.notes.push(text); };

/** v1's tone line from the story's focus: its gravity sets the register; its dials, the energy and the humor. */
function toneFor(focus: Draft2FocusValues | undefined, profile: CreativeProfile): CreativeBrief["tone"] {
  const gravity = focus?.voice.gravity;
  const primary: CreativeTone = gravity === "grave" ? "somber" : gravity === "serious" ? "cautious" : gravity === "light" ? "playful" : "informative";
  const dial = (value: number | undefined, fallback: number) => Math.min(100, Math.max(0, Math.round(value ?? fallback)));
  return { primary, energy: dial(focus?.voice.energy, profile.energy), humor: dial(focus?.voice.humor, profile.humor), reason: "The story's focus." };
}

/**
 * The script's whole as v1's "Overall concept": every image is made on its
 * own, so each prompt carries the story it belongs to, and how the recurring
 * cast looks when a slide shows it. It never asks for the protagonist or the
 * motif on every slide: each slide's direction says what it shows.
 */
const storyConcept = (script: Draft2VisualCandidate) =>
  [script.concept, script.cast ? `When a slide shows them, the recurring cast looks the same on every slide: ${script.cast}` : ""]
    .map((part) => part.trim().replace(/[.\s]+$/u, "")).filter(Boolean).join(". ") + ".";

/** The Topic's logo as v1 composites it (resolveCreativeBrandGeneration): off, or its settings with the stored PNG they point to. */
async function brandOverlay(topicId: string, profile: CreativeProfile): Promise<{ overlay?: CreativeBrandOverlay; snapshot?: CreativeBrandOverlaySnapshot }> {
  const overlay = profile.brandOverlay;
  if (!overlay?.enabled) return {};
  if (!overlay.assetId || !overlay.asset) throw new Draft2InputError("The brand's logo is on but has no PNG. Upload and save the logo in the creative profile, or turn it off.");
  const stored = await findCreativeBrandAsset(topicId, overlay.assetId);
  if (!stored || stored.id !== overlay.asset.id) throw new Draft2InputError("The brand's logo is no longer available for this topic. Choose and save a current logo in the creative profile.");
  const settings = {
    enabled: overlay.enabled, scope: overlay.scope, placement: overlay.placement, sizePercent: overlay.sizePercent, insetPercent: overlay.insetPercent,
    backdropMode: overlay.backdropMode, backdropColor: overlay.backdropColor, backdropOpacity: overlay.backdropOpacity,
  };
  return { overlay: { ...settings, assetId: stored.id, asset: overlay.asset }, snapshot: creativeBrandOverlaySnapshot(settings, stored) };
}

function googleConfig(): GoogleMapsConfig | undefined {
  try {
    const config = googleMapsConfig();
    return config.enabled && config.apiKey ? config : undefined;
  } catch {
    return undefined;
  }
}

/** The page number as v1 paints it: the same geometry the prompt reserved, moved beside the logo where the logo is. */
function chromeFor(ctx: Context, order: number) {
  const asset = ctx.overlay?.asset;
  const logoZone = ctx.overlay && asset && shouldApplyCreativeBrandOverlay(ctx.overlay, order)
    ? computeCreativeBrandPromptExclusionRect({ settings: ctx.overlay, canvasWidth: OUTPUT.width, canvasHeight: OUTPUT.height, logoWidth: asset.width, logoHeight: asset.height })
    : undefined;
  return buildCreativeCarouselChrome({ aspectRatio: "4:5", unitOrder: order, totalSlides: ctx.carousel.length, settings: ctx.profile.carouselChrome, logoExclusionZone: logoZone });
}

const logoApplies = (ctx: Context, order: number) => Boolean(ctx.brandSnapshot && shouldApplyCreativeBrandOverlay(ctx.brandSnapshot, order));

const isPasted = (entry: Draft2SlideMaterial): entry is Extract<Draft2SlideMaterial, { kind: "pasted-photo" }> => entry.kind === "pasted-photo";
const isMap = (entry: Draft2SlideMaterial): entry is Extract<Draft2SlideMaterial, { kind: "map" }> => entry.kind === "map";
const isPlacePhoto = (entry: Draft2SlideMaterial): entry is Extract<Draft2SlideMaterial, { kind: "place-photo" }> => entry.kind === "place-photo";
const isStoryPhoto = (entry: Draft2SlideMaterial): entry is Extract<Draft2SlideMaterial, { kind: "story-photo" }> => entry.kind === "story-photo";

/** A Google Places candidate for a point, which is all a static map reads (staticGoogleMapUrl). */
const mapPoint = (point: { id: string; name: string; address: string; latitude: number; longitude: number; sourceUrl: string }): GooglePlaceCandidate => ({
  ...point, matchesScope: true, exactName: true, pointSuitable: true, namedPoint: true, photos: [], attributions: [], exclusions: [],
});

/** The place's Wikidata identity again, as the inventory found it (its coordinates and photo titles are not kept there). */
async function placeEvidence(ctx: Context, entity: Draft2InventoryEntity): Promise<{ evidence: PlaceEvidence; providers: ReturnType<typeof documentaryProviders> } | undefined> {
  if (!resolveGeoContact(ctx.profile.geoProviderContact, process.env.CREATIVE_GEO_CONTACT)) return undefined;
  const providers = documentaryProviders(ctx.signal, ctx.profile.language, ctx.profile.geoProviderContact, { places: 1 });
  const evidence = await providers.resolve(placeMention(entity, ctx.facts), ctx.profile.geoScope);
  return evidence ? { evidence, providers } : undefined;
}

/**
 * The map panel of a map slide, fetched once and stored beside the slide's
 * images so every version pastes the same map: Google's static map, in the
 * brand's colours, with the place's name and address when Google matched it;
 * else a map of its Wikidata point (Google's, or an OpenStreetMap render
 * credited on its card).
 */
async function mapPanel(ctx: Context, slide: Draft2SlideImage, entry: Extract<Draft2SlideMaterial, { kind: "map" }>): Promise<Draft2MapPanel | undefined> {
  const entity = ctx.inventory.entities.find((candidate) => candidate.id === entry.entityId);
  const place = entity?.place;
  if (!entity || !place) return undefined;
  const palette = mapPaletteFromBrand(ctx.profile.brandPalette ?? []);
  let bytes: Buffer;
  let panel: Omit<Draft2MapPanel, "sha256">;
  if (place.google && ctx.google) {
    bytes = await googleMapsProvider(ctx.google, ctx.signal).map(mapPoint({ id: place.google.placeId, name: place.google.name, address: place.google.address, latitude: place.google.latitude, longitude: place.google.longitude, sourceUrl: place.google.sourceUrl }), palette);
    panel = { provider: "Google", layout: "inset-labelled", label: { name: place.google.name, address: streetAddress(place.google.address) } };
  } else {
    const point = place.google ? { latitude: place.google.latitude, longitude: place.google.longitude } : (await placeEvidence(ctx, entity))?.evidence.coordinates;
    if (!point) return undefined;
    if (ctx.google) {
      bytes = await googleMapsProvider(ctx.google, ctx.signal).map(mapPoint({ id: place.wikidataId ?? entity.id, name: entity.name, address: "", latitude: point.latitude, longitude: point.longitude, sourceUrl: place.sourceUrl ?? "" }), palette);
      panel = { provider: "Google", layout: "inset" };
    } else {
      bytes = await renderOpenMap({ kind: "point", name: entity.name, points: [[point.longitude, point.latitude]] });
      panel = { provider: "OpenStreetMap", layout: "inset-labelled", label: { name: entity.name, address: OSM_ATTRIBUTION } };
    }
  }
  const png = await sharp(bytes, { limitInputPixels: 16_000_000 }).png().toBuffer();
  const sha256 = hash(png);
  await putPrivateR2Object({ objectKey: objectKey(ctx, mapFile(slide.slide)), body: png, contentType: "image/png", metadata: { sha256 } });
  return { ...panel, sha256 };
}

/** A verified place's photo, fetched again (v1 checks it within a day of use): the model's identity reference for the place. */
async function placePhoto(ctx: Context, entry: Extract<Draft2SlideMaterial, { kind: "place-photo" }>): Promise<File | undefined> {
  const entity = ctx.inventory.entities.find((candidate) => candidate.id === entry.entityId);
  if (!entity?.place?.photo) return undefined;
  const found = await placeEvidence(ctx, entity);
  if (!found) return undefined;
  const photo = entity.place.photo.source === "openverse"
    ? await openversePlacePhoto({ place: found.evidence, scope: ctx.profile.geoScope, topicId: ctx.topicId, storyId: ctx.storyId, signal: ctx.signal, contact: ctx.profile.geoProviderContact })
    : await found.providers.photo(found.evidence);
  if (!photo || !eligiblePhoto(photo.evidence, found.evidence)) return undefined;
  return new File([new Uint8Array(photo.bytes)], `${entity.id}-place-photo`, { type: photo.evidence.contentType });
}

type ImageRequest = { prompt: string; expectedText: string; files: File[]; endpoint: string; placePhoto?: string };

/**
 * One image request, built as v1 builds a slide's (manage-creative-assets.ts):
 * v1's prompt for the slide's unit, the zone a pasted photo or map takes,
 * the brand's references, the story photos, the verified place photo, and
 * for an edit the base image and what to change; the reference images in
 * v1's order (characters, brand, story photos, then the place photo or the
 * base, last).
 */
async function imageRequest(ctx: Context, slide: Draft2SlideImage, attempt: Draft2ImageAttempt): Promise<ImageRequest> {
  const unit = ctx.units[slide.order - 1];
  const pasted = slide.material.find(isPasted);
  const map = slide.material.find(isMap);
  const placeEntry = slide.material.find(isPlacePhoto);
  const storyEntries = slide.material.filter(isStoryPhoto);
  if (pasted && !pasted.sha256) {
    const [reference] = await resolveStoryReferences(ctx.topicId, ctx.storyId, [{ id: pasted.storyPhotoId, purpose: "documentary-portrait" }]);
    pasted.sha256 = reference.sha256;
  }
  if (map && !map.panel) {
    map.panel = await mapPanel(ctx, slide, map).catch(() => undefined);
    if (!map.panel) note(slide, `The map of ${map.name} could not be made, so the slide shows a generic scene of its kind.`);
  }
  const panel = map?.panel;
  const base = attempt.baseVersion
    ? await readPrivateR2ImageFile({ objectKey: objectKey(ctx, imageBaseFile(slide.slide, attempt.baseVersion)), contentType: "image/png", fileName: imageBaseFile(slide.slide, attempt.baseVersion) })
    : undefined;
  // An edit keeps what its base already shows of the place; only a new image receives the place photo again.
  const placeFile = placeEntry && !base ? await placePhoto(ctx, placeEntry).catch(() => undefined) : undefined;
  if (placeEntry && !base && !placeFile) note(slide, `The verified photo of ${placeEntry.name} could not be fetched again, so the slide shows a generic scene of its kind.`);
  const storyRefs = storyEntries.length ? await resolveStoryReferences(ctx.topicId, ctx.storyId, storyEntries.map((entry) => ({ id: entry.storyPhotoId, purpose: entry.purpose }))) : [];
  const characters = charactersForImageGeneration(slide.characterIds.flatMap((id) => ctx.characters.get(id) ?? []));
  const campaignCharacters = charactersForImageGeneration([...ctx.characters.values()]);
  const direction = panel ? mapInsetVisualDirection(unit.visualDirection, false) : photoLedVisualDirection(unit.visualDirection, storyRefs);
  const built = buildCreativeImagePrompt({
    draft: ctx.draft, unit: { ...unit, visualDirection: direction, characterIds: slide.characterIds }, brief: ctx.brief, characters, campaignCharacters,
    brandOverlay: ctx.overlay, carouselChromeSettings: ctx.profile.carouselChrome,
    profileVisual: { name: ctx.profile.name, visualGuidance: ctx.profile.visualGuidance, creativeIdentity: ctx.profile.creativeIdentity, brandPalette: ctx.profile.brandPalette },
    verifiedImagery: Boolean(pasted || panel || placeFile || storyRefs.some((reference) => reference.purpose !== "style")),
  });
  const characterImages = characters.flatMap((character) => character.referenceImages);
  const brandRefs = await resolveBrandGenerationReferences(ctx.topicId, ctx.brandSelections.get(slide.order));
  const zone = pasted ? portraitZonePrompt(portraitLayoutForSlide(slide.order)) : panel ? mapPanelZonePrompt(panel.layout) : "";
  let prompt = built.prompt + zone + brandReferencePrompt(brandRefs, characterImages.length)
    + storyReferencePrompt(storyRefs, characterImages.length + brandRefs.length) + (placeFile ? verifiedPlacePhotoInstruction(placeEntry?.name) : "");
  if (base) prompt += `\n\nIMAGE EDIT v1\nThe LAST input image is the base image to edit. Preserve its layout, copy and protagonist except for this requested change (data): ${JSON.stringify(attempt.instruction ?? "")}\nEND IMAGE EDIT`;
  else if (attempt.instruction) prompt += `\nRequested change: ${JSON.stringify(attempt.instruction)}`;
  if (prompt.length > MAX_CREATIVE_IMAGE_PROMPT_CHARACTERS) throw new Draft2InputError(`${slide.label}'s image prompt is longer than ${MAX_CREATIVE_IMAGE_PROMPT_CHARACTERS} characters.`);
  const files = [
    ...await Promise.all(characterImages.map((reference) => readPrivateR2ImageFile({ objectKey: reference.objectKey, contentType: reference.contentType, fileName: reference.fileName }))),
    ...await loadBrandGenerationImages(brandRefs, characterImages.length + (base ? 1 : 0)),
    ...await loadStoryReferenceImages(storyRefs),
    ...(placeFile ? [placeFile] : []),
    ...(base ? [base] : []),
  ];
  if (files.length > MAX_REFERENCE_FILES) throw new Draft2InputError(`${slide.label} has ${files.length} reference images; GPT Image takes ${MAX_REFERENCE_FILES}.`);
  if (files.reduce((bytes, file) => bytes + file.size, 0) > MAX_REFERENCE_BYTES) throw new Draft2InputError(`${slide.label}'s reference images exceed 20 MB.`);
  assertCreativeImageModelSupports(ctx.descriptor, { referenceCount: files.length, expectsText: Boolean(built.expectedText.trim()) });
  return {
    prompt, expectedText: built.expectedText, files,
    endpoint: creativeImageEndpoint(ctx.descriptor, files.length ? "reference-guided" : "text-to-image"),
    ...(placeFile && placeEntry ? { placePhoto: placeEntry.name } : {}),
  };
}

/**
 * Sends one image request. The prompt is stored first, and the attempt is
 * marked submitting before the provider is called: a request that dies after
 * fal accepted it leaves an attempt without a request id, which is failed
 * after the grace period and never sent again on its own (fal takes no
 * idempotency key).
 */
async function submitAttempt(ctx: Context, slide: Draft2SlideImage, attempt: Draft2ImageAttempt, checkpoint: () => Promise<unknown>): Promise<void> {
  try {
    const request = await imageRequest(ctx, slide, attempt);
    await putPrivateR2Object({ objectKey: objectKey(ctx, imagePromptFile(slide.slide, attempt.version)), body: Buffer.from(request.prompt, "utf8"), contentType: "text/plain; charset=utf-8" });
    Object.assign(attempt, {
      status: "submitting", endpoint: request.endpoint, promptCharacters: request.prompt.length, promptSha256: hash(Buffer.from(request.prompt, "utf8")),
      referenceImages: request.files.length, expectedText: request.expectedText, submittedAt: new Date().toISOString(), ...(request.placePhoto ? { placePhoto: request.placePhoto } : {}),
    } satisfies Partial<Draft2ImageAttempt>);
    await checkpoint();
    draft2DevTrace({ step: "images", round: attempt.version, provider: "fal", model: request.endpoint, operation: "draft2_image", phase: "request", detail: { slide: slide.slide, kind: attempt.kind, promptCharacters: request.prompt.length, referenceImages: request.files.length, instruction: attempt.instruction ?? null } });
    const send = () => submitFalImage({
      apiKey: ctx.fal.apiKey, prompt: request.prompt, width: ctx.fal.generationWidth, height: ctx.fal.generationHeight, aspectRatio: "4:5",
      imageQuality: IMAGES_QUALITY, model: ctx.descriptor, endpoint: request.endpoint, referenceImages: request.files, retention: "30d",
    });
    let requestId: string;
    try {
      requestId = await send();
    } catch (error) {
      if (!isTransientFalSubmitError(error)) throw error;
      await sleep(3_000);
      requestId = await send();
    }
    Object.assign(attempt, { status: "generating", requestId } satisfies Partial<Draft2ImageAttempt>);
  } catch (error) {
    Object.assign(attempt, { status: "failed", error: message(error), completedAt: new Date().toISOString() } satisfies Partial<Draft2ImageAttempt>);
  }
  await checkpoint();
}

/** v1's post-production, in v1's order: the pasted photo, the map panel, the page number, the logo. */
async function finish(ctx: Context, slide: Draft2SlideImage, image: Uint8Array): Promise<Uint8Array> {
  let out: Uint8Array = image;
  const pasted = slide.material.find(isPasted);
  if (pasted?.sha256) {
    const photo = await loadDocumentaryPortraitPhoto(pasted.storyPhotoId, pasted.sha256);
    const focus = await currentPortraitFocus(ctx.topicId, ctx.storyId, pasted.storyPhotoId, pasted.sha256);
    out = await compositeDocumentaryPortrait({ image: out, photo, layout: portraitLayoutForSlide(slide.order), accent: portraitAccent(ctx.profile.brandPalette ?? [], slide.order), ...(focus ? { focus } : {}) });
  }
  const panel = slide.material.find(isMap)?.panel;
  if (panel) {
    const file = await readPrivateR2ImageFile({ objectKey: objectKey(ctx, mapFile(slide.slide)), contentType: "image/png", fileName: mapFile(slide.slide) });
    const map = new Uint8Array(await file.arrayBuffer());
    if (hash(map) !== panel.sha256) throw new Draft2InputError(`The map of ${slide.label} changed since it was fetched; make the slide again.`);
    const color = mapPaletteFromBrand(ctx.profile.brandPalette ?? [])?.primary;
    out = await compositeMapPanel({ image: out, map, matColor: color ?? "#1f2933", layout: panel.layout, ...(panel.label ? { label: panel.label } : {}), ...(color ? { ink: color } : {}) });
  }
  const chrome = chromeFor(ctx, slide.order);
  if (chrome.overlay) out = await compositeCreativeCarouselChrome({ image: out, chrome });
  if (ctx.brandSnapshot && logoApplies(ctx, slide.order)) out = await compositeStoredCreativeBrand({ image: out, snapshot: ctx.brandSnapshot });
  return out;
}

/**
 * Asks fal for one image. When it is done, the finished slide (after v1's
 * post-production) and the image before it (the base an edit starts from)
 * are stored in R2, and the image is charged once (estimated, as v1 does).
 */
async function pollAttempt(ctx: Context, slide: Draft2SlideImage, attempt: Draft2ImageAttempt, finished: Map<Draft2ImageAttempt, Uint8Array>, errors: Map<Draft2ImageAttempt, number>, checkpoint: () => Promise<unknown>): Promise<void> {
  try {
    let raw: Uint8Array | undefined;
    let final: Uint8Array | undefined;
    const result = await pollFalImage({
      apiKey: ctx.fal.apiKey, requestId: attempt.requestId!, endpoint: attempt.endpoint!, targetWidth: OUTPUT.width, targetHeight: OUTPUT.height, retention: "30d",
      postProcess: async ({ normalizedPng }) => { raw = normalizedPng; final = await finish(ctx, slide, normalizedPng); return final; },
    });
    if (result.status !== "generated") return;
    if (!raw || !final) throw new Draft2InputError("The image came back without its post-production.");
    const sha256 = hash(final);
    await putPrivateR2Object({ objectKey: objectKey(ctx, imageFile(slide.slide, attempt.version)), body: final, contentType: "image/png", metadata: { sha256 } });
    await putPrivateR2Object({ objectKey: objectKey(ctx, imageBaseFile(slide.slide, attempt.version)), body: raw, contentType: "image/png", metadata: { sha256: hash(raw) } });
    const estimate = estimateFalImageCost({ endpoint: attempt.endpoint!, quality: IMAGES_QUALITY, width: ctx.fal.width, height: ctx.fal.height, promptCharacters: attempt.promptCharacters ?? 0, referenceImages: attempt.referenceImages ?? 0 });
    await recordUsageCharge({
      topicId: ctx.topicId, storyId: ctx.storyId, kind: "image", provider: "fal", model: attempt.endpoint!, operation: "draft2_image",
      units: { images: 1, width: ctx.fal.width, height: ctx.fal.height, quality: IMAGES_QUALITY, referenceImages: attempt.referenceImages ?? 0, promptCharacters: attempt.promptCharacters ?? 0 },
      costMicros: estimate?.costMicros ?? null, estimated: true, rate: estimate?.rate ?? { unpriced: true },
      idempotencyKey: `draft2-image:${ctx.run.runId}:${slide.slide}:v${attempt.version}`,
    });
    Object.assign(attempt, {
      status: "generated", sha256, completedAt: new Date().toISOString(),
      ...(result.image.safetyFlag ? { safetyFlag: true } : {}), ...(estimate ? { costMicros: estimate.costMicros } : {}),
    } satisfies Partial<Draft2ImageAttempt>);
    finished.set(attempt, final);
  } catch (error) {
    const count = (errors.get(attempt) ?? 0) + 1;
    errors.set(attempt, count);
    if (count < POLL_ATTEMPTS) return;
    Object.assign(attempt, { status: "failed", error: message(error), completedAt: new Date().toISOString() } satisfies Partial<Draft2ImageAttempt>);
  }
  await checkpoint();
}

/**
 * Sol's review of one finished slide: v1's checks (real people, third-party
 * logos, the brand's avoid list, the facts, invented named subjects) and the
 * words as they appear, what covers them and the lettering; the program
 * compares the words. A review that cannot run leaves the image for the
 * editor, never fails it.
 */
async function reviewAttempt(ctx: Context, slide: Draft2SlideImage, attempt: Draft2ImageAttempt, image: Uint8Array): Promise<void> {
  const model = draft2SolModel(process.env);
  const at = new Date().toISOString();
  const begin = Date.now();
  const pasted = slide.material.find(isPasted);
  const panel = slide.material.find(isMap)?.panel;
  const identity = ctx.profile.creativeIdentity;
  const input: CreativeImageReviewInput = {
    visibleText: attempt.expectedText ?? "",
    publicationName: ctx.profile.name,
    ...(pasted ? { verifiedPhoto: { personName: pasted.name, region: portraitPhotoRegion(portraitLayoutForSlide(slide.order)) } } : {}),
    ...(panel ? { verifiedMap: { provider: panel.provider, region: mapPanelRegion(panel.layout) } } : {}),
    ...(attempt.placePhoto ? { verifiedPlacePhoto: { placeName: attempt.placePhoto } } : {}),
    characters: slide.characterIds.flatMap((id) => { const character = ctx.characters.get(id); return character ? [{ name: character.name, description: character.description }] : []; }),
    facts: slideFacts(ctx.units[slide.order - 1].factIds, ctx.facts),
    ...(identity?.avoid.length ? { brand: { avoid: identity.avoid.map((group) => `${group.category}: ${group.items.join("; ")}`), allowed: identity.allowed, acceptance: identity.acceptance } } : {}),
  };
  const scriptSlide = ctx.script.slides.find((entry) => entry.slide === slide.slide);
  const { instructions, skillVersions } = composeInstructions("image-judge", [IMAGES_SKILL], brandBrief(ctx.profile));
  const contents = {
    ...JSON.parse(buildImageReviewText(input)) as Record<string, unknown>,
    slide: { label: slide.label, need: slide.need, beat: scriptSlide?.beat ?? "", headlineLink: scriptSlide?.headlineLink ?? "" },
    addedAfterwards: { logo: logoApplies(ctx, slide.order), pageNumber: chromeFor(ctx, slide.order).overlay ? `${slide.order}/${ctx.carousel.length}` : null },
  };
  const preview = await sharp(image).resize({ width: 864, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  draft2DevTrace({ step: "images", round: attempt.version, provider: "openai", model, operation: "draft2_image_review", phase: "request", detail: { slide: slide.slide, contents } });
  try {
    const answered = await generateOpenAiStructuredResponse({
      apiKey: process.env.OPENAI_API_KEY?.trim() ?? "", model, instructions: `${instructions}\n\n# The checks v1 makes on every slide\n${buildImageReviewInstructions()}`, contents,
      images: [`data:image/jpeg;base64,${preview.toString("base64")}`], schema: DRAFT2_IMAGE_REVIEW_SCHEMA, schemaName: "draft2_image_review",
      maxOutputTokens: REVIEW_MAX_OUTPUT_TOKENS, reasoningEffort: "low", timeoutMs: REVIEW_TIMEOUT_MS,
      auditContext: { runId: ctx.sessionId, topicId: ctx.topicId, storyId: ctx.storyId },
    });
    const durationMs = Date.now() - begin;
    ctx.trace.push({ at, step: "images", round: attempt.version, provider: "openai", model, operation: "draft2_image_review", durationMs, usage: answered.usage, cachedInputTokens: answered.cachedInputTokens, answerCharacters: answered.text.length, outcome: "ok", note: slide.label, skillVersions, effort: "low", ...traceCost("openai", model, answered.usage, answered.cachedInputTokens) });
    draft2DevTrace({ step: "images", round: attempt.version, provider: "openai", model, operation: "draft2_image_review", phase: "response", durationMs, detail: { slide: slide.slide, answer: answered.text } });
    attempt.review = draft2ImageReview(parseDraft2ImageReview(answered.text), { ...input, expectedText: attempt.expectedText ?? "" }, { model, at, durationMs });
  } catch (error) {
    const durationMs = Date.now() - begin;
    ctx.trace.push({ at, step: "images", round: attempt.version, provider: "openai", model, operation: "draft2_image_review", durationMs, outcome: "error", note: `${slide.label}: ${message(error)}`, ...failedCall(error), skillVersions });
    attempt.review = { status: "unavailable", issues: [], note: `Sol could not review this image (${message(error)}); look at it yourself.`, transcription: "", model, at, durationMs };
  }
}

/** Everything a request needs to build and finish images, read once per request. */
async function imagesContext({ topicId, storyId, sessionId, run, target, facts, profile, fal, descriptor, signal, trace }: {
  topicId: string; storyId: string; sessionId: string; run: Draft2ImagesRun; target: ReturnType<typeof imagesTarget>; facts: readonly Draft2Fact[];
  profile: CreativeProfile; fal: Context["fal"]; descriptor: Context["descriptor"]; signal: AbortSignal; trace: Draft2TraceEntry[];
}): Promise<Context> {
  const { overlay, snapshot } = await brandOverlay(topicId, profile);
  const characters = await snapshotsForCreativeCharacterIds(topicId, [...new Set(run.slides.flatMap((slide) => slide.characterIds))]);
  const units = run.slides.map((slide, index) => {
    const scriptSlide = target.script.slides.find((entry) => entry.slide === slide.slide);
    if (!scriptSlide) throw new Draft2InputError(`The visual script has no image for ${slide.label}. Write the visual script again.`);
    return slideUnit(target.carousel, index, scriptSlide, slide.material);
  });
  const brandSelections = selectBrandReferencesForDraft({
    units: units.map((unit) => ({ order: unit.order, role: unit.role, visualDirection: unit.visualDirection })), eligible: await listActivatedBrandReferences(topicId),
    budget: getBrandReferenceSelectionBudget(), generativeImageryAllowed: true, characterImageCountByOrder: new Map(run.slides.map((slide) => [slide.order, slide.characterIds.length])),
  });
  // The two v1 rows its prompt builder reads, held in memory: only the fields it reads (build-creative-image-prompt.ts).
  const draft = { format: "carousel", outputAspectRatio: "4:5", concept: storyConcept(target.script), units } as unknown as CreativeDraft;
  const brief = {
    profileSnapshot: profile, tone: toneFor(target.visual.focus?.values, profile),
    keyFacts: facts.map((fact) => ({ id: fact.id, statement: fact.claim, sourceExcerpt: fact.evidence })),
  } as unknown as CreativeBrief;
  return {
    topicId, storyId, sessionId, run, script: target.script, carousel: target.carousel, inventory: target.inventory, facts, profile,
    ...(overlay ? { overlay } : {}), ...(snapshot ? { brandSnapshot: snapshot } : {}), characters, brandSelections, units, draft, brief, fal, descriptor,
    ...(googleConfig() ? { google: googleConfig() } : {}), signal, trace,
  };
}

const withoutHistory = ({ previousRuns, ...run }: Draft2Images): Draft2ImagesRun => { void previousRuns; return run; };

/**
 * Makes the images of the chosen visual script: each slide generated, Sol's
 * review, and one correction for a slide the review flags, three provider
 * calls a slide at most. The work is pull-based (fal queues each image):
 * a request submits, polls, finishes, reviews and corrects until every
 * slide settles or its time is spent; then the run pauses with everything
 * saved, and a continue request picks it up (request ids are kept, so no
 * image is asked for twice). A new run keeps the earlier one, files and all.
 */
export async function runDraft2Images({ topicId, storyId, sessionId, resume = false }: { topicId: string; storyId: string; sessionId: string; resume?: boolean }): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session || session.storyId !== storyId) throw new Draft2InputError("This Draft 2 session was not found for the story. Reload the canvas.");
  if (await activeDraft2Session(topicId, storyId)) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const facts = session.facts ?? [];
  if (!facts.length || (session.step === "facts" && session.status !== "ready")) throw new Draft2InputError("Images build only on verified facts. Verify the facts first.");
  const current = session.images ?? undefined;
  if (resume && !current?.slides.some((slide) => !slideSettled(slide))) throw new Draft2InputError("There are no images waiting to be made. Generate the images again.");
  const target = imagesTarget(session);
  if (resume && current && (current.visualId !== target.script.id || current.inventoryVersion !== target.inventory.version)) {
    throw new Draft2InputError("The visual script or the people and places changed since these images started. Generate the images again.");
  }
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Draft2InputError("OPENAI_API_KEY is not configured; Sol reviews the images.");
  let fal: Context["fal"];
  try {
    fal = getFalImageRuntimeConfig("4:5", IMAGES_QUALITY);
  } catch (error) {
    if (error instanceof FalImageConfigurationError) throw new Draft2InputError("FAL_KEY is not configured; GPT Image makes the images through fal.");
    throw error;
  }
  const descriptor = creativeImageModel(resolveDefaultCreativeImageModel());
  const profile = await getCreativeProfile(topicId);
  const now = new Date();
  const run: Draft2ImagesRun = resume && current
    ? { ...withoutHistory(current), status: "running", error: undefined, updatedAt: now.toISOString() }
    : newImagesRun({ runId: randomUUID(), visual: target.visual, script: target.script, carousel: target.carousel, inventory: target.inventory, model: descriptor.providerModel, now });
  const previousRuns = resume ? current?.previousRuns : current ? [...(current.previousRuns ?? []), withoutHistory(current)] : undefined;
  const images = (): Draft2Images => ({ ...run, ...(previousRuns?.length ? { previousRuns } : {}) });
  const claimed = await claimDraft2Session(session.id, { step: "images", images: images(), error: null });
  if (!claimed) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const trace: Draft2TraceEntry[] = [...session.trace];
  const checkpoint = (patch: Draft2SessionPatch = {}) => { run.updatedAt = new Date().toISOString(); return updateDraft2Session(session.id, { images: images(), trace, ...patch }); };
  const heartbeat = setInterval(() => { void touchDraft2Session(session.id).catch(() => undefined); }, HEARTBEAT_MS);
  const controller = new AbortController();
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  try {
    await withCreativeTextBudget({ topicId, storyId, runId: session.id }, async () => {
      const ctx = await imagesContext({ topicId, storyId, sessionId: session.id, run, target, facts, profile, fal, descriptor, signal: controller.signal, trace });
      const finished = new Map<Draft2ImageAttempt, Uint8Array>();
      const pollErrors = new Map<Draft2ImageAttempt, number>();
      const pause = async () => {
        run.status = "paused";
        run.error = "Paused: this request's time is spent. The images continue in a new request.";
        await checkpoint({ status: "needs-review", error: run.error });
      };
      for (;;) {
        const latest = run.slides.flatMap((slide) => { const attempt = latestAttempt(slide); return attempt ? [{ slide, attempt }] : []; });
        // A submission whose request died after fal may have accepted it: its outcome is unknown, so it is failed, never sent again.
        for (const { attempt } of latest) {
          if (attempt.status === "submitting" && !attempt.requestId && Date.now() - Date.parse(attempt.submittedAt ?? attempt.queuedAt) > IMAGE_SUBMISSION_GRACE_MS) {
            Object.assign(attempt, { status: "failed", error: "Its request was lost while it was being sent; make this slide again.", completedAt: new Date().toISOString() } satisfies Partial<Draft2ImageAttempt>);
            await checkpoint();
          }
        }
        if (elapsed() > TIME_BUDGET_MS) return pause();
        await inBatches(latest.filter(({ attempt }) => attempt.status === "queued"), IMAGE_SUBMIT_CONCURRENCY, ({ slide, attempt }) => submitAttempt(ctx, slide, attempt, checkpoint));
        await inBatches(latest.filter(({ attempt }) => attempt.status === "generating" && attempt.requestId), IMAGE_SUBMIT_CONCURRENCY, ({ slide, attempt }) => pollAttempt(ctx, slide, attempt, finished, pollErrors, checkpoint));
        const toReview = run.slides.flatMap((slide) => { const attempt = latestAttempt(slide); return attempt && awaitsReview(attempt) ? [{ slide, attempt }] : []; });
        if (toReview.length && REQUEST_DEADLINE_MS - elapsed() < REVIEW_TIMEOUT_MS + 10_000) return pause();
        await inBatches(toReview, REVIEW_CONCURRENCY, async ({ slide, attempt }) => {
          const image = finished.get(attempt) ?? new Uint8Array(await (await readPrivateR2ImageFile({ objectKey: objectKey(ctx, imageFile(slide.slide, attempt.version)), contentType: "image/png", fileName: imageFile(slide.slide, attempt.version) })).arrayBuffer());
          await reviewAttempt(ctx, slide, attempt, image);
          // A first image the review flags is corrected once, from that image before its overlays.
          const correction = correctionFor(slide, attempt, new Date());
          if (correction) slide.attempts.push(correction);
          await checkpoint();
        });
        if (run.slides.every(slideSettled)) {
          run.status = settledStatus(run.slides);
          run.error = imagesNote(run.slides);
          await checkpoint({ status: run.status === "ready" ? "ready" : "needs-review", error: run.error ?? null });
          return;
        }
        // Corrections just queued go out at once; otherwise wait for fal.
        if (!run.slides.some((slide) => latestAttempt(slide)?.status === "queued")) await sleep(POLL_INTERVAL_MS);
      }
    });
  } catch (error) {
    run.status = "failed";
    run.error = message(error);
    await checkpoint({ status: "failed", error: run.error }).catch(() => undefined);
    throw error;
  } finally {
    clearInterval(heartbeat);
    controller.abort();
  }
  return (await updateDraft2Session(session.id, {})) ?? claimed;
}

/**
 * One editor decision, with no provider call: another image of a slide (from
 * its prompt again, or an edit of the image it shows, with what to change),
 * which the next continue request makes; or the version a slide shows.
 */
export async function editDraft2Images({ topicId, sessionId, input }: { topicId: string; sessionId: string; input: unknown }): Promise<Draft2SessionRow> {
  const action = parseImagesAction(input);
  const session = await getDraft2Session(topicId, sessionId);
  if (!session) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  const images = session.images;
  if (!images) throw new Draft2InputError("Generate the images first.");
  const working = session.status === "running" && Date.now() - new Date(session.updatedAt).getTime() < OPENING_STALL_MS;
  if (working) throw new Draft2BusyError("The images are still being made; decide when they finish.");
  const slide = images.slides.find((entry) => entry.slide === action.slide);
  if (!slide) throw new Draft2InputError(`${action.slide} is not one of this carousel's slides.`);
  const now = new Date();
  const changed = action.action === "choose" ? chosenSlide(slide, action.version) : regeneratedSlide(slide, action, now);
  const slides = images.slides.map((entry) => entry === slide ? changed : entry);
  const settled = slides.every(slideSettled);
  const status = settled ? settledStatus(slides) : "paused";
  const next: Draft2Images = { ...images, slides, status, updatedAt: now.toISOString(), error: settled ? imagesNote(slides) : "One slide waits to be made; continue to make it." };
  const updated = await updateDraft2Session(session.id, { images: next, ...(settled && session.step === "images" ? { status: status === "ready" ? "ready" : "needs-review", error: next.error ?? null } : {}) });
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}

/** One finished image of this session, as stored, for the canvas (checked against its record). */
export async function draft2ImageFile({ topicId, sessionId, runId, slide, version }: { topicId: string; sessionId: string; runId: string; slide: string; version: number }): Promise<File> {
  const session = await getDraft2Session(topicId, sessionId);
  const run = session?.images ? [withoutHistory(session.images), ...(session.images.previousRuns ?? [])].find((entry) => entry.runId === runId) : undefined;
  const attempt = run?.slides.find((entry) => entry.slide === slide)?.attempts.find((entry) => entry.version === version);
  if (!session || !run || attempt?.status !== "generated" || !attempt.sha256) throw new Draft2InputError("That image is not one of this session's finished images.");
  const file = await readPrivateR2ImageFile({ objectKey: buildDraft2ImageObjectKey({ topicId, sessionId, runId, file: imageFile(slide, version) }), contentType: "image/png", fileName: imageFile(slide, version) });
  if (hash(new Uint8Array(await file.arrayBuffer())) !== attempt.sha256) throw new Draft2InputError("The stored image does not match its record; make the slide again.");
  return file;
}
