import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import * as types from "./draft2-facts.types";
import * as funnel from "./draft2-funnel";
import * as imagesTypes from "./draft2-images.types";
import * as captionTypes from "./draft2-caption.types";
import * as publicationTypes from "./draft2-publication.types";
import { loadInSandbox } from "./draft2-test-sandbox";
import type { Draft2Caption, Draft2CaptionCandidate } from "./draft2-caption.types";
import type { Draft2ImageAttempt, Draft2Images, Draft2SlideImage } from "./draft2-images.types";
import type { Draft2Publication } from "./draft2-publication.types";
import type { Draft2CarouselSlide, Draft2Visual, Draft2VisualCandidate, Draft2VisualSlide } from "./draft2-visual.types";

const topicId = "11111111-1111-4111-8111-111111111111";
const storyId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const json = (value: unknown) => JSON.stringify(value);
const sha = (text: string) => createHash("sha256").update(Buffer.from(text)).digest("hex");

const facts: types.Draft2Fact[] = [{ id: "f1", claim: "The library reopens Saturday.", evidence: "reopens Saturday", kind: "event", status: "established", importance: 90 }];
const carousel: Draft2CarouselSlide[] = [
  { slide: "cover", label: "Cover", headline: "The library is back", text: "Saturday.", factIds: ["f1"] },
  { slide: "last", label: "Slide 2", headline: "See you Saturday", text: "Doors open at 10.", cta: "Save this.", factIds: ["f1"] },
];
const scriptSlide = (slide: string): Draft2VisualSlide => ({ slide, beat: `A door on ${slide}`, subject: "the door", discovery: "", recurring: "none", shot: "wide", headlineLink: "", direction: `A door, ${slide}.`, need: "generic-illustration", characterIds: ["char-jo"], references: [] });
const SCRIPT = { id: "c2", angle: "x", concept: "Doors that open", motif: "A key", cast: "A child", characterPlan: { use: false, characterIds: [], role: "" }, slides: [scriptSlide("cover"), scriptSlide("last")] } as unknown as Draft2VisualCandidate;
const VISUAL = { status: "ready", winnerId: "c2", candidates: [SCRIPT], carousel, rounds: [{ round: 1, candidates: [SCRIPT], mechanical: [], at: "t" }] } as unknown as Draft2Visual;
const passed = { status: "passed" as const, issues: [], note: "", transcription: "", model: "sol", at: "t" };
/** Each slide's stored image is its name and version; its record carries that file's hash. */
const attempt = (slide: string, version: number, extra: Partial<Draft2ImageAttempt> = {}): Draft2ImageAttempt => ({ version, kind: "generate", status: "generated", sha256: sha(`${slide}-v${version}`), queuedAt: "t", review: passed, ...extra });
const slideImage = (slide: string, label: string, order: number, attempts = [attempt(slide, 1)]): Draft2SlideImage => ({ slide, label, order, need: "generic-illustration", characterIds: [], material: [], notes: [], attempts });
const IMAGES: Draft2Images = { runId: "run-1", status: "ready", visualId: "c2", inventoryVersion: 2, quality: "low", model: "gpt-image-2.5", startedAt: "t", updatedAt: "t", slides: [slideImage("cover", "Cover", 1), slideImage("last", "Slide 2", 2)] };
const candidate: Draft2CaptionCandidate = { id: "c2", angle: "x", text: "📚 The library is back on Saturday.\n\nSave this.", hashtags: ["Longueuil", "Biblio", "Samedi", "Famille", "Lecture"], factIds: ["f1"] };
const CAPTION = { status: "ready", winnerId: "c2", candidates: [candidate], imagesRunId: "run-1", mentions: [], mentionsVersion: 0, credits: ["Photo: A. Lens · CC BY 4.0"], rounds: [{ round: 1, candidates: [candidate], mechanical: [], at: "t" }] } as unknown as Draft2Caption;
const profile = { name: "Salut Longueuil", audience: "Families" };

type Row = Record<string, unknown> & { publication: Draft2Publication | null };

