import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getCreativeProfile } from "../stories/creative-profile.repository";
import { findCreativeDraftById, insertCreativeBrief, insertCreativeDraft } from "../stories/creative-content.repository";
import { completeCreativeAsset, createCreativeAssetBatch, findCreativeAssetBatchById, findCreativeAssetById, refreshCreativeAssetBatchStatus } from "../stories/creative-assets.repository";
import { creativeImageModelVisibleText } from "../stories/creative-image-prompt-contracts";
import type { CreativeAiUsage, CreativeUnit } from "../stories/creative-content.types";
import { activeDraft2Session, getDraft2Session, updateDraft2Session } from "./draft2-session.repository";
import { Draft2BusyError, Draft2InputError } from "./draft2-facts.types";
import { funnelVersions } from "./draft2-funnel";
import { draft2ImageFile } from "./draft2-images";
import { slideUnit } from "./draft2-images.types";
import { captionText, normalHashtag } from "./draft2-caption.types";
import { DRAFT2_PROVIDER, publicationTarget, targetPostText, type Draft2Publication } from "./draft2-publication.types";
import { chosenOpeningLever } from "./draft2-opening.types";
import type { Draft2SessionRow } from "@/db/schema";

const PUBLICATION_VERSION = "draft2-publication-v1";
const NO_USAGE: CreativeAiUsage = { promptTokens: 0, outputTokens: 0, thoughtsTokens: 0, totalTokens: 0 };

/** Where a copied slide's image is in Draft 2: the session, the images run, the slide and the version, and its hash. */
type Draft2ImageReference = { sessionId: string; runId: string; slide: string; version: number; sha256: string };

const draft2ImageOf = (unitSnapshot: unknown): Draft2ImageReference | undefined => (unitSnapshot as { draft2Image?: Draft2ImageReference } | undefined)?.draft2Image;

/**
 * A copied slide's image for v1's publication (its candidate check and its
 * frozen package): read from Draft 2's private storage and checked against
 * the hash recorded when the editor approved it.
 */
export async function readDraft2PublicationImage(topicId: string, assetId: string): Promise<File> {
  const found = await findCreativeAssetById(assetId);
  const image = draft2ImageOf(found?.asset.unitSnapshot);
  if (!found || found.batch.provider !== DRAFT2_PROVIDER || !image) throw new Draft2InputError("This image is not a Draft 2 publication image.");
  const file = await draft2ImageFile({ topicId, sessionId: image.sessionId, runId: image.runId, slide: image.slide, version: image.version });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== image.sha256) throw new Draft2InputError("The image changed since it was approved for publishing. Approve the carousel again.");
  return new File([bytes], file.name, { type: "image/png" });
}

/** The draft and every image approved together, or neither: one statement, as the documentary pipeline approves its batches. */
async function approveCopy(draftId: string, batchId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db.execute(sql`
    WITH eligible AS MATERIALIZED (
      SELECT b.id FROM creative_asset_batches b JOIN creative_drafts d ON d.id = b.draft_id
      WHERE b.id = ${batchId} AND d.id = ${draftId} AND d.provider = ${DRAFT2_PROVIDER} AND b.provider = ${DRAFT2_PROVIDER} AND b.status = 'completed'
        AND NOT EXISTS (SELECT 1 FROM creative_assets a WHERE a.batch_id = b.id AND (a.status <> 'generated' OR a.image_url IS NULL))
      FOR UPDATE OF b
    ), changed_draft AS (
      UPDATE creative_drafts SET status = 'approved'::creative_draft_status, approved_at = ${now}::timestamptz, updated_at = ${now}::timestamptz
      WHERE id = ${draftId} AND EXISTS (SELECT 1 FROM eligible) RETURNING id
    ), changed_assets AS (
      UPDATE creative_assets SET status = 'approved'::creative_asset_status, approved_at = ${now}::timestamptz, updated_at = ${now}::timestamptz
      WHERE batch_id IN (SELECT id FROM eligible) AND EXISTS (SELECT 1 FROM changed_draft) RETURNING id
    ) SELECT id FROM changed_assets`);
  return result.rows.length > 0;
}

/**
 * Whether v1 still holds the copy as approved: the draft approved, its batch
 * complete for its version, every image approved. A change of the Topic's
 * visual policy retires approvals (creative-visual-policy-invalidation.ts);
 * the carousel is then copied again.
 */
async function copyStillApproved(topicId: string, publication: Draft2Publication): Promise<boolean> {
  const [draft, batch] = await Promise.all([findCreativeDraftById(topicId, publication.draftId), findCreativeAssetBatchById(publication.batchId)]);
  return Boolean(draft && batch && draft.status === "approved" && batch.draftId === draft.id && batch.draftVersion === draft.version && batch.status === "completed"
    && batch.assets.length === publication.slides.length && batch.assets.every((asset) => asset.status === "approved"));
}

/**
 * The editor approves the carousel as it stands for publishing: each
 * slide's shown image and the chosen caption, with its credits and
 * hashtags. Images the review did not pass need the editor's explicit
 * acknowledgement. The approved carousel is copied once into v1's rows (a
 * brief, a draft and a completed batch under the `draft2` provider, all
 * approved), so v1's publication can freeze its immutable package and post
 * it to Facebook, Instagram or both. Approving the same carousel again
 * returns the same copy, while v1 still holds it as approved.
 */
