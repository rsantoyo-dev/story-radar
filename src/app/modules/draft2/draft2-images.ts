import "server-only";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { withCreativeTextBudget } from "../stories/creative-text-meter";
import { generateOpenAiStructuredResponse } from "../stories/openai-structured-response";
import { getCreativeProfile } from "../stories/creative-profile.repository";
import { buildCreativeImagePrompt } from "../stories/build-creative-image-prompt";
import { creativeImageModelVisibleText } from "../stories/creative-image-prompt-contracts";
import { storyPlaces } from "./draft2-data-marks";
import { autoWordsLayout, drawWords, remarkData, setSlideWords, textBandFor, textBandPrompt, wordsBlockBottom, wordsPalette, wordsParts, type Draft2TextBand, type Draft2WordsPalette, type Draft2WordsParts } from "./draft2-text-layer";
import { DEFAULT_WORDS_STYLE, type CreativeWordsStyle } from "../stories/brand-fonts";
import { focusPresentation, type Draft2Presentation } from "./draft2-focus.types";
import {
  MAX_CREATIVE_IMAGE_PROMPT_CHARACTERS,
  type BrandReferenceSelection, type CreativeBrandOverlay, type CreativeBrandOverlaySnapshot, type CreativeBrief, type CreativeCharacterSnapshot,
  type CreativeDraft, type CreativeImageQuality, type CreativeProfile, type CreativeTone, type CreativeUnit,
} from "../stories/creative-content.types";
import { buildCreativeCarouselChrome, compositeCreativeCarouselChrome } from "../stories/creative-carousel-chrome";
import { computeCreativeBrandPromptExclusionRect, creativeCanvasDimensions, shouldApplyCreativeBrandOverlay } from "../stories/creative-brand-overlay";
import { creativeLogoVersionsForSlide, creativeLogoZoneSize } from "../stories/creative-brand-logo-versions";
import { creativeBrandOverlaySnapshot, findCreativeBrandAsset } from "../stories/creative-brand-assets.repository";
import { compositeStoredCreativeBrandVersion, isTransientFalSubmitError } from "../stories/manage-creative-assets";
import { compositeDocumentaryPortrait, fitPortrait, portraitAccent, portraitLayoutForSlide, portraitPhotoRegion, portraitZonePrompt, type PortraitFit, type PortraitSubject } from "../stories/creative-portrait-composite";
import { compositeMapPanel, mapInsetVisualDirection, mapPaletteFromBrand, mapPanelRegion, mapPanelZonePrompt, streetAddress } from "../stories/creative-map-panel";
import { requestsGeographicReconstruction, requestsPlacePhotograph } from "../stories/creative-evidence-guardrails";
import { photoLedVisualDirection, storyReferencePrompt } from "../stories/story-reference-generation";
import { currentPortraitFocus, loadDocumentaryPortraitPhoto, loadStoryReferenceImages, resolveStoryReferences } from "../stories/manage-story-photos";
import { publishablePhoto } from "../stories/story-materials.types";
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
import { zipStore } from "../stories/zip-store";
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
import { draft2ModelName, draft2PortraitModel, draft2SolModel } from "./draft2-models";
import { placeMention } from "./draft2-inventory";
import {
  ANCHOR_PLATE_FILE, ANCHOR_PLATE_PROMPT_FILE, OWN_SCENE_MIN_SECTION, anchorPlateSettled, cutSections, masterPlateFile, nextSceneVersion, ownSceneOriginalFile, sceneBefore, setAsMismatches, standingScene, masterPlatePromptFile, type Draft2OwnFit, type Draft2OwnImage, type Draft2CutOffset, type Draft2MasterPlateRecord, slideCarriesAnchor, visualNarrative, type Draft2AnchorPlate, type Draft2MasterPlate,
  COVER_PROGRAM_PROMPT, COVER_PROMPT, DRAFT2_IMAGE_REVIEW_SCHEMA, DRAFT2_PORTRAIT_SUBJECT_SCHEMA, IMAGE_SUBMISSION_GRACE_MS, IMAGE_SUBMIT_CONCURRENCY, IMAGES_QUALITY, PORTRAIT_LOCATOR_INSTRUCTIONS, focusSubject, parsePortraitSubject,
  awaitsReview, chosenSlide, correctionFor, draft2ImageDownloads, draft2ImageReview, imageBaseFile, imageFile, imagePromptFile, imagesNote, imagesTarget, latestAttempt, mapFile,
  movedMapSlide, newImagesRun, parseDraft2ImageReview, parseImagesAction, regeneratedSlide, settledStatus, shownAttempt, slideFacts, slideSettled, slideUnit, slideWordsOf, slidesWithChangedWords,
  type Draft2ImageAttempt, type Draft2ImageReview, type Draft2WordsLayout, withStyleOf, type Draft2Images, type Draft2ImagesRun, type Draft2MapPanel, type Draft2PortraitFit, type Draft2SlideImage, type Draft2SlideMaterial,
} from "./draft2-images.types";
import { OPENING_STALL_MS } from "./draft2-opening.types";
import { anchorNoun, type Draft2FocusNarrative, type Draft2FocusValues, type Draft2PanoramaDevice, type Draft2PanoramaStationSize, type Draft2SpinePanorama } from "./draft2-focus.types";
import { resolveCreativeVisualGuidance } from "../stories/creative-visual-guidance";
import type { Draft2Inventory, Draft2InventoryEntity } from "./draft2-inventory.types";
import type { Draft2CarouselSlide, Draft2VisualCandidate } from "./draft2-visual.types";
import { editorCast } from "./draft2-visual.types";
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
/** Luna locating a person on a real photo: a short answer, its reasoning included. */
const PORTRAIT_TIMEOUT_MS = 60_000;
const PORTRAIT_MAX_OUTPUT_TOKENS = 2_000;
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
  /** How the run makes its images: the words drawn in them or set by the program, one per slide or one panorama. */
  presentation: Draft2Presentation;
  /** The colours the program sets the words in: the palette's darkest and lightest. */
  wordsPalette: Draft2WordsPalette;
  /** The brand's fonts for the words: its headline and text families, else the bundled Liberation Sans. */
  wordsStyle: CreativeWordsStyle;
  /** The story's places, which the program marks with the text's data when the brand sets a data weight. */
  wordsPlaces: string[];
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
  /** Each version of the logo as stored, read once per request by its sha256. */
  logos: Map<string, Promise<Uint8Array>>;
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
  /** The narrative form the visual script followed: its anchor is on every slide that carries one. */
  narrative: Draft2FocusNarrative;
  /** The master scene as stored, read once and checked against its record, for every slide's section. */
  master?: Promise<Uint8Array | undefined>;
  /** A panorama's scene as the spine designed it (spine v10): the world, the axis, the field, the carrier and each beat's station. Absent on a spine written before it. */
  panorama?: Draft2SpinePanorama;
};