function harness({ session, approves = true, refreshed = "completed", provider = "draft2", retired = false, photos = {} }: { session?: Record<string, unknown>; approves?: boolean; refreshed?: string; provider?: string; retired?: boolean; photos?: Record<string, { active: boolean; publicationRights: string }> } = {}) {
  const calls = { briefs: [] as Record<string, unknown>[], drafts: [] as Record<string, unknown>[], batches: [] as Record<string, unknown>[], completed: [] as [string, Record<string, unknown>][], approvals: [] as unknown[] };
  let row: Row = { id: sessionId, topicId, storyId, step: "caption", status: "ready", facts, visual: VISUAL, images: IMAGES, caption: CAPTION, mentions: null, publication: null, ...session };
  /** The v1 asset rows created so far, by id, as findCreativeAssetById reads them. */
  const assets = new Map<string, { asset: Record<string, unknown>; batch: Record<string, unknown> }>();
  const stored = new Map<string, string>();
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "drizzle-orm": { sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join("?"), values }) },
    "@/db/client": { db: { execute: async (query: { values: unknown[] }) => { calls.approvals.push(query.values); return { rows: approves ? [{ id: "asset-1" }] : [] }; } } },
    "../stories/creative-profile.repository": { getCreativeProfile: async () => profile },
    "../stories/creative-content.repository": {
      insertCreativeBrief: async (input: Record<string, unknown>) => { calls.briefs.push(input); return { id: `brief-${calls.briefs.length}` }; },
      insertCreativeDraft: async (input: Record<string, unknown>) => { calls.drafts.push(input); return { id: `draft-${calls.drafts.length}`, version: 1 }; },
      // v1's copy as it stands: approved, unless a visual policy change retired it (a new version, back to draft).
      findCreativeDraftById: async (_topic: string, id: string) => retired ? { id, status: "draft", version: 2 } : { id, status: "approved", version: 1 },
    },
    "../stories/creative-assets.repository": {
      createCreativeAssetBatch: async (input: { assets: Record<string, unknown>[] } & Record<string, unknown>) => {
        calls.batches.push(input);
        const batch = { id: `batch-${calls.batches.length}`, provider: input.identity && (input.identity as { provider: string }).provider, status: "generating", assets: input.assets.map((asset, index) => ({ ...asset, id: `asset-${calls.batches.length}-${index + 1}` })) };
        for (const asset of batch.assets) assets.set(asset.id, { asset, batch: { ...batch, provider } });
        return batch;
      },
      completeCreativeAsset: async (id: string, file: Record<string, unknown>) => { calls.completed.push([id, file]); },
      refreshCreativeAssetBatchStatus: async (id: string) => ({ id, status: refreshed }),
      findCreativeAssetById: async (id: string) => assets.get(id),
      findCreativeAssetBatchById: async (id: string) => ({ id, draftId: id.replace("batch", "draft"), draftVersion: 1, status: retired ? "stale" : "completed", assets: IMAGES.slides.map(() => ({ status: retired ? "generated" : "approved" })) }),
    },
    "../stories/creative-image-prompt-contracts": { creativeImageModelVisibleText: (unit: { headline: string }) => unit.headline },
    // The story's photos as the editor declared them now: the one an own image shows is looked up by id.
    "../stories/story-materials.repository": { findStoryPhoto: async (_topic: string, _story: string, id: string) => photos[id] },
    "./draft2-session.repository": {
      activeDraft2Session: async () => undefined,
      getDraft2Session: async (topic: string, id: string) => topic === topicId && id === row.id ? row : undefined,
      updateDraft2Session: async (_id: string, patch: Record<string, unknown>) => { row = { ...row, ...patch }; return row; },
    },
    "./draft2-facts.types": types,
    "./draft2-funnel": funnel,
    "./draft2-images.types": imagesTypes,
    "./draft2-caption.types": captionTypes,
    "./draft2-publication.types": publicationTypes,
    "./draft2-images": {
      draft2ImageFile: async ({ slide, version }: { slide: string; version: number }) => new File([stored.get(`${slide}-v${version}`) ?? `${slide}-v${version}`], `${slide}-v${version}.png`, { type: "image/png" }),
    },
  };
  const exports = loadInSandbox("./draft2-publication.ts", mocks, { Date, File, Uint8Array, Buffer }) as Record<string, (...args: unknown[]) => Promise<unknown>>;
  return {
    prepare: (acknowledgeIssues = false) => exports.prepareDraft2Publication({ topicId, storyId, sessionId, acknowledgeIssues }) as Promise<Row>,
    image: (assetId: string) => exports.readDraft2PublicationImage(topicId, assetId) as Promise<File>,
    /** Replaces a stored image's bytes, as if the file changed after its approval. */
    tamper: (file: string, bytes: string) => stored.set(file, bytes),
    calls,
    row: () => row,
  };
}