export async function prepareDraft2Publication({ topicId, storyId, sessionId, acknowledgeIssues = false }: { topicId: string; storyId: string; sessionId: string; acknowledgeIssues?: boolean }): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session || session.storyId !== storyId) throw new Draft2InputError("This Draft 2 session was not found for the story. Reload the canvas.");
  if (await activeDraft2Session(topicId, storyId)) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const target = publicationTarget(session);
  const lever = chosenOpeningLever(session.opening);
  if (target.issues.length && !acknowledgeIssues) {
    throw new Draft2InputError(`Look at ${target.issues.length === 1 ? "this image" : "these images"} before publishing, then approve again: ${target.issues.join(" ")}`);
  }
  // The text v1 freezes and posts with its hashtags: the caption, then the source line and the credits (captionPostText's order).
  const caption = [captionText(target.caption.text), [target.source ?? "", ...target.credits].filter(Boolean).join("\n")].filter(Boolean).join("\n\n");
  const hashtags = target.caption.hashtags.map((tag) => `#${normalHashtag(tag)}`);
  const snapshotHash = createHash("sha256").update(JSON.stringify({
    imagesRunId: target.imagesRunId, slides: target.slides.map(({ slide, version, sha256 }) => [slide, version, sha256]), caption, hashtags,
  })).digest("hex");
  if (session.publication?.snapshotHash === snapshotHash && await copyStillApproved(topicId, session.publication)) return session;

  const visual = session.visual;
  const images = session.images!;
  const script = visual ? funnelVersions(visual.rounds).find((version) => version.candidate.id === images.visualId)?.candidate : undefined;
  if (!visual?.carousel || !script) throw new Draft2InputError("The visual script these images picture is no longer in the session. Make the images again.");
  const carousel = visual.carousel;
  const units: CreativeUnit[] = target.slides.map((slide, index) => {
    const scriptSlide = script.slides.find((entry) => entry.slide === slide.slide);
    if (!scriptSlide) throw new Draft2InputError(`The visual script has no image for ${slide.label}.`);
    return { ...slideUnit(carousel, index, scriptSlide, []), characterIds: [], storyReferences: [] };
  });
  const profile = await getCreativeProfile(topicId);
  const facts = session.facts ?? [];
  const cover = carousel[0];
  const brief = await insertCreativeBrief({
    topicId, storyId, profile, provider: DRAFT2_PROVIDER, model: "draft2", promptVersion: PUBLICATION_VERSION, inputHash: snapshotHash, usage: NO_USAGE,
    generated: {
      recommendedFormat: "carousel", fallbackFormat: "meme", formatScores: [], confidence: 0, targetAudience: profile.audience, keyMessage: cover.headline,
      angle: "Draft 2 carousel", hook: cover.headline, tone: { primary: "informative", energy: 0, humor: 0, reason: "Written in Draft 2" }, contentSufficiency: "limited",
      keyFacts: facts.map((fact) => ({ id: fact.id, statement: fact.claim, sourceExcerpt: fact.evidence })), riskFlags: [], suggestedConcepts: [],
    },
  });
  const draft = await insertCreativeDraft({
    topicId, storyId, briefId: brief.id, format: "carousel", outputAspectRatio: "4:5", provider: DRAFT2_PROVIDER, model: "draft2", promptVersion: PUBLICATION_VERSION,
    inputHash: snapshotHash, usage: NO_USAGE, characterSnapshots: new Map(),
    generated: { concept: script.concept, caption, hashtags, altText: `${cover.headline}. ${cover.text}`.slice(0, 500), units },
  });
  const files = await Promise.all(target.slides.map((slide) => draft2ImageFile({ topicId, sessionId: session.id, runId: target.imagesRunId, slide: slide.slide, version: slide.version })));
  let batch = await createCreativeAssetBatch({
    draftId: draft.id, draftVersion: draft.version, outputAspectRatio: "4:5", imageQuality: images.quality, width: 1080, height: 1350,
    identity: { provider: DRAFT2_PROVIDER, model: images.model, promptVersion: PUBLICATION_VERSION, brandInputHash: snapshotHash },
    assets: units.map((unit, index) => {
      const slide = target.slides[index];
      const draft2Image: Draft2ImageReference = { sessionId: session.id, runId: target.imagesRunId, slide: slide.slide, version: slide.version, sha256: slide.sha256 };
      return {
        unitOrder: unit.order, unitRole: unit.role, prompt: "Made in Draft 2 (its session keeps the prompt and the review).", expectedText: creativeImageModelVisibleText(unit),
        unitSnapshot: { ...unit, draft2Image } as CreativeUnit, generationMode: "text-to-image" as const, providerEndpoint: "draft2/images", referenceSnapshot: [], referenceInputHash: snapshotHash,
      };
    }),
  });
  for (const asset of batch.assets) {
    const slide = target.slides[asset.unitOrder - 1];
    await completeCreativeAsset(asset.id, {
      url: `/api/radar/draft2/images/file?topicId=${encodeURIComponent(topicId)}&sessionId=${encodeURIComponent(session.id)}&run=${encodeURIComponent(target.imagesRunId)}&slide=${encodeURIComponent(slide.slide)}&version=${slide.version}`,
      contentType: "image/png", fileName: `${slide.slide}-v${slide.version}.png`, fileSize: files[asset.unitOrder - 1].size, width: 1080, height: 1350,
    });
  }
  batch = await refreshCreativeAssetBatchStatus(batch.id);
  if (batch.status !== "completed" || !(await approveCopy(draft.id, batch.id))) throw new Draft2InputError("The carousel could not be approved for publishing. Approve it again.");
  const publication: Draft2Publication = {
    draftId: draft.id, batchId: batch.id, snapshotHash, imagesRunId: target.imagesRunId, captionId: target.caption.id,
    slides: target.slides.map(({ slide, label, order, version, sha256 }) => ({ slide, label, order, version, sha256 })),
    postText: targetPostText(target),
    approvedAt: new Date().toISOString(), acknowledgedIssues: acknowledgeIssues ? target.issues : [],
    ...(lever ? { lever } : {}),
  };
  const updated = await updateDraft2Session(session.id, { publication });
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}