/** The quality a panorama's or a line's scene is drawn at: one call for every slide, so a tier above them unless DRAFT2_SCENE_QUALITY says otherwise. */
function sceneQuality(): CreativeImageQuality {
  const value = process.env.DRAFT2_SCENE_QUALITY?.trim().toLowerCase();
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

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

/**
 * The Topic's logo as v1 composites it (resolveCreativeBrandGeneration): off,
 * or its settings with the stored PNG they point to, and the stored PNG of
 * each of its versions, from which every slide receives the one that reads
 * best there.
 */
async function brandOverlay(topicId: string, profile: CreativeProfile): Promise<{ overlay?: CreativeBrandOverlay; snapshot?: CreativeBrandOverlaySnapshot }> {
  const overlay = profile.brandOverlay;
  if (!overlay?.enabled) return {};
  if (!overlay.assetId || !overlay.asset) throw new Draft2InputError("The brand's logo is on but has no PNG. Upload and save the logo in the creative profile, or turn it off.");
  const stored = await findCreativeBrandAsset(topicId, overlay.assetId);
  if (!stored || stored.id !== overlay.asset.id) throw new Draft2InputError("The brand's logo is no longer available for this topic. Choose and save a current logo in the creative profile.");
  const versions = await Promise.all((overlay.versions ?? []).map(async (version) => {
    const asset = await findCreativeBrandAsset(topicId, version.assetId);
    if (!asset) throw new Draft2InputError("A version of the brand's logo is no longer available for this topic. Remove it from the creative profile, or upload it again.");
    return { form: version.form, tone: version.tone, asset };
  }));
  const settings = {
    enabled: overlay.enabled, scope: overlay.scope, placement: overlay.placement, sizePercent: overlay.sizePercent, insetPercent: overlay.insetPercent,
    backdropMode: overlay.backdropMode, backdropColor: overlay.backdropColor, backdropOpacity: overlay.backdropOpacity,
    ...(overlay.innerForm ? { innerForm: overlay.innerForm } : {}), ...(overlay.mainTone ? { mainTone: overlay.mainTone } : {}),
  };
  return { overlay: { ...settings, assetId: stored.id, asset: overlay.asset }, snapshot: creativeBrandOverlaySnapshot(settings, stored, versions) };
}

/**
 * The logo's slot on a slide, for the prompt and the page number: the
 * settings with the proportions that hold every version the slide may
 * receive (the symbol's square on an inner slide, the full logo's band on
 * the cover).
 */
function overlayFor(ctx: Pick<Context, "overlay" | "brandSnapshot">, order: number): CreativeBrandOverlay | undefined {
  if (!ctx.overlay?.asset || !ctx.brandSnapshot) return ctx.overlay;
  return { ...ctx.overlay, asset: { ...ctx.overlay.asset, ...creativeLogoZoneSize(creativeLogoVersionsForSlide(ctx.brandSnapshot, order)) } };
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
  const overlay = overlayFor(ctx, order);
  const asset = overlay?.asset;
  const logoZone = overlay && asset && shouldApplyCreativeBrandOverlay(overlay, order)
    ? computeCreativeBrandPromptExclusionRect({ settings: overlay, canvasWidth: OUTPUT.width, canvasHeight: OUTPUT.height, logoWidth: asset.width, logoHeight: asset.height })
    : undefined;
  return buildCreativeCarouselChrome({ aspectRatio: "4:5", unitOrder: order, totalSlides: ctx.carousel.length, settings: ctx.profile.carouselChrome, logoExclusionZone: logoZone });
}

const logoApplies = (ctx: Context, order: number) => Boolean(ctx.brandSnapshot && shouldApplyCreativeBrandOverlay(ctx.brandSnapshot, order));

/** Where the program sets a slide's words: below the logo where the logo sits on top, above the page number when a real photo or the map card takes the top. */
function textBandOf(ctx: Context, slide: Draft2SlideImage, attempt: Pick<Draft2ImageAttempt, "portrait">): Draft2TextBand {
  const overlay = overlayFor(ctx, slide.order);
  const asset = overlay?.asset;
  const logo = overlay && asset && shouldApplyCreativeBrandOverlay(overlay, slide.order)
    ? computeCreativeBrandPromptExclusionRect({ settings: overlay, canvasWidth: OUTPUT.width, canvasHeight: OUTPUT.height, logoWidth: asset.width, logoHeight: asset.height })
    : undefined;
  const pasted = slide.material.find(isPasted);
  const panel = slide.material.find(isMap)?.panel;
  return textBandFor({ ...(logo ? { logo } : {}), ...(pasted ? { photoLayout: attempt.portrait?.layout ?? portraitLayoutForSlide(slide.order) } : {}), ...(panel ? { mapPosition: panel.position ?? "bottom-right" } : {}) });
}

/** The words the program sets on a slide, from the carousel as the run reads it. */
const wordsFor = (ctx: Context, slide: Draft2SlideImage) => {
  const words = ctx.carousel.find((entry) => entry.slide === slide.slide);
  if (!words) throw new Draft2InputError(`${slide.label} has no words in the carousel.`);
  return slideWordsOf(words);
};

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

/** A direction that asks for geography: a map, a plan, a real view of the place (v1's detectors, and the plain words they leave out). */
const asksForGeography = (direction: string) => requestsGeographicReconstruction(direction) || requestsPlacePhotograph(direction)
  || /\b(?:maps?|plans?|cartes?|mapas?|planos?)\b/u.test(direction.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase());

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
  // The photo pasted on the slide, read again: its hash, and whether the publication may still publish it.
  const pastedReference = pasted ? (await resolveStoryReferences(ctx.topicId, ctx.storyId, [{ id: pasted.storyPhotoId, purpose: "documentary-portrait" }]))[0] : undefined;
  if (pasted && !pasted.sha256 && pastedReference) pasted.sha256 = pastedReference.sha256;
  if (pasted) attempt.portrait = attemptPortrait(slide, attempt, pasted);
  if (map && !map.panel) {
    map.panel = await mapPanel(ctx, slide, map).catch(() => undefined);
    if (!map.panel) note(slide, `The map of ${map.name} could not be made, so the slide shows a generic scene of its kind.`);
  }
  const panel = map?.panel;
  const base = attempt.baseVersion
    ? await readPrivateR2ImageFile({ objectKey: objectKey(ctx, imageBaseFile(slide.slide, attempt.baseVersion)), contentType: "image/png", fileName: imageBaseFile(slide.slide, attempt.baseVersion) })
    : undefined;
  // A panorama's or a line's slide is redrawn from its section of the master scene, given last; an edit redraws its own base instead.
  const section = ctx.run.masterPlate?.status === "generated" && !base ? await masterSectionFile(ctx, slide) : undefined;
  // An edit keeps what its base already shows of the place; only a new image receives the place photo again.
  const placeFile = placeEntry && !base ? await placePhoto(ctx, placeEntry).catch(() => undefined) : undefined;
  if (placeEntry && !base && !placeFile) note(slide, `The verified photo of ${placeEntry.name} could not be fetched again, so the slide shows a generic scene of its kind.`);
  const storyRefs = storyEntries.length ? await resolveStoryReferences(ctx.topicId, ctx.storyId, storyEntries.map((entry) => ({ id: entry.storyPhotoId, purpose: entry.purpose }))) : [];
  // A photo the editor declared reference only since the run began is never published, pasted or adapted.
  const unpublishable = [pastedReference, ...storyRefs].find((reference) => reference && !publishablePhoto(reference.publicationRights));
  if (unpublishable) throw new Draft2InputError(`${unpublishable.name} is reference only: declare its publication rights in People & places, or make the visual script again without it.`);
  const characters = charactersForImageGeneration(slide.characterIds.flatMap((id) => ctx.characters.get(id) ?? []));
  const campaignCharacters = charactersForImageGeneration([...ctx.characters.values()]);
  // On a map slide the card is the only geography: a direction that mentions a map, a plan or a real view gives way to the scene.
  const direction = panel ? mapInsetVisualDirection(unit.visualDirection, asksForGeography(unit.visualDirection)) : photoLedVisualDirection(unit.visualDirection, storyRefs);
  const built = buildCreativeImagePrompt({
    draft: ctx.draft, unit: { ...unit, visualDirection: direction, characterIds: slide.characterIds }, brief: ctx.brief, characters, campaignCharacters,
    brandOverlay: overlayFor(ctx, slide.order), carouselChromeSettings: ctx.profile.carouselChrome,
    profileVisual: { name: ctx.profile.name, visualGuidance: ctx.profile.visualGuidance, creativeIdentity: ctx.profile.creativeIdentity, brandPalette: ctx.profile.brandPalette },
    verifiedImagery: Boolean(pasted || panel || placeFile || storyRefs.some((reference) => reference.purpose !== "style")),
    // The program sets the words afterwards: the image carries none, and keeps the band calm for them.
    wordsSetAfterwards: ctx.presentation.text === "program",
  });
  const program = ctx.presentation.text === "program";
  const characterImages = characters.flatMap((character) => character.referenceImages);
  // The narrative's anchor, drawn once before the slides, goes right after the characters: the slide shows it as the plate does.
  const plateFile = ctx.run.anchorPlate?.status === "generated" && slideCarriesAnchor(slide) ? await anchorPlateFile(ctx, slide) : undefined;
  const plates = plateFile ? 1 : 0;
  const brandRefs = await resolveBrandGenerationReferences(ctx.topicId, ctx.brandSelections.get(slide.order));
  const zone = pasted ? portraitZonePrompt(attempt.portrait?.layout ?? portraitLayoutForSlide(slide.order)) : panel ? mapPanelZonePrompt(panel.layout, panel.position) : "";
  let prompt = built.prompt + zone + (program ? textBandPrompt(textBandOf(ctx, slide, attempt)) : "") + (plateFile ? anchorReferencePrompt(ctx, characterImages.length + 1) : "") + brandReferencePrompt(brandRefs, characterImages.length + plates)
    + storyReferencePrompt(storyRefs, characterImages.length + plates + brandRefs.length) + (placeFile ? verifiedPlacePhotoInstruction(placeEntry?.name) : "") + (slide.order === 1 ? (program ? COVER_PROGRAM_PROMPT : COVER_PROMPT) : "");
  if (base) prompt += `\n\nIMAGE EDIT v1\nThe LAST input image is the base image to edit. Preserve its layout, copy and protagonist except for this requested change (data): ${JSON.stringify(attempt.instruction ?? "")}\nEND IMAGE EDIT`;
  else if (section) prompt += masterSectionPrompt(ctx);
  else if (attempt.instruction) prompt += `\nRequested change: ${JSON.stringify(attempt.instruction)}`;
  // A character on a map slide is the reader's guide beside the card, never someone standing at the place.
  if (panel && slide.characterIds.length) prompt += "\nThe brand's characters on this slide stand in the graphic area beside the map card's zone, as the reader's guide consulting the practical information, in their own reference style: never inside a scene of the place, never in front of the card.";
  // An editor who asks to move or fix the map means the card the program pastes: the model never draws one.
  if (panel && attempt.instruction) prompt += "\nThe verified map card is placed by the program after generation, in the zone kept for it: never draw a map, a plan, streets or a route yourself, whatever the requested change says about the map.";
  if (prompt.length > MAX_CREATIVE_IMAGE_PROMPT_CHARACTERS) throw new Draft2InputError(`${slide.label}'s image prompt is longer than ${MAX_CREATIVE_IMAGE_PROMPT_CHARACTERS} characters.`);
  const files = [
    ...await Promise.all(characterImages.map((reference) => readPrivateR2ImageFile({ objectKey: reference.objectKey, contentType: reference.contentType, fileName: reference.fileName }))),
    ...(plateFile ? [plateFile] : []),
    ...await loadBrandGenerationImages(brandRefs, characterImages.length + plates + (base || section ? 1 : 0)),
    ...await loadStoryReferenceImages(storyRefs),
    ...(placeFile ? [placeFile] : []),
    ...(base ? [base] : []),
    ...(section ? [section] : []),
  ];
  if (files.length > MAX_REFERENCE_FILES) throw new Draft2InputError(`${slide.label} has ${files.length} reference images; GPT Image takes ${MAX_REFERENCE_FILES}.`);
  if (files.reduce((bytes, file) => bytes + file.size, 0) > MAX_REFERENCE_BYTES) throw new Draft2InputError(`${slide.label}'s reference images exceed 20 MB.`);
  assertCreativeImageModelSupports(ctx.descriptor, { referenceCount: files.length, expectsText: !program && Boolean(built.expectedText.trim()) });
  return {
    // The review reads the finished slide: the words the program set on it, or the ones the model lettered.
    prompt, expectedText: program ? creativeImageModelVisibleText(unit) : built.expectedText, files,
    endpoint: creativeImageEndpoint(ctx.descriptor, files.length ? "reference-guided" : "text-to-image"),
    ...(placeFile && placeEntry ? { placePhoto: placeEntry.name } : {}),
  };
}

/** The anchor plate as stored, checked against its record; one that cannot be read leaves the slide to the script's words, with a note. */
async function anchorPlateFile(ctx: Context, slide: Draft2SlideImage): Promise<File | undefined> {
  const plate = ctx.run.anchorPlate;
  try {
    const file = await readPrivateR2ImageFile({ objectKey: objectKey(ctx, ANCHOR_PLATE_FILE), contentType: "image/png", fileName: ANCHOR_PLATE_FILE });
    if (hash(new Uint8Array(await file.arrayBuffer())) !== plate?.sha256) throw new Draft2InputError("The anchor plate does not match its record.");
    return file;
  } catch {
    note(slide, "The anchor plate could not be read, so this slide keeps the anchor by the script's words alone.");
    return undefined;
  }
}

/** How a slide's prompt names the plate among its reference images. */
const anchorReferencePrompt = (ctx: Context, position: number) =>
  `\n\nANCHOR REFERENCE\nInput image ${position} is ${ctx.narrative.anchor}, the ${anchorNoun(ctx.narrative)} that is on every slide of this carousel. Show it in this slide's scene exactly as it looks there: the same shape, colors, proportions and details. Take only that element from it, nothing else.\nEND ANCHOR REFERENCE`;

/** What the image model reads to draw the anchor plate: the anchor alone, as the visual script casts it, in the brand's identity, without a word. */
function anchorPlatePrompt(ctx: Context, plate: Draft2AnchorPlate): string {
  return [
    "ANCHOR PLATE",
    `One reference image of ${plate.anchor}, the ${anchorNoun(ctx.narrative)} that is on every slide of this carousel, so every slide can show it the same way.`,
    `How the visual script casts it: ${ctx.script.cast}`,
    "Show it alone and whole, as that cast describes it, centered on a plain, uncluttered background in the brand's visual identity below, evenly lit, so its shape, colors and proportions read clearly. Nothing and nobody else in the image.",
    "No words, letters, numbers, logos, signs, frames or interface of any kind.",
    `# The brand's visual identity\n${resolveCreativeVisualGuidance(ctx.profile)}`,
  ].join("\n\n").slice(0, MAX_CREATIVE_IMAGE_PROMPT_CHARACTERS);
}

/**
 * A plate drawn before the slides: the anchor plate (4:5, like a slide) or
 * the master scene (wide). Each is sent, polled, stored and charged once, as
 * a slide's attempt is.
 */
type PlateJob = {
  plate: Draft2AnchorPlate;
  file: string;
  promptFile: string;
  operation: "draft2_anchor_plate" | "draft2_master_scene";
  /** What fal draws, and what the image is normalized to. */
  size: { width: number; height: number; aspectRatio: "4:5" | "16:9" };
  target: { width: number; height: number };
  prompt: () => string;
};

const anchorJob = (ctx: Context, plate: Draft2AnchorPlate): PlateJob => ({
  plate, file: ANCHOR_PLATE_FILE, promptFile: ANCHOR_PLATE_PROMPT_FILE, operation: "draft2_anchor_plate",
  size: { width: ctx.fal.generationWidth, height: ctx.fal.generationHeight, aspectRatio: "4:5" }, target: OUTPUT, prompt: () => anchorPlatePrompt(ctx, plate),
});
const masterJob = (ctx: Context, plate: Draft2MasterPlate): PlateJob => ({
  plate, file: masterPlateFile(plate.version), promptFile: masterPlatePromptFile(plate.version), operation: "draft2_master_scene",
  size: { width: plate.width, height: plate.height, aspectRatio: "16:9" }, target: { width: plate.width, height: plate.height }, prompt: () => masterScenePrompt(ctx, plate),
});