test("approving copies the carousel once into v1's rows under the draft2 provider, approved, for v1's publication to freeze and post", async () => {
  const h = harness();
  const session = await h.prepare();
  const [brief] = h.calls.briefs;
  const [draft] = h.calls.drafts as { generated: { caption: string; hashtags: string[]; units: { order: number; headline: string; characterIds: string[] }[] } & Record<string, unknown> }[] & Record<string, unknown>[];
  assert.equal(json([brief.provider, brief.promptVersion, (draft as Record<string, unknown>).provider, (draft as Record<string, unknown>).format, (draft as Record<string, unknown>).outputAspectRatio]), json(["draft2", "draft2-publication-v1", "draft2", "carousel", "4:5"]));
  assert.equal(draft.generated.caption, "📚 The library is back on Saturday.\n\nSave this.\n\nPhoto: A. Lens · CC BY 4.0", "the text with its line breaks, then the credits");
  assert.equal(json(draft.generated.hashtags), json(["#Longueuil", "#Biblio", "#Samedi", "#Famille", "#Lecture"]));
  assert.equal(json(draft.generated.units.map((unit) => [unit.order, unit.headline, unit.characterIds])), json([[1, "The library is back", []], [2, "See you Saturday", []]]));
  const [batch] = h.calls.batches as { identity: Record<string, unknown>; width: number; height: number; assets: { unitOrder: number; providerEndpoint: string; unitSnapshot: { draft2Image: Record<string, unknown> } }[] }[];
  assert.equal(json([batch.identity.provider, batch.width, batch.height]), json(["draft2", 1080, 1350]));
  assert.equal(json(batch.assets.map((asset) => [asset.unitOrder, asset.providerEndpoint, asset.unitSnapshot.draft2Image])), json([
    [1, "draft2/images", { sessionId, runId: "run-1", slide: "cover", version: 1, sha256: sha("cover-v1") }],
    [2, "draft2/images", { sessionId, runId: "run-1", slide: "last", version: 1, sha256: sha("last-v1") }],
  ]));
  assert.equal(json(h.calls.completed.map(([id, file]) => [id, file.url, file.width, file.height])), json([
    ["asset-1-1", `/api/radar/draft2/images/file?topicId=${topicId}&sessionId=${sessionId}&run=run-1&slide=cover&version=1`, 1080, 1350],
    ["asset-1-2", `/api/radar/draft2/images/file?topicId=${topicId}&sessionId=${sessionId}&run=run-1&slide=last&version=1`, 1080, 1350],
  ]));
  const approval = h.calls.approvals[0] as unknown[];
  assert.equal(json([h.calls.approvals.length, approval.includes("draft-1"), approval.includes("batch-1"), approval.includes("draft2")]), json([1, true, true, true]), "one statement approves the draft and its images together, for the draft2 provider only");
  const publication = session.publication!;
  assert.equal(json([publication.draftId, publication.batchId, publication.imagesRunId, publication.captionId, publication.acknowledgedIssues, publication.slides.map((slide) => [slide.slide, slide.version])]),
    json(["draft-1", "batch-1", "run-1", "c2", [], [["cover", 1], ["last", 1]]]));
  assert.equal(publication.postText, "📚 The library is back on Saturday.\n\nSave this.\n\nPhoto: A. Lens · CC BY 4.0\n\n#Longueuil #Biblio #Samedi #Famille #Lecture");
});