/**
 * What the image model reads to draw the master scene: the whole carousel as
 * one wide image without a word, read left to right, one section per slide
 * (the script's subject and beat for each), the line through all of them.
 */
function masterScenePrompt(ctx: Context, plate: Draft2MasterPlate): string {
  if (ctx.presentation.images === "panorama") return panoramaScenePrompt(ctx, plate);
  const first = plate.sections[0];
  const band = first && first.height < plate.height ? ` Keep the top and the bottom quiet: the story runs along the middle band, about ${Math.round((first.height / plate.height) * 100)}% of the height.` : "";
  const sections = ctx.carousel.map((words, index) => {
    const scriptSlide = ctx.script.slides.find((entry) => entry.slide === words.slide);
    return `${index + 1}. ${words.label}: ${scriptSlide?.subject || scriptSlide?.beat || ""}${scriptSlide?.subject && scriptSlide.beat ? ` (${scriptSlide.beat})` : ""}`;
  });
  return [
    "MASTER SCENE",
    `One wide image: the whole world of a ${plate.sections.length}-slide carousel, read from left to right. It is cut into ${plate.sections.length} portrait sections of equal width side by side, one per slide, and each section is then redrawn as its slide, so nothing that matters is cut in half at a section's edge.`,
    ctx.narrative.form === "follow-the-line"
      ? `One continuous line runs through the whole image from the left edge to the right edge: ${plate.anchor}. It enters every section from the left and leaves it to the right, so each slide picks it up where the last one left it.`
      : `The scene: ${plate.anchor}.`,
    `From left to right, one section per slide:\n${sections.join("\n")}`,
    `How the visual script casts it: ${ctx.script.cast}`,
    `One light, one horizon and one scale across the whole width.${band}`,
    "No words, letters, numbers, logos, signs, frames or interface of any kind.",
    `# The brand's visual identity\n${resolveCreativeVisualGuidance(ctx.profile)}`,
  ].join("\n\n").slice(0, MAX_CREATIVE_IMAGE_PROMPT_CHARACTERS);
}

/** What the device makes of left to right, for the scene's prompt. */
const PANORAMA_DEVICE_LINE: Record<Draft2PanoramaDevice, string> = {
  journey: "The scene is one continuous place the eye travels through from left to right; each column is the next stretch of it.",
  "time-lapse": "The stages of one process sit side by side along the same surface, in order, the earliest at the left: one place and one moment, the stages laid out as the surface would hold them.",
  mechanism: "One cause unfolds from left to right: what starts it at the left, what it does through the middle, what it leaves at the right.",
  comparison: "The two ends differ, and the middle is the change between them, step by step.",
};
/** How much of its column a station's subject spans, by its size. */
const PANORAMA_SIZE_SHARE: Record<Draft2PanoramaStationSize, number> = { large: 60, medium: 40, small: 25 };
/** How close to a cut line a face, a hand, a character or a key object may come, as a share of a column's width. */
const PANORAMA_CUT_MARGIN = 8;

/**
 * What the image model reads to draw a panorama (the editor's choice in the
 * focus): the whole carousel as one continuous scene without a word, cut
 * into equal columns and used as it is, so the scene runs on across every
 * swipe. Since 2026-10-18 it is written with a grammar the first two scenes
 * lacked (they came out as slides glued together, with colour stripes at the
 * cuts and the subjects in a thin strip): the scene the spine designed (its
 * world, axis, field, carrier and ending), the field as one surface across
 * the whole width down to a stated height, one ground line, the cut lines
 * named, each station's size as a share of its column, and a margin from the
 * cuts for every face, hand, character and key object. A spine written
 * before the scene falls back to the script's concept and directions.
 */
function panoramaScenePrompt(ctx: Context, plate: Draft2MasterPlate): string {
  const count = plate.sections.length;
  const first = plate.sections[0];
  const scene = ctx.panorama;
  const sectionTop = first?.top ?? 0;
  const sectionHeight = first?.height ?? plate.height;
  const share = (y: number) => Math.round((y / plate.height) * 100);
  // The words' band is the top of every section (textBandFor): in the scene, the field reaches from the top down to this height, and the ground line sits a little below it.
  const wordsBand = textBandFor({});
  const fieldBottom = share(sectionTop + ((wordsBand.top + wordsBand.height) / OUTPUT.height) * sectionHeight);
  const groundLine = share(sectionTop + 0.62 * sectionHeight);
  const cuts = Array.from({ length: Math.max(0, count - 1) }, (_, index) => `${Math.round(((index + 1) / count) * 100)}%`).join(", ");
  const names = (ids: readonly string[]) => ids.map((id) => ctx.characters.get(id)?.name ?? "the brand's character").join(" and ");
  const stations = ctx.carousel.map((words, index) => {
    const scriptSlide = ctx.script.slides.find((entry) => entry.slide === words.slide);
    const station = scene?.stations[index];
    const size = station ? ` (${station.size}: its subject spans about ${PANORAMA_SIZE_SHARE[station.size]}% of the column's width)` : "";
    const subject = scriptSlide?.subject || scriptSlide?.beat || "";
    const cast = scriptSlide?.characterIds.length
      ? ` ${names(scriptSlide.characterIds)}, full body, stands in this column at the scale of its subject, touching no cut line.`
      : station?.character ? " The brand's character stands in this column, full body, at the scale of its subject, touching no cut line." : "";
    const crossing = station?.crossing && index < count - 1 ? ` Into column ${index + 2}: ${station.crossing}.` : "";
    return `${index + 1}. ${words.label}${size}: ${subject}.${scriptSlide?.direction ? ` ${scriptSlide.direction}` : ""}${cast}${crossing}`;
  });
  const strips = first && first.height < plate.height ? ` The strips above and below the columns' band (the top ${share(sectionTop)}% and the bottom ${100 - share(sectionTop + sectionHeight)}% of the height) are outside every slide: continue the field above them and the surface below them, and place nothing there.` : "";
  const carrier = scene?.carrier ?? "the surface the subjects stand on";
  return [
    "PANORAMA",
    `One wide image: the whole ${count}-slide carousel as one continuous scene, read from left to right: ${scene?.world ?? ctx.script.concept}. It is cut into ${count} equal portrait columns side by side (the cut lines at ${cuts} of the width), and each column becomes its slide exactly as it is: the reader swipes from one column into the next. One place, one point of view, one light and one scale from end to end: never ${count} pictures, never a frame, a border or a divider, never a change of colour or background at a cut.`,
    scene
      ? `THE AXIS. ${PANORAMA_DEVICE_LINE[scene.device]} From left to right: ${scene.axis}. ${scene.ending === "returns" ? "The right end echoes the left end's frame, so the carousel closes where it opened." : "The right end resolves the story."}`
      : "THE AXIS. The story advances from the left end to the right end, one step per column.",
    `THE FIELD. From the top of the scene down to ${fieldBottom}% of its height, across the whole width, is ${scene?.field ?? "one plain surface of the palette (a wall, the sky, a flat field)"}: one flat colour, with nothing drawn in it, since the slides' words are set there afterwards. Every subject stands below it.`,
    `THE GROUND. One straight ground line (${carrier}) runs across the whole width at about ${groundLine}% of the height and through every cut without a break; the subjects stand on it or just below it, in the lower part of their columns.${strips}`,
    `THE STATIONS, one per column, left to right:\n${stations.join("\n")}`,
    `Sizes: a large station's subject spans about ${PANORAMA_SIZE_SHARE.large}% of its column's width, a medium one about ${PANORAMA_SIZE_SHARE.medium}%, a small one about ${PANORAMA_SIZE_SHARE.small}%; the large one is the scene's strongest point. Every face, hand, character and key object stays inside its column, at least ${PANORAMA_CUT_MARGIN}% of the column's width from each cut line; only the ground, the field and ${scene?.carrier ? "the carrier" : "the surface"} cross the cuts.`,
    `The visual script's concept: ${ctx.script.concept}`,
    `How the visual script casts it: ${ctx.script.cast}`,
    ...(plate.instruction ? [`What the editor asks to change from the scene made before: ${JSON.stringify(plate.instruction)}`] : []),
    "No words, letters, numbers, logos, signs, frames or interface of any kind.",
    `# The brand's visual identity\n${resolveCreativeVisualGuidance(ctx.profile)}`,
  ].join("\n\n").slice(0, MAX_CREATIVE_IMAGE_PROMPT_CHARACTERS);
}

/** How a slide's prompt names its section of the master scene, given last. */
const masterSectionPrompt = (ctx: Context) =>
  `\n\nMASTER SECTION\nThe LAST input image is this slide's section of the carousel's one wide scene${ctx.narrative.form === "follow-the-line" ? `, with the line (${ctx.narrative.anchor}) entering at its left edge and leaving at its right edge` : ""}. Keep its composition, horizon, light and colors, and keep everything that touches its left and right edges where it is, so this slide continues the slides beside it. Redraw it in full detail as this slide, ${ctx.presentation.text === "program" ? "without any words" : "with the slide's words where the layout reserves them"}.\nEND MASTER SECTION`;

/** A slide's section of the master scene, cut and sized as the slide is drawn; one that cannot be read leaves the slide to be drawn on its own, with a note. */
async function masterSectionFile(ctx: Context, slide: Draft2SlideImage): Promise<File | undefined> {
  const plate = ctx.run.masterPlate;
  const section = plate?.sections.find((entry) => entry.slide === slide.slide);
  ctx.master ??= readPrivateR2ImageFile({ objectKey: objectKey(ctx, masterPlateFile(plate?.version)), contentType: "image/png", fileName: masterPlateFile(plate?.version) })
    .then(async (file) => { const bytes = new Uint8Array(await file.arrayBuffer()); return hash(bytes) === plate?.sha256 ? bytes : undefined; })
    .catch(() => undefined);
  const master = await ctx.master;
  if (!section || !master) {
    note(slide, "The master scene could not be read, so this slide is drawn on its own from the script.");
    return undefined;
  }
  try {
    const png = await sharp(master).extract({ left: section.left, top: section.top, width: section.width, height: section.height })
      .resize(ctx.fal.generationWidth, ctx.fal.generationHeight, { fit: "fill" }).png().toBuffer();
    return new File([new Uint8Array(png)], `master-section-${slide.slide}.png`, { type: "image/png" });
  } catch {
    note(slide, "The master scene could not be cut for this slide, so it is drawn on its own from the script.");
    return undefined;
  }
}

/** Sends a plate as an attempt is sent: the prompt stored first, marked submitting before fal is called, never sent twice. */
async function submitPlate(ctx: Context, job: PlateJob, checkpoint: () => Promise<unknown>): Promise<void> {
  const { plate } = job;
  try {
    const prompt = job.prompt();
    const endpoint = creativeImageEndpoint(ctx.descriptor, "text-to-image");
    await putPrivateR2Object({ objectKey: objectKey(ctx, job.promptFile), body: Buffer.from(prompt, "utf8"), contentType: "text/plain; charset=utf-8" });
    // The scene is drawn once for every slide: a tier above the slides' quality (the anchor plate is a reference, drawn at theirs).
    const quality = job.operation === "draft2_master_scene" ? sceneQuality() : IMAGES_QUALITY;
    Object.assign(plate, { status: "submitting", endpoint, quality, promptCharacters: prompt.length, submittedAt: new Date().toISOString() } satisfies Partial<Draft2AnchorPlate>);
    await checkpoint();
    draft2DevTrace({ step: "images", round: 0, provider: "fal", model: endpoint, operation: job.operation, phase: "request", detail: { anchor: plate.anchor, size: job.size, quality, promptCharacters: prompt.length } });
    const send = () => submitFalImage({
      apiKey: ctx.fal.apiKey, prompt, width: job.size.width, height: job.size.height, aspectRatio: job.size.aspectRatio,
      imageQuality: quality, model: ctx.descriptor, endpoint, referenceImages: [], retention: "30d",
    });
    let requestId: string;
    try {
      requestId = await send();
    } catch (error) {
      if (!isTransientFalSubmitError(error)) throw error;
      await sleep(3_000);
      requestId = await send();
    }
    Object.assign(plate, { status: "generating", requestId } satisfies Partial<Draft2AnchorPlate>);
  } catch (error) {
    Object.assign(plate, { status: "failed", error: message(error), completedAt: new Date().toISOString() } satisfies Partial<Draft2AnchorPlate>);
  }
  await checkpoint();
}

/** Asks fal for a plate; once done, it is stored as it came (no logo, no page number) and charged once. */
async function pollPlate(ctx: Context, job: PlateJob, errors: Map<Draft2AnchorPlate, number>, checkpoint: () => Promise<unknown>): Promise<void> {
  const { plate } = job;
  try {
    let raw: Uint8Array | undefined;
    const result = await pollFalImage({
      apiKey: ctx.fal.apiKey, requestId: plate.requestId!, endpoint: plate.endpoint!, targetWidth: job.target.width, targetHeight: job.target.height, retention: "30d",
      postProcess: async ({ normalizedPng }) => { raw = normalizedPng; return normalizedPng; },
    });
    if (result.status !== "generated") return;
    if (!raw) throw new Draft2InputError("The plate came back empty.");
    const sha256 = hash(raw);
    await putPrivateR2Object({ objectKey: objectKey(ctx, job.file), body: raw, contentType: "image/png", metadata: { sha256 } });
    const quality = (plate.quality as CreativeImageQuality | undefined) ?? IMAGES_QUALITY;
    const estimate = estimateFalImageCost({ endpoint: plate.endpoint!, quality, width: job.target.width, height: job.target.height, promptCharacters: plate.promptCharacters ?? 0, referenceImages: 0 });
    await recordUsageCharge({
      topicId: ctx.topicId, storyId: ctx.storyId, kind: "image", provider: "fal", model: plate.endpoint!, operation: job.operation,
      units: { images: 1, width: job.target.width, height: job.target.height, quality, referenceImages: 0, promptCharacters: plate.promptCharacters ?? 0 },
      costMicros: estimate?.costMicros ?? null, estimated: true, rate: estimate?.rate ?? { unpriced: true },
      idempotencyKey: `${job.operation === "draft2_master_scene" ? "draft2-master-scene" : "draft2-anchor-plate"}:${ctx.run.runId}${job.operation === "draft2_master_scene" && ((plate as Draft2MasterPlate).version ?? 1) > 1 ? `:v${(plate as Draft2MasterPlate).version}` : ""}`,
    });
    Object.assign(plate, { status: "generated", sha256, completedAt: new Date().toISOString(), ...(estimate ? { costMicros: estimate.costMicros } : {}) } satisfies Partial<Draft2AnchorPlate>);
  } catch (error) {
    const count = (errors.get(plate) ?? 0) + 1;
    errors.set(plate, count);
    if (count < POLL_ATTEMPTS) return;
    Object.assign(plate, { status: "failed", error: message(error), completedAt: new Date().toISOString() } satisfies Partial<Draft2AnchorPlate>);
  }
  await checkpoint();
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

/**
 * The layout and window of the real photo an attempt is made with: an edit
 * or a correction keeps its base image's (its zone is already drawn), a
 * fresh image takes the photo's fit, and an image made before the fit keeps
 * the slide's rotation.
 */
function attemptPortrait(slide: Draft2SlideImage, attempt: Draft2ImageAttempt, pasted: Extract<Draft2SlideMaterial, { kind: "pasted-photo" }>): PortraitFit {
  if (attempt.portrait) return attempt.portrait;
  if (attempt.baseVersion !== undefined) return slide.attempts.find((entry) => entry.version === attempt.baseVersion)?.portrait ?? { layout: portraitLayoutForSlide(slide.order) };
  return pasted.portrait ? { layout: pasted.portrait.layout, ...(pasted.portrait.crop ? { crop: pasted.portrait.crop } : {}) } : { layout: portraitLayoutForSlide(slide.order) };
}

/** v1's post-production, in v1's order: the pasted photo, the map panel, the page number, the logo (the version that reads best there). */
async function finish(ctx: Context, slide: Draft2SlideImage, attempt: Draft2ImageAttempt, image: Uint8Array): Promise<Uint8Array> {
  let out: Uint8Array = image;
  // The editor's own photo is the whole slide: no portrait or map is pasted on it, and the program sets its words whatever the presentation.
  const whole = attempt.own?.fill === "slide";
  const pasted = whole ? undefined : slide.material.find(isPasted);
  if (pasted?.sha256) {
    const photo = await loadDocumentaryPortraitPhoto(pasted.storyPhotoId, pasted.sha256);
    // The window chosen on the person before the image was made; one made before that crops around the editor's focal point, or on its own.
    const fit = attemptPortrait(slide, attempt, pasted);
    const focus = fit.crop ? undefined : await currentPortraitFocus(ctx.topicId, ctx.storyId, pasted.storyPhotoId, pasted.sha256);
    out = await compositeDocumentaryPortrait({
      image: out, photo, layout: fit.layout, accent: portraitAccent(ctx.profile.brandPalette ?? [], slide.order),
      ...(fit.crop ? { crop: fit.crop } : focus ? { focus } : {}),
    });
  }
  const panel = whole ? undefined : slide.material.find(isMap)?.panel;
  if (panel) {
    const file = await readPrivateR2ImageFile({ objectKey: objectKey(ctx, mapFile(slide.slide)), contentType: "image/png", fileName: mapFile(slide.slide) });
    const map = new Uint8Array(await file.arrayBuffer());
    if (hash(map) !== panel.sha256) throw new Draft2InputError(`The map of ${slide.label} changed since it was fetched; make the slide again.`);
    const color = mapPaletteFromBrand(ctx.profile.brandPalette ?? [])?.primary;
    out = await compositeMapPanel({ image: out, map, matColor: color ?? "#1f2933", layout: panel.layout, ...(panel.position ? { position: panel.position } : {}), ...(panel.label ? { label: panel.label } : {}), ...(color ? { ink: color } : {}) });
  }
  // The program's words, before the page number and the logo, in the band the prompt kept calm.
  if (ctx.presentation.text === "program" || attempt.own) {
    const words = wordsFor(ctx, slide);
    // A layout the attempt already carries (the editor's, or the one its words are set again with) is kept; otherwise the program chooses one.
    // A kept layout whose marked data no longer keeps the slide's words (they changed) marks them again.
    if (attempt.wordsLayout) {
      attempt.wordsLayout = remarkData(attempt.wordsLayout, words, ctx.wordsPlaces);
      out = await drawWords({ image: out, words, layout: attempt.wordsLayout });
    }
    else {
      const set = await setSlideWords({ image: out, words, band: textBandOf(ctx, slide, attempt), palette: ctx.wordsPalette, style: ctx.wordsStyle, places: ctx.wordsPlaces, cover: slide.order === 1 });
      out = set.image;
      attempt.wordsLayout = set.layout;
    }
    attempt.words = words;
  }
  const chrome = chromeFor(ctx, slide.order);
  if (chrome.overlay) out = await compositeCreativeCarouselChrome({ image: out, chrome });
  if (ctx.brandSnapshot && logoApplies(ctx, slide.order)) {
    const logo = await compositeStoredCreativeBrandVersion({ image: out, snapshot: ctx.brandSnapshot, order: slide.order, logos: ctx.logos });
    out = logo.body;
    attempt.logo = { form: logo.version.form, tone: logo.version.tone, assetId: logo.version.assetId };
  }
  return out;
}

/**
 * A panorama's slide: its section of the one wide scene, brought to the
 * slide's size and finished as any slide (the program's words, the page
 * number, the logo). No model is called; the scene was charged once.
 */
async function cutSection(ctx: Context, slide: Draft2SlideImage, attempt: Draft2ImageAttempt, finished: Map<Draft2ImageAttempt, Uint8Array>, checkpoint: () => Promise<unknown>): Promise<void> {
  try {
    const section = await masterSectionFile(ctx, slide);
    if (!section) throw new Draft2InputError("The panorama's section could not be cut.");
    const raw = new Uint8Array(await sharp(Buffer.from(await section.arrayBuffer())).resize(OUTPUT.width, OUTPUT.height, { fit: "fill", kernel: "lanczos3" }).png().toBuffer());
    const final = await finish(ctx, slide, attempt, raw);
    const sha256 = hash(final);
    await putPrivateR2Object({ objectKey: objectKey(ctx, imageFile(slide.slide, attempt.version)), body: final, contentType: "image/png", metadata: { sha256 } });
    await putPrivateR2Object({ objectKey: objectKey(ctx, imageBaseFile(slide.slide, attempt.version)), body: raw, contentType: "image/png", metadata: { sha256: hash(raw) } });
    const own = ctx.run.masterPlate?.own;
    Object.assign(attempt, { status: "generated", sha256, expectedText: creativeImageModelVisibleText(ctx.units[slide.order - 1]), costMicros: 0, completedAt: new Date().toISOString(), ...(own ? { own: { ...own, fill: "scene" as const } } : {}) } satisfies Partial<Draft2ImageAttempt>);
    finished.set(attempt, final);
  } catch (error) {
    Object.assign(attempt, { status: "failed", error: message(error), completedAt: new Date().toISOString() } satisfies Partial<Draft2ImageAttempt>);
  }
  await checkpoint();
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
      postProcess: async ({ normalizedPng }) => { raw = normalizedPng; final = await finish(ctx, slide, attempt, normalizedPng); return final; },
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
    ...(pasted ? { verifiedPhoto: { personName: pasted.name, region: portraitPhotoRegion(attempt.portrait?.layout ?? portraitLayoutForSlide(slide.order)) } } : {}),
    ...(panel ? { verifiedMap: { provider: panel.provider, region: mapPanelRegion(panel.layout, panel.position) } } : {}),
    ...(attempt.placePhoto ? { verifiedPlacePhoto: { placeName: attempt.placePhoto } } : {}),
    characters: slide.characterIds.flatMap((id) => { const character = ctx.characters.get(id); return character ? [{ name: character.name, description: character.description }] : []; }),
    facts: slideFacts(ctx.units[slide.order - 1].factIds, ctx.facts),
    ...(identity?.avoid.length ? { brand: { avoid: identity.avoid.map((group) => `${group.category}: ${group.items.join("; ")}`), allowed: identity.allowed, acceptance: identity.acceptance } } : {}),
  };
  const scriptSlide = ctx.script.slides.find((entry) => entry.slide === slide.slide);
  // A narrative form's anchor is on every slide that carries one: Sol says whether this image shows it.
  const anchor = ctx.narrative.form !== "classic" && ctx.narrative.anchorKind !== "scene" && ctx.narrative.anchor && slideCarriesAnchor(slide) ? ctx.narrative.anchor : undefined;
  const { instructions, skillVersions } = composeInstructions("image-judge", [IMAGES_SKILL], brandBrief(ctx.profile));
  const contents = {
    ...JSON.parse(buildImageReviewText(input)) as Record<string, unknown>,
    slide: { label: slide.label, need: slide.need, beat: scriptSlide?.beat ?? "", headlineLink: scriptSlide?.headlineLink ?? "" },
    addedAfterwards: { logo: logoApplies(ctx, slide.order), pageNumber: chromeFor(ctx, slide.order).overlay ? `${slide.order}/${ctx.carousel.length}` : null },
    ...(anchor ? { anchor: { what: anchor, role: anchorNoun(ctx.narrative), note: "It is on every slide of this carousel: say in anchorShown whether this image shows it as described." } } : {}),
    // A panorama's section: its field, its surface and its light are the scene's, shared with the slides beside it, never a background chosen for this slide.
    ...(attempt.kind === "section" ? { panoramaSection: { note: `This slide is one section of one wide scene cut into ${ctx.run.slides.length} slides: the plain band along its top (${ctx.panorama?.field ?? "the scene's field"}), its surface and its light are the scene's and continue into the slides beside it, so they are never a background chosen for this slide. Judge this section's own subject and words.` } } : {}),
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
    attempt.review = draft2ImageReview(parseDraft2ImageReview(answered.text), { ...input, expectedText: attempt.expectedText ?? "", ...(anchor ? { anchor } : {}) }, { model, at, durationMs });
  } catch (error) {
    const durationMs = Date.now() - begin;
    ctx.trace.push({ at, step: "images", round: attempt.version, provider: "openai", model, operation: "draft2_image_review", durationMs, outcome: "error", note: `${slide.label}: ${message(error)}`, ...failedCall(error), skillVersions });
    attempt.review = { status: "unavailable", issues: [], note: `${draft2ModelName(model, "openai")} could not review this image (${message(error)}); look at it yourself.`, transcription: "", model, at, durationMs };
  }
}