test("approving the same carousel again returns the same copy; a change makes a new one", async () => {
  const h = harness();
  const first = await h.prepare();
  const again = await h.prepare();
  assert.equal(json([h.calls.drafts.length, again.publication?.draftId]), json([1, first.publication?.draftId]));
  const other: Draft2CaptionCandidate = { ...candidate, id: "c3", text: "Another caption.\n\nSave this." };
  const h2 = harness({ session: { publication: first.publication, caption: { ...CAPTION, editorChoiceId: "c3", rounds: [{ ...CAPTION.rounds[0], candidates: [candidate, other] }] } } });
  const changed = await h2.prepare();
  assert.equal(json([h2.calls.drafts.length, changed.publication?.captionId]), json([1, "c3"]));
});

test("a copy v1 no longer holds as approved (a visual policy change retires approvals) is made again", async () => {
  const first = await harness().prepare();
  const h = harness({ retired: true, session: { publication: first.publication } });
  const again = await h.prepare();
  assert.equal(json([h.calls.drafts.length, again.publication?.snapshotHash === first.publication?.snapshotHash]), json([1, true]), "the same carousel, copied again");
});

test("images the review did not pass are published only once the editor says they looked at them", async () => {
  const issues = { status: "issues" as const, issues: ["The headline is cut off."], note: "", transcription: "", model: "sol", at: "t" };
  const flagged = { ...IMAGES, status: "needs-review", slides: [slideImage("cover", "Cover", 1, [attempt("cover", 1, { review: issues })]), IMAGES.slides[1]] };
  await assert.rejects(harness({ session: { images: flagged } }).prepare(), /Look at this image before publishing, then approve again: Cover: The headline is cut off\./);
  const session = await harness({ session: { images: flagged } }).prepare(true);
  assert.equal(json(session.publication?.acknowledgedIssues), json(["Cover: The headline is cut off."]));
});

test("a copy that cannot be approved whole is not recorded", async () => {
  await assert.rejects(harness({ approves: false }).prepare(), /could not be approved for publishing/);
  await assert.rejects(harness({ refreshed: "generating" }).prepare(), /could not be approved for publishing/);
  const h = harness({ approves: false });
  await h.prepare().catch(() => undefined);
  assert.equal(h.row().publication, null);
  await assert.rejects(harness({ session: { visual: { ...VISUAL, rounds: [] } } }).prepare(), /The visual script these images picture is no longer in the session/);
});

test("v1 reads a copied slide's image from Draft 2's storage, and only while it is the image approved", async () => {
  const h = harness();
  await h.prepare();
  const file = await h.image("asset-1-1");
  assert.equal(json([file.name, file.type, Buffer.from(await file.arrayBuffer()).toString()]), json(["cover-v1.png", "image/png", "cover-v1"]));
  h.tamper("cover-v1", "something else");
  await assert.rejects(h.image("asset-1-1"), /The image changed since it was approved for publishing/);
  await assert.rejects(h.image("asset-9"), /not a Draft 2 publication image/);
  const v1 = harness({ provider: "fal" });
  await v1.prepare();
  await assert.rejects(v1.image("asset-1-1"), /not a Draft 2 publication image/, "an image of another provider is never read here");
});

test("the editor's own photo publishes under the rights declared now: one taken back to reference only, or removed, stops the approval; one still their own goes without a review", async () => {
  const photo = "0f8e0c1e-5a8b-4b4e-9b52-0c9a1f3d2e10";
  const own = { fill: "slide" as const, source: "story-photo" as const, name: "Taza en la mesa", rights: "own" as const, storyPhotoId: photo, sha256: "a", width: 2048, height: 1536, fit: "cover" as const };
  const images: Draft2Images = { ...IMAGES, slides: [slideImage("cover", "Cover", 1, [attempt("cover", 1), attempt("cover", 2, { kind: "own", review: undefined, own })]), slideImage("last", "Slide 2", 2)] };
  for (const [photos, refused] of [[{ [photo]: { active: true, publicationRights: "reference" } }, true], [{}, true], [{ [photo]: { active: false, publicationRights: "own" } }, true], [{ [photo]: { active: true, publicationRights: "own" } }, false]] as const) {
    const h = harness({ session: { images }, photos });
    if (refused) await assert.rejects(h.prepare(), /Cover shows Taza en la mesa, which is no longer declared your own or licensed/);
    else assert.equal((await h.prepare()).publication?.slides[0].version, 2, "the editor's own image, approved with no review to acknowledge");
  }
});