/**
 * Where the person is on one real photo: the editor's focal point when they
 * set one, else Luna's look at it (once; the photo is only looked at, never
 * edited or sent to the image model). A photo Luna cannot read is left to
 * the composite's automatic crop, with a note on the slide.
 */
async function locatePortrait(ctx: Context, pasted: Extract<Draft2SlideMaterial, { kind: "pasted-photo" }>): Promise<{ size: { width: number; height: number }; subject: PortraitSubject; source: Draft2PortraitFit["source"] }> {
  const bytes = await loadDocumentaryPortraitPhoto(pasted.storyPhotoId, pasted.sha256!);
  const meta = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
  // The composite turns the photo by its EXIF orientation first; the sizes are the turned photo's.
  const turned = (meta.orientation ?? 1) >= 5;
  const size = { width: (turned ? meta.height : meta.width) ?? 0, height: (turned ? meta.width : meta.height) ?? 0 };
  const focus = await currentPortraitFocus(ctx.topicId, ctx.storyId, pasted.storyPhotoId, pasted.sha256!);
  if (focus) return { size, subject: focusSubject(focus), source: "editor" };
  if (!size.width || !size.height) return { size, subject: {}, source: "automatic" };
  const model = draft2PortraitModel(process.env);
  const at = new Date().toISOString();
  const begin = Date.now();
  try {
    const preview = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    const answered = await generateOpenAiStructuredResponse({
      apiKey: process.env.OPENAI_API_KEY?.trim() ?? "", model, instructions: PORTRAIT_LOCATOR_INSTRUCTIONS, contents: { person: pasted.name },
      images: [`data:image/jpeg;base64,${preview.toString("base64")}`], schema: DRAFT2_PORTRAIT_SUBJECT_SCHEMA, schemaName: "draft2_portrait_subject",
      maxOutputTokens: PORTRAIT_MAX_OUTPUT_TOKENS, reasoningEffort: "low", timeoutMs: PORTRAIT_TIMEOUT_MS,
      auditContext: { runId: ctx.sessionId, topicId: ctx.topicId, storyId: ctx.storyId },
    });
    const subject = parsePortraitSubject(answered.text);
    ctx.trace.push({ at, step: "images", round: 1, provider: "openai", model, operation: "draft2_portrait_subject", durationMs: Date.now() - begin, usage: answered.usage, cachedInputTokens: answered.cachedInputTokens, answerCharacters: answered.text.length, outcome: "ok", note: pasted.name, effort: "low", ...traceCost("openai", model, answered.usage, answered.cachedInputTokens) });
    return { size, subject, source: "ai" };
  } catch (error) {
    ctx.trace.push({ at, step: "images", round: 1, provider: "openai", model, operation: "draft2_portrait_subject", durationMs: Date.now() - begin, outcome: "error", note: `${pasted.name}: ${message(error)}`, ...failedCall(error) });
    return { size, subject: {}, source: "automatic" };
  }
}

/**
 * Each real photo is looked at once before its slide is made, and takes the
 * layout that shows the person whole at the size the photo holds
 * (fitPortrait), the layout of the photo slide before it only breaking
 * ties. The image model then designs around that layout's zone, and the
 * composite shows the same window. A slide already sent keeps the layout it
 * was made with (its corrections edit that image).
 */
async function preparePortraits(ctx: Context, checkpoint: () => Promise<unknown>): Promise<void> {
  const ordered = [...ctx.run.slides].sort((a, b) => a.order - b.order);
  // A fresh image waiting to go out (the first, or one made again without an edit) of a photo not fitted yet.
  const waiting = ordered.filter((slide) => {
    const pasted = slide.material.find(isPasted);
    const latest = latestAttempt(slide);
    return pasted && !pasted.portrait && latest?.status === "queued" && latest.baseVersion === undefined;
  });
  if (!waiting.length) return;
  const located = new Map<string, ReturnType<typeof locatePortrait>>();
  for (const slide of waiting) {
    const pasted = slide.material.find(isPasted)!;
    if (!pasted.sha256) {
      const [reference] = await resolveStoryReferences(ctx.topicId, ctx.storyId, [{ id: pasted.storyPhotoId, purpose: "documentary-portrait" }]);
      pasted.sha256 = reference.sha256;
    }
    const key = `${pasted.storyPhotoId}:${pasted.sha256}`;
    if (!located.has(key)) located.set(key, locatePortrait(ctx, pasted));
  }
  let previous: string | undefined;
  for (const slide of ordered) {
    const pasted = slide.material.find(isPasted);
    if (!pasted) continue;
    if (!pasted.portrait && waiting.includes(slide)) {
      const { size, subject, source } = await located.get(`${pasted.storyPhotoId}:${pasted.sha256}`)!;
      pasted.portrait = { ...fitPortrait(size, subject, { avoid: previous ? [previous] : [], order: slide.order }), source, ...subject };
      if (source === "automatic") note(slide, `${pasted.name} could not be located on the photo, so its crop is automatic: check that nothing of them is cut.`);
    }
    previous = pasted.portrait?.layout ?? portraitLayoutForSlide(slide.order);
  }
  await checkpoint();
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
    budget: getBrandReferenceSelectionBudget(), generativeImageryAllowed: true,
    characterImageCountByOrder: new Map(run.slides.map((slide) => [slide.order, slide.characterIds.length + (run.anchorPlate && slideCarriesAnchor(slide) ? 1 : 0) + (run.masterPlate ? 1 : 0)])),
  });
  // The two v1 rows its prompt builder reads, held in memory: only the fields it reads (build-creative-image-prompt.ts).
  const draft = { format: "carousel", outputAspectRatio: "4:5", concept: storyConcept(target.script), units } as unknown as CreativeDraft;
  const brief = {
    profileSnapshot: profile, tone: toneFor(target.visual.focus?.values, profile),
    keyFacts: facts.map((fact) => ({ id: fact.id, statement: fact.claim, sourceExcerpt: fact.evidence })),
  } as unknown as CreativeBrief;
  return {
    topicId, storyId, sessionId, run, script: target.script, carousel: target.carousel, inventory: target.inventory, facts, profile,
    ...(overlay ? { overlay } : {}), ...(snapshot ? { brandSnapshot: snapshot } : {}), logos: new Map(), characters, brandSelections, units, draft, brief, fal, descriptor,
    ...(googleConfig() ? { google: googleConfig() } : {}), signal, trace, narrative: visualNarrative(target.visual),
    presentation: run.presentation ?? focusPresentation(undefined), wordsPalette: wordsPalette(profile.brandPalette), wordsStyle: profile.wordsStyle ?? DEFAULT_WORDS_STYLE,
    wordsPlaces: storyPlaces(target.inventory?.entities ?? [], profile.region),
    ...(target.visual.focus?.values?.spine?.panorama ? { panorama: target.visual.focus.values.spine.panorama } : {}),
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
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Draft2InputError(`OPENAI_API_KEY is not configured; ${draft2ModelName(draft2SolModel(process.env), "openai")} reviews the images.`);
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
      const plateErrors = new Map<Draft2AnchorPlate, number>();
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
        // The plates go first (the anchor plate, the master scene): the slides that use them wait for them.
        const jobs = [run.anchorPlate && anchorJob(ctx, run.anchorPlate), run.masterPlate && masterJob(ctx, run.masterPlate)]
          .filter((job): job is PlateJob => Boolean(job) && !anchorPlateSettled((job as PlateJob).plate));
        if (jobs.length) {
          await Promise.all(jobs.map(async (job) => {
            const { plate } = job;
            if (plate.status === "submitting" && !plate.requestId && Date.now() - Date.parse(plate.submittedAt ?? plate.queuedAt) > IMAGE_SUBMISSION_GRACE_MS) {
              Object.assign(plate, { status: "failed", error: "Its request was lost while it was being sent.", completedAt: new Date().toISOString() } satisfies Partial<Draft2AnchorPlate>);
              await checkpoint();
            } else if (plate.status === "queued") await submitPlate(ctx, job, checkpoint);
            else if (plate.status === "generating" && plate.requestId) await pollPlate(ctx, job, plateErrors, checkpoint);
          }));
          if (jobs.some((job) => !anchorPlateSettled(job.plate))) { await sleep(POLL_INTERVAL_MS); continue; }
          if (run.anchorPlate?.status === "failed") for (const slide of run.slides) if (slideCarriesAnchor(slide)) note(slide, "The anchor plate could not be made, so this slide keeps the anchor by the script's words alone.");
          const before = run.masterPlate && sceneBefore(run.masterPlate);
          if (run.masterPlate && before) {
            // The editor's scene made again failed: the slides keep the scene before and the versions they showed; none is drawn on its own.
            const failed = run.masterPlate;
            run.masterPlate = before;
            for (const slide of run.slides) {
              const attempt = latestAttempt(slide);
              if (attempt?.kind !== "section" || attempt.status !== "queued") continue;
              Object.assign(attempt, { status: "failed", error: `Scene v${failed.version ?? 1} could not be made, so the slide keeps scene v${before.version ?? 1}${failed.error ? `: ${failed.error}` : "."}`, completedAt: new Date().toISOString() } satisfies Partial<Draft2ImageAttempt>);
              if (attempt.replacesVersion !== undefined) slide.chosenVersion = attempt.replacesVersion;
            }
          } else if (run.masterPlate?.status === "failed") for (const slide of run.slides) note(slide, "The master scene could not be made, so this slide is drawn on its own from the script.");
          await checkpoint();
        }
        // Each real photo is looked at, and given its layout, before its slide goes out.
        await preparePortraits(ctx, checkpoint);
        // A panorama's sections are cut from its scene; a scene that failed leaves each slide to be drawn on its own.
        const sections = latest.filter(({ attempt }) => attempt.kind === "section" && attempt.status === "queued");
        if (sections.length && run.masterPlate?.status === "generated") await inBatches(sections, IMAGE_SUBMIT_CONCURRENCY, ({ slide, attempt }) => cutSection(ctx, slide, attempt, finished, checkpoint));
        else for (const { attempt } of sections) attempt.kind = "generate";
        await inBatches(latest.filter(({ attempt }) => attempt.status === "queued" && attempt.kind !== "section"), IMAGE_SUBMIT_CONCURRENCY, ({ slide, attempt }) => submitAttempt(ctx, slide, attempt, checkpoint));
        await inBatches(latest.filter(({ attempt }) => attempt.status === "generating" && attempt.requestId), IMAGE_SUBMIT_CONCURRENCY, ({ slide, attempt }) => pollAttempt(ctx, slide, attempt, finished, pollErrors, checkpoint));
        const toReview = run.slides.flatMap((slide) => { const attempt = latestAttempt(slide); return attempt && awaitsReview(attempt) ? [{ slide, attempt }] : []; });
        if (toReview.length && REQUEST_DEADLINE_MS - elapsed() < REVIEW_TIMEOUT_MS + 10_000) return pause();
        await inBatches(toReview, REVIEW_CONCURRENCY, async ({ slide, attempt }) => {
          const image = finished.get(attempt) ?? new Uint8Array(await (await readPrivateR2ImageFile({ objectKey: objectKey(ctx, imageFile(slide.slide, attempt.version)), contentType: "image/png", fileName: imageFile(slide.slide, attempt.version) })).arrayBuffer());
          await reviewAttempt(ctx, slide, attempt, image);
          // A first image the review flags is corrected once, from that image before its overlays.
          const correction = correctionFor(slide, attempt, new Date(), { program: ctx.presentation.text === "program" });
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
  if (action.action === "words") return setChangedWords({ topicId, session, images });
  if (action.action === "scene") return remakeScene({ session, images, instruction: action.instruction });
  if (action.action === "cut") return cutSceneAgain({ topicId, session, images, offset: action.offset });
  if (action.action === "layout") return applyWordsLayout({ topicId, session, images, slide: action.slide, layout: action.layout, all: action.all });
  if (action.action === "own") return placeOwnImage({ topicId, session, images, slide: action.slide, storyPhotoId: action.storyPhotoId, fit: action.fit });
  const slide = images.slides.find((entry) => entry.slide === action.slide);
  if (!slide) throw new Draft2InputError(`${action.slide} is not one of this carousel's slides.`);
  const now = new Date();
  // The editor's cast for the next image of this slide, when they name one: the brand's characters, at most two, never on verified material.
  const cast = action.action === "regenerate" && action.characterIds ? { ...slide, characterIds: editorCast(action.characterIds, session.inventory?.roster ?? [], slide.need) } : slide;
  const changed = action.action === "choose" ? chosenSlide(slide, action.version) : action.action === "map" ? movedMapSlide(slide, action.position, now) : regeneratedSlide(cast, action, now);
  const slides = images.slides.map((entry) => entry === slide ? changed : entry);
  const settled = slides.every(slideSettled);
  const status = settled ? settledStatus(slides) : "paused";
  const next: Draft2Images = { ...images, slides, status, updatedAt: now.toISOString(), error: settled ? imagesNote(slides) : "One slide waits to be made; continue to make it." };
  const updated = await updateDraft2Session(session.id, { images: next, ...(settled && session.step === "images" ? { status: status === "ready" ? "ready" : "needs-review", error: next.error ?? null } : {}) });
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}

/** The issues a review raised about the words: the program sets them again, so they no longer stand. */
const WORDS_ISSUE = /^(The words in the image|The lettering has a problem|The logo or the page number covers)/u;

/** The review of an image whose words were set again: its issues about the words dropped, the rest kept; passed when none remain. */
function wordsSetAgainReview(review: Draft2ImageReview | undefined, version: number): Draft2ImageReview | undefined {
  if (!review) return undefined;
  const issues = review.issues.filter((issue) => !WORDS_ISSUE.test(issue));
  return { ...review, status: review.status === "issues" && !issues.length ? "passed" : review.status, issues, note: `The image of v${version}, with its words set again by the program.${review.note ? ` ${review.note}` : ""}` };
}

/**
 * The words changed since the images (a hand edit or a review patch), set
 * again by the program on the same images: each changed slide gets a new
 * version made from the image it shows, before its overlays, with the words
 * it has now, the page number and the logo. No model is called and nothing
 * is charged; the earlier versions stay.
 */
async function setChangedWords({ topicId, session, images }: { topicId: string; session: Draft2SessionRow; images: Draft2Images }): Promise<Draft2SessionRow> {
  const target = imagesTarget(session);
  const changed = slidesWithChangedWords(images, target.carousel);
  if (!changed.length) throw new Draft2InputError("No slide's words changed since its image.");
  let fal: Context["fal"];
  try {
    fal = getFalImageRuntimeConfig("4:5", IMAGES_QUALITY);
  } catch (error) {
    if (error instanceof FalImageConfigurationError) throw new Draft2InputError("FAL_KEY is not configured.");
    throw error;
  }
  const run = withoutHistory(images);
  const profile = await getCreativeProfile(topicId);
  const ctx = await imagesContext({
    topicId, storyId: session.storyId, sessionId: session.id, run, target, facts: session.facts ?? [], profile, fal,
    descriptor: creativeImageModel(resolveDefaultCreativeImageModel()), signal: new AbortController().signal, trace: [...session.trace],
  });
  const now = new Date().toISOString();
  const slides = await Promise.all(images.slides.map(async (slide) => {
    const shown = shownAttempt(slide);
    if (!changed.includes(slide.slide) || !shown) return slide;
    const baseName = imageBaseFile(slide.slide, shown.version);
    const base = new Uint8Array(await (await readPrivateR2ImageFile({ objectKey: objectKey(ctx, baseName), contentType: "image/png", fileName: baseName })).arrayBuffer());
    const attempt: Draft2ImageAttempt = {
      version: Math.max(...slide.attempts.map((entry) => entry.version)) + 1, kind: "words", status: "generated", baseVersion: shown.version,
      ...(shown.portrait ? { portrait: shown.portrait } : {}), ...(shown.wordsLayout ? { wordsLayout: shown.wordsLayout } : {}), ...(shown.own ? { own: shown.own } : {}), queuedAt: now, costMicros: 0,
    };
    const final = await finish(ctx, slide, attempt, base);
    const sha256 = hash(final);
    await putPrivateR2Object({ objectKey: objectKey(ctx, imageFile(slide.slide, attempt.version)), body: final, contentType: "image/png", metadata: { sha256 } });
    await putPrivateR2Object({ objectKey: objectKey(ctx, imageBaseFile(slide.slide, attempt.version)), body: base, contentType: "image/png", metadata: { sha256: hash(base) } });
    const review = wordsSetAgainReview(shown.review, shown.version);
    Object.assign(attempt, { sha256, expectedText: creativeImageModelVisibleText(ctx.units[slide.order - 1]), completedAt: new Date().toISOString(), ...(review ? { review } : {}) });
    return { ...slide, attempts: [...slide.attempts, attempt], chosenVersion: undefined };
  }));
  const status = settledStatus(slides);
  const next: Draft2Images = { ...images, slides, status, updatedAt: now, error: imagesNote(slides) };
  const updated = await updateDraft2Session(session.id, { images: next, ...(session.step === "images" ? { status: status === "ready" ? "ready" : "needs-review", error: next.error ?? null } : {}) });
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}

/** The images' context for an editor's action that sets words again on stored images: no model is called. */
async function editContext(topicId: string, session: Draft2SessionRow, run: Draft2ImagesRun): Promise<Context> {
  let fal: Context["fal"];
  try {
    fal = getFalImageRuntimeConfig("4:5", IMAGES_QUALITY);
  } catch (error) {
    if (error instanceof FalImageConfigurationError) throw new Draft2InputError("FAL_KEY is not configured.");
    throw error;
  }
  return imagesContext({
    topicId, storyId: session.storyId, sessionId: session.id, run, target: imagesTarget(session), facts: session.facts ?? [], profile: await getCreativeProfile(topicId), fal,
    descriptor: creativeImageModel(resolveDefaultCreativeImageModel()), signal: new AbortController().signal, trace: [...session.trace],
  });
}

/** The image a slide shows, before its overlays, read and checked: what the words are set again on. */
async function shownBase(ctx: Context, slide: Draft2SlideImage): Promise<{ shown: Draft2ImageAttempt; base: Uint8Array }> {
  const shown = shownAttempt(slide);
  if (!shown) throw new Draft2InputError(`${slide.label} has no image yet.`);
  const name = imageBaseFile(slide.slide, shown.version);
  const base = new Uint8Array(await (await readPrivateR2ImageFile({ objectKey: objectKey(ctx, name), contentType: "image/png", fileName: name })).arrayBuffer());
  return { shown, base };
}

/**
 * The editor's layout for a slide's words (2026-10-17, the editor: "a graphic
 * editor of the text object: move it, size it, background or not, styles"),
 * set on the image the slide shows: a new version, no model, no cost, the
 * earlier ones kept and the image's review kept. With all, the layout's style
 * (fonts, sizes, colours, background, alignment) goes to every slide whose
 * words the program set, each keeping its own box.
 */
async function applyWordsLayout({ topicId, session, images, slide: name, layout, all }: { topicId: string; session: Draft2SessionRow; images: Draft2Images; slide: string; layout: Draft2WordsLayout; all: boolean }): Promise<Draft2SessionRow> {
  if (!images.slides.every(slideSettled)) throw new Draft2InputError("The slides are still being made; edit the words when they finish.");
  const target = images.slides.find((entry) => entry.slide === name);
  if (!target) throw new Draft2InputError(`${name} is not one of this carousel's slides.`);
  if (!shownAttempt(target)?.words) throw new Draft2InputError("The image model lettered these words: only words the program set can be moved or restyled.");
  const ctx = await editContext(topicId, session, withoutHistory(images));
  assertReadsAsWords(wordsFor(ctx, target), layout);
  const now = new Date().toISOString();
  const slides = await Promise.all(images.slides.map(async (slide) => {
    const own = slide.slide === name;
    const current = shownAttempt(slide);
    if (!own && (!all || !current?.words)) return slide;
    const { shown, base } = await shownBase(ctx, slide);
    // A slide lettered before layouts were kept has no box of its own: the program finds again where it set the words.
    const place = shown.wordsLayout ?? await autoWordsLayout({ image: base, words: wordsFor(ctx, slide), band: textBandOf(ctx, slide, shown), palette: ctx.wordsPalette, style: ctx.wordsStyle, places: ctx.wordsPlaces, cover: slide.order === 1 });
    const next = own ? layout : withStyleOf(place, layout);
    const attempt: Draft2ImageAttempt = {
      version: Math.max(...slide.attempts.map((entry) => entry.version)) + 1, kind: "words", status: "generated", baseVersion: shown.version,
      ...(shown.portrait ? { portrait: shown.portrait } : {}), ...(shown.own ? { own: shown.own } : {}), wordsLayout: next, queuedAt: now, costMicros: 0,
    };
    const final = await finish(ctx, slide, attempt, base);
    const sha256 = hash(final);
    await putPrivateR2Object({ objectKey: objectKey(ctx, imageFile(slide.slide, attempt.version)), body: final, contentType: "image/png", metadata: { sha256 } });
    await putPrivateR2Object({ objectKey: objectKey(ctx, imageBaseFile(slide.slide, attempt.version)), body: base, contentType: "image/png", metadata: { sha256: hash(base) } });
    const review = wordsSetAgainReview(shown.review, shown.version);
    Object.assign(attempt, { sha256, expectedText: creativeImageModelVisibleText(ctx.units[slide.order - 1]), completedAt: new Date().toISOString(), ...(review ? { review } : {}) });
    return { ...slide, attempts: [...slide.attempts, attempt], chosenVersion: undefined };
  }));
  const status = settledStatus(slides);
  const next: Draft2Images = { ...images, slides, status, updatedAt: now, error: imagesNote(slides) };
  const updated = await updateDraft2Session(session.id, { images: next, ...(session.step === "images" ? { status: status === "ready" ? "ready" : "needs-review", error: next.error ?? null } : {}) });
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}

/**
 * A slide with a layout's words set on the image it shows, as the editor
 * tries it: nothing is stored. Returns a JPEG of the finished slide (its words,
 * the page number, the logo) and where the block of words ends, for the box.
 */
export async function previewDraft2Words({ topicId, sessionId, slide: name, layout }: { topicId: string; sessionId: string; slide: string; layout?: Draft2WordsLayout }): Promise<{ image: Uint8Array; bottom: number; layout: Draft2WordsLayout; parts: Draft2WordsParts; palette: { name: string; color: string }[] }> {
  const session = await getDraft2Session(topicId, sessionId);
  const images = session?.images;
  if (!session || !images) throw new Draft2InputError("Generate the images first.");
  const slide = images.slides.find((entry) => entry.slide === name);
  if (!slide) throw new Draft2InputError(`${name} is not one of this carousel's slides.`);
  if (!shownAttempt(slide)?.words) throw new Draft2InputError("The image model lettered these words.");
  const ctx = await editContext(topicId, session, withoutHistory(images));
  if (layout) assertReadsAsWords(wordsFor(ctx, slide), layout);
  const { shown, base } = await shownBase(ctx, slide);
  // No layout yet (a slide lettered before layouts were kept): the program chooses one now, in the brand's fonts, and the editor starts from it.
  const attempt: Draft2ImageAttempt = { version: 0, kind: "words", status: "generated", ...(shown.portrait ? { portrait: shown.portrait } : {}), ...(shown.own ? { own: shown.own } : {}), ...(layout ?? shown.wordsLayout ? { wordsLayout: layout ?? shown.wordsLayout } : {}), queuedAt: new Date().toISOString() };
  const final = await finish(ctx, slide, attempt, base);
  const used = attempt.wordsLayout!;
  const image = new Uint8Array(await sharp(Buffer.from(final)).resize({ width: 864 }).jpeg({ quality: 84 }).toBuffer());
  const words = wordsFor(ctx, slide);
  // The brand's colours, for the editor to pick at once.
  const palette = (ctx.profile.brandPalette ?? []).flatMap((entry) => /^#?[0-9a-f]{6}$/iu.test(entry.color.trim()) ? [{ name: entry.name || entry.color, color: `#${entry.color.trim().replace(/^#/u, "").toLowerCase()}` }] : []);
  return { image, bottom: wordsBlockBottom(words, used), layout: used, parts: wordsParts(words, used), palette };
}

/** A panorama's scene the editor can act on: made (or the one before a remake that failed), under the editor's panorama, in the run that stands. */
function panoramaScene(images: Draft2Images): Draft2MasterPlate {
  if (images.presentation?.images !== "panorama" || !images.masterPlate) throw new Draft2InputError("These images are not a panorama.");
  const plate = standingScene(images.masterPlate);
  if (!plate || plate.status !== "generated" || !plate.sha256) throw new Draft2InputError("The scene is not made yet; continue the images first.");
  return plate;
}

/** The plate's own record, without its history, for the list of earlier versions. */
const plateRecord = ({ previous, ...plate }: Draft2MasterPlate): Draft2MasterPlateRecord => { void previous; return plate; };

/**
 * A panorama's scene made again (2026-10-17, the editor: "regenerate it,
 * adjust it and divide it again"): a new version queued with what the editor
 * asks to change, the earlier one kept in its history, and every slide's next
 * version queued as its section of the new scene, keeping the layout of its
 * words. The canvas continues the run: one image is made, the sections are
 * cut from it, and nothing earlier is overwritten.
 */
async function remakeScene({ session, images, instruction }: { session: Draft2SessionRow; images: Draft2Images; instruction?: string }): Promise<Draft2SessionRow> {
  const plate = panoramaScene(images);
  const now = new Date().toISOString();
  const next: Draft2MasterPlate = {
    anchor: plate.anchor, status: "queued", queuedAt: now, width: plate.width, height: plate.height, sections: plate.sections,
    version: nextSceneVersion(plate), ...(instruction ? { instruction } : {}), ...(plate.offset ? { offset: plate.offset } : {}),
    previous: [...(plate.previous ?? []), plateRecord(plate)],
  };
  const slides = images.slides.map((slide) => {
    const shown = shownAttempt(slide);
    const attempt: Draft2ImageAttempt = {
      version: Math.max(0, ...slide.attempts.map((entry) => entry.version)) + 1, kind: "section", status: "queued", queuedAt: now,
      ...(shown?.wordsLayout ? { wordsLayout: shown.wordsLayout } : {}), ...(shown ? { replacesVersion: shown.version } : {}),
    };
    return { ...slide, attempts: [...slide.attempts, attempt], chosenVersion: undefined };
  });
  const run: Draft2Images = { ...images, masterPlate: next, slides, status: "paused", updatedAt: now, error: "The scene waits to be made again; continue to make it." };
  const updated = await updateDraft2Session(session.id, { images: run, ...(session.step === "images" ? { status: "needs-review", error: run.error } : {}) });
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}

/**
 * A panorama cut again where the editor moved the cuts (or made the sections
 * smaller): every slide gets a new version, its section of the same scene
 * with its words, the page number and the logo set again. No model is
 * called and nothing is charged; the earlier versions stay, and each keeps
 * the review of the version it replaces, since the scene is the one reviewed.
 */
async function cutSceneAgain({ topicId, session, images, offset }: { topicId: string; session: Draft2SessionRow; images: Draft2Images; offset: Draft2CutOffset }): Promise<Draft2SessionRow> {
  const plate = panoramaScene(images);
  if (!images.slides.every(slideSettled)) throw new Draft2InputError("The slides are still being made; cut again when they finish.");
  const cut = cutSections(plate, offset);
  const same = plate.sections.every((section, index) => section.left === cut.sections[index].left && section.top === cut.sections[index].top && section.width === cut.sections[index].width);
  if (same) throw new Draft2InputError("The cuts are where they already are.");
  return cutEverySlide({ topicId, session, images, plate: { ...plate, sections: cut.sections, offset: cut.offset }, keepReview: true });
}

/**
 * Every slide cut again from a scene (the one there, its cuts moved, or one
 * the editor uploaded): a new version each, its section with its words, the
 * page number and the logo. No model is called and nothing is charged; the
 * earlier versions stay. With keepReview, each keeps the review of the
 * version it replaces, since the scene is the one reviewed.
 */
async function cutEverySlide({ topicId, session, images, plate, keepReview }: { topicId: string; session: Draft2SessionRow; images: Draft2Images; plate: Draft2MasterPlate; keepReview: boolean }): Promise<Draft2SessionRow> {
  const run = { ...withoutHistory(images), masterPlate: plate };
  const ctx = await editContext(topicId, session, run);
  const now = new Date().toISOString();
  const slides = await Promise.all(images.slides.map(async (slide) => {
    const shown = shownAttempt(slide);
    const attempt: Draft2ImageAttempt = {
      version: Math.max(0, ...slide.attempts.map((entry) => entry.version)) + 1, kind: "section", status: "queued", queuedAt: now,
      ...(shown?.wordsLayout ? { wordsLayout: shown.wordsLayout } : {}),
    };
    await cutSection(ctx, slide, attempt, new Map(), async () => undefined);
    if (keepReview && attempt.status === "generated" && shown?.review) attempt.review = { ...shown.review, note: `Cut again from the same scene as v${shown.version}.${shown.review.note ? ` ${shown.review.note}` : ""}` };
    return { ...slide, attempts: [...slide.attempts, attempt], chosenVersion: undefined };
  }));
  const status = settledStatus(slides);
  const next: Draft2Images = { ...images, masterPlate: plate, slides, status, updatedAt: now, error: imagesNote(slides) };
  const updated = await updateDraft2Session(session.id, { images: next, ...(session.step === "images" ? { status: status === "ready" ? "ready" : "needs-review", error: next.error ?? null } : {}) });
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}

/** "How it reads" must keep the slide's words: only line breaks and ** marks are the editor's there. */
function assertReadsAsWords(words: ReturnType<typeof wordsFor>, layout: Draft2WordsLayout): void {
  const roles = setAsMismatches(words, layout);
  if (roles.length) throw new Draft2InputError(`How the ${roles.join(" and the ")} ${roles.length === 1 ? "reads" : "read"} must keep the slide's words: only line breaks and ** marks may change. Change the words themselves in the Deck.`);
}

/** A file the editor sent, decoded and checked: a still JPG, PNG or WebP. */
async function decodedImage(bytes: Uint8Array): Promise<{ width: number; height: number; format: "jpeg" | "png" | "webp" }> {
  try {
    const metadata = await sharp(Buffer.from(bytes), { limitInputPixels: 80_000_000, animated: false }).metadata();
    const format = metadata.format === "jpeg" || metadata.format === "png" || metadata.format === "webp" ? metadata.format : undefined;
    if (!format || !metadata.width || !metadata.height || (metadata.pages ?? 1) > 1) throw new Error("Invalid image");
    // A photo turned by its EXIF orientation is as wide as it is tall the other way.
    const turned = (metadata.orientation ?? 1) >= 5;
    return { width: turned ? metadata.height : metadata.width, height: turned ? metadata.width : metadata.height, format };
  } catch {
    throw new Draft2InputError("This image cannot be read. Use a still JPG, PNG or WebP.");
  }
}

/**
 * The editor's photo brought to the slide: cropped to fill it, around the
 * photo's focal point when the editor set one (else where the eye goes), or
 * whole on the brand's colour.
 */
async function fittedOwnImage(bytes: Uint8Array, size: { width: number; height: number }, fit: Draft2OwnFit, focus: { x: number; y: number } | undefined, paper: string): Promise<Uint8Array> {
  const upright = sharp(Buffer.from(bytes)).rotate();
  if (fit === "contain") return new Uint8Array(await upright.resize(OUTPUT.width, OUTPUT.height, { fit: "contain", background: paper }).flatten({ background: paper }).png().toBuffer());
  if (!focus) return new Uint8Array(await upright.resize(OUTPUT.width, OUTPUT.height, { fit: "cover", position: "attention" }).png().toBuffer());
  const ratio = OUTPUT.width / OUTPUT.height;
  const width = Math.min(size.width, Math.round(size.height * ratio));
  const height = Math.min(size.height, Math.round(width / ratio));
  const left = Math.round(Math.min(size.width - width, Math.max(0, focus.x * size.width - width / 2)));
  const top = Math.round(Math.min(size.height - height, Math.max(0, focus.y * size.height - height / 2)));
  return new Uint8Array(await upright.extract({ left, top, width, height }).resize(OUTPUT.width, OUTPUT.height, { fit: "fill" }).png().toBuffer());
}

/**
 * One of the story's photos as a slide's image, the editor's own (2026-10-18,
 * the editor: "upload one of my own… a gallery of photos I took, and the
 * program did not take them all"): fitted to the slide, with the slide's
 * words, the page number and the logo set by the program. A new version: no
 * model, no cost, the earlier ones kept. Sol does not review it; only a photo
 * declared own or licensed goes on a slide.
 */
async function placeOwnImage({ topicId, session, images, slide: name, storyPhotoId, fit }: { topicId: string; session: Draft2SessionRow; images: Draft2Images; slide: string; storyPhotoId: string; fit: Draft2OwnFit }): Promise<Draft2SessionRow> {
  const slide = images.slides.find((entry) => entry.slide === name);
  if (!slide) throw new Draft2InputError(`${name} is not one of this carousel's slides.`);
  if (!slideSettled(slide)) throw new Draft2InputError(`${slide.label} is still being made; wait for it to finish.`);
  // Composed here and never sent to the image model, as a documentary portrait is.
  const [photo] = await resolveStoryReferences(topicId, session.storyId, [{ id: storyPhotoId, purpose: "documentary-portrait" }]);
  if (!photo || !publishablePhoto(photo.publicationRights)) throw new Draft2InputError(`${photo?.name ?? "That photo"} is reference only: declare it your own or licensed in the story's photos to put it on a slide.`);
  const [file] = await loadStoryReferenceImages([photo]);
  const original = new Uint8Array(await file.arrayBuffer());
  const size = await decodedImage(original);
  const ctx = await editContext(topicId, session, withoutHistory(images));
  const base = await fittedOwnImage(original, size, fit, photo.focus, ctx.wordsPalette.paper);
  const own: Draft2OwnImage = {
    fill: "slide", source: "story-photo", name: photo.name, rights: photo.publicationRights === "licensed" ? "licensed" : "own",
    ...(photo.publicationRights === "licensed" && photo.provenance ? { provenance: photo.provenance } : {}), storyPhotoId: photo.id, sha256: hash(original), width: size.width, height: size.height, fit,
  };
  const now = new Date().toISOString();
  const attempt: Draft2ImageAttempt = { version: Math.max(0, ...slide.attempts.map((entry) => entry.version)) + 1, kind: "own", status: "generated", own, queuedAt: now, costMicros: 0 };
  const final = await finish(ctx, slide, attempt, base);
  const sha256 = hash(final);
  await putPrivateR2Object({ objectKey: objectKey(ctx, imageFile(slide.slide, attempt.version)), body: final, contentType: "image/png", metadata: { sha256 } });
  await putPrivateR2Object({ objectKey: objectKey(ctx, imageBaseFile(slide.slide, attempt.version)), body: base, contentType: "image/png", metadata: { sha256: hash(base) } });
  Object.assign(attempt, { sha256, expectedText: creativeImageModelVisibleText(ctx.units[slide.order - 1]), completedAt: new Date().toISOString() } satisfies Partial<Draft2ImageAttempt>);
  const slides = images.slides.map((entry) => entry === slide ? { ...slide, attempts: [...slide.attempts, attempt], chosenVersion: undefined } : entry);
  const settled = slides.every(slideSettled);
  const status = settled ? settledStatus(slides) : "paused";
  const next: Draft2Images = { ...images, slides, status, updatedAt: now, error: settled ? imagesNote(slides) : images.error };
  const updated = await updateDraft2Session(session.id, { images: next, ...(settled && session.step === "images" ? { status: status === "ready" ? "ready" : "needs-review", error: next.error ?? null } : {}) });
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}

/** The longest side an uploaded scene keeps, as a drawn one: what the slides are cut from. */
const OWN_SCENE_MAX = { width: 3840, height: 2160 } as const;

/**
 * A panorama's scene the editor uploaded (2026-10-18, the editor: "I should
 * be able to upload my own image to cut"): kept as sent and, brought to the
 * size a drawn scene has, as the scene's next version, the earlier ones in
 * its history; every slide is cut from it at once with its words, the page
 * number and the logo. No model, no cost; rights declared as the editor sent it.
 */
export async function placeOwnDraft2Scene({ topicId, sessionId, image, name, rights, credit }: { topicId: string; sessionId: string; image: Uint8Array; name: string; rights: "own" | "licensed"; credit?: string }): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  const images = session.images;
  if (!images) throw new Draft2InputError("Generate the images first.");
  if (session.status === "running" && Date.now() - new Date(session.updatedAt).getTime() < OPENING_STALL_MS) throw new Draft2BusyError("The images are still being made; decide when they finish.");
  const plate = panoramaScene(images);
  if (!images.slides.every(slideSettled)) throw new Draft2InputError("The slides are still being made; use your scene when they finish.");
  const size = await decodedImage(image);
  const { data, info } = await sharp(Buffer.from(image), { limitInputPixels: 80_000_000 }).rotate().resize({ ...OWN_SCENE_MAX, fit: "inside", withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
  const count = plate.sections.length;
  const largest = Math.min(info.height, Math.floor(info.width / ((4 / 5) * count)));
  if (largest < OWN_SCENE_MIN_SECTION) throw new Draft2InputError(`For ${count} slides the scene needs at least ${Math.ceil((4 * count * OWN_SCENE_MIN_SECTION) / 5)} × ${OWN_SCENE_MIN_SECTION} pixels, wide enough for ${count} portrait sections side by side; this one gives each slide ${largest} pixels of height.`);
  const version = nextSceneVersion(plate);
  const scene = new Uint8Array(data);
  const ctx = await editContext(topicId, session, withoutHistory(images));
  const original = ownSceneOriginalFile(version, size.format === "jpeg" ? "jpg" : size.format);
  await putPrivateR2Object({ objectKey: objectKey(ctx, original), body: image, contentType: `image/${size.format}`, metadata: { sha256: hash(image) } });
  await putPrivateR2Object({ objectKey: objectKey(ctx, masterPlateFile(version)), body: scene, contentType: "image/png", metadata: { sha256: hash(scene) } });
  const now = new Date().toISOString();
  const cut = cutSections({ width: info.width, height: info.height, sections: plate.sections }, {});
  const next: Draft2MasterPlate = {
    anchor: plate.anchor, status: "generated", queuedAt: now, completedAt: now, width: info.width, height: info.height, sections: cut.sections, offset: cut.offset,
    version, sha256: hash(scene), costMicros: 0, own: { fill: "scene", source: "upload", name: name.slice(0, 150) || "Your scene", rights, ...(credit ? { provenance: credit } : {}), sha256: hash(image), width: size.width, height: size.height },
    previous: [...(plate.previous ?? []), plateRecord(plate)],
  };
  return cutEverySlide({ topicId, session, images, plate: next, keepReview: false });
}

/**
 * A panorama's scene as stored, for the canvas, checked against its record:
 * the version asked for (the current one, or one of its history), drawn with
 * the cuts where they stand or where the editor is trying them (offset), at
 * a width the canvas shows.
 */
export async function draft2SceneFile({ topicId, sessionId, runId, version, offset }: { topicId: string; sessionId: string; runId: string; version: number; offset?: Draft2CutOffset }): Promise<Uint8Array> {
  const session = await getDraft2Session(topicId, sessionId);
  const run = session?.images ? [withoutHistory(session.images), ...(session.images.previousRuns ?? [])].find((entry) => entry.runId === runId) : undefined;
  const current = run?.masterPlate;
  const plate = current && ((current.version ?? 1) === version ? current : current.previous?.find((entry) => (entry.version ?? 1) === version));
  if (!session || !run || !current || !plate || plate.status !== "generated" || !plate.sha256) throw new Draft2InputError("That scene is not one of this session's.");
  const name = masterPlateFile(plate.version);
  const bytes = new Uint8Array(await (await readPrivateR2ImageFile({ objectKey: buildDraft2ImageObjectKey({ topicId, sessionId, runId, file: name }), contentType: "image/png", fileName: name })).arrayBuffer());
  if (hash(bytes) !== plate.sha256) throw new Draft2InputError("The stored scene does not match its record.");
  const sections = offset ? cutSections(plate, offset).sections : plate.sections;
  const lines = sections.map((section, index) => `<rect x="${section.left}" y="${section.top}" width="${section.width}" height="${section.height}" fill="none" stroke="#ffffff" stroke-width="10"/><rect x="${section.left}" y="${section.top}" width="${section.width}" height="${section.height}" fill="none" stroke="#111111" stroke-width="4" stroke-dasharray="24 16"/><text x="${section.left + 24}" y="${section.top + 72}" font-family="Liberation Sans, Arial" font-size="56" font-weight="700" fill="#ffffff" stroke="#111111" stroke-width="3">${index + 1}</text>`).join("");
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${plate.width}" height="${plate.height}">${lines}</svg>`);
  // sharp resizes before it composites, whatever the order of the calls: the cuts are drawn at the scene's size first, then the whole is brought down.
  const drawn = await sharp(Buffer.from(bytes)).composite([{ input: overlay }]).png().toBuffer();
  return new Uint8Array(await sharp(drawn).resize({ width: 1920 }).jpeg({ quality: 82 }).toBuffer());
}

/** One finished image of this session, as stored, for the canvas (checked against its record). */
export async function draft2ImageFile({ topicId, sessionId, runId, slide, version }: { topicId: string; sessionId: string; runId: string; slide: string; version: number }): Promise<File> {
  const session = await getDraft2Session(topicId, sessionId);
  const run = session?.images ? [withoutHistory(session.images), ...(session.images.previousRuns ?? [])].find((entry) => entry.runId === runId) : undefined;
  const attempt = run?.slides.find((entry) => entry.slide === slide)?.attempts.find((entry) => entry.version === version);
  if (!session || !run || attempt?.status !== "generated" || !attempt.sha256) throw new Draft2InputError("That image is not one of this session's finished images.");
  return storedImage({ topicId, sessionId, runId, slide, version, sha256: attempt.sha256 });
}

/** A finished image as stored, checked against the hash its record keeps. */
async function storedImage({ topicId, sessionId, runId, slide, version, sha256 }: { topicId: string; sessionId: string; runId: string; slide: string; version: number; sha256: string }): Promise<File> {
  const file = await readPrivateR2ImageFile({ objectKey: buildDraft2ImageObjectKey({ topicId, sessionId, runId, file: imageFile(slide, version) }), contentType: "image/png", fileName: imageFile(slide, version) });
  if (hash(new Uint8Array(await file.arrayBuffer())) !== sha256) throw new Draft2InputError("The stored image does not match its record; make the slide again.");
  return file;
}

/**
 * The carousel's images as one ZIP, for the editor to check or post
 * elsewhere: each slide's shown image in slide order (draft2ImageDownloads),
 * read and checked as the canvas reads one, four at a time. One the editor
 * has not approved is a "-review" copy, and so is the archive that holds one.
 */
export async function draft2ImagesArchive({ topicId, sessionId }: { topicId: string; sessionId: string }): Promise<{ fileName: string; archive: Buffer; count: number; reviewCopies: number }> {
  const session = await getDraft2Session(topicId, sessionId);
  const run = session?.images;
  const downloads = run ? draft2ImageDownloads(run, session.publication) : [];
  if (!run || !downloads.length) throw new Draft2InputError("There are no finished images to download yet.");
  const files: { name: string; data: Uint8Array }[] = new Array(downloads.length);
  let next = 0;
  const worker = async () => {
    while (next < downloads.length) {
      const index = next++;
      const entry = downloads[index]!;
      const file = await storedImage({ topicId, sessionId, runId: run.runId, slide: entry.slide, version: entry.version, sha256: entry.sha256 });
      files[index] = { name: entry.name, data: new Uint8Array(await file.arrayBuffer()) };
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, downloads.length) }, worker));
  const reviewCopies = downloads.filter((entry) => !entry.approved).length;
  return {
    fileName: `carousel-draft2-${run.runId.slice(0, 8)}${reviewCopies ? "-review" : ""}-${new Date().toISOString().slice(0, 10)}.zip`,
    archive: zipStore(files),
    count: files.length,
    reviewCopies,
  };
}
