import "server-only";
import { createHash } from "node:crypto";
import type { CreativeDraft, CreativeKeyFact } from "./creative-content.types";
import { documentarySnapshot, eligiblePhoto, normalizePlaceName, reportsChangedPlaceState } from "./creative-documentary";
import { documentarySourceToken, latestDocumentaryBatch } from "./creative-documentary.repository";
import { buildDocumentaryObjectKey, readPrivateR2ImageFile } from "./r2-storage";
import { PLACE_VISUAL_VERSION, unitSource, type PreparedPlaceVisual } from "./creative-place-visual";

/** Reuse only current, human-approved originals from this story and topic. */
export async function reuseDocumentaryVisuals(topicId: string, draft: CreativeDraft, facts: CreativeKeyFact[]) {
  const result = new Map<number, PreparedPlaceVisual>();
  const batch = await latestDocumentaryBatch(topicId, draft.storyId);
  if (!batch?.allApproved || batch.status === "stale") return result;
  const token = await documentarySourceToken(topicId, draft.storyId);
  const snapshots = batch.assets.map(a => documentarySnapshot(a.unitSnapshot)).filter(s =>
    s && s.sourceToken === token && s.review?.decision === "approved" && s.places.length === 1);
  for (const unit of draft.units) {
    if (unit.assetRequest === "typography-only") continue;
    const source = normalizePlaceName(unitSource(unit, facts));
    const matches = snapshots.filter(s => s && source.includes(normalizePlaceName(s.places[0].name)));
    if (new Set(matches.map(s => s!.places[0].id)).size !== 1) continue;
    const snapshot = matches[0]!;
    const place = snapshot.places[0];
    const photo = snapshot.photo;
    const hash = photo?.sha256 ?? snapshot.map?.sha256;
    const age = Date.now() - Date.parse(snapshot.preparedAt);
    if (!hash || !Number.isFinite(age) || age < 0 || age >= 86_400_000) continue;
    if (photo && (!eligiblePhoto(photo, place) || reportsChangedPlaceState([unit.headline, unit.body, unitSource(unit, facts)].join("\n")))) continue;
    try {
      const file = await readPrivateR2ImageFile({ objectKey: buildDocumentaryObjectKey(topicId, "originals", hash), contentType: photo?.contentType ?? "image/png" });
      const bytes = Buffer.from(await file.arrayBuffer());
      if (createHash("sha256").update(bytes).digest("hex") !== hash) continue;
      result.set(unit.order, { bytes, evidence: {
        version: PLACE_VISUAL_VERSION, representation: photo ? "photo" : "map", preparedAt: snapshot.preparedAt,
        place, photo, sha256: hash, sourceUrl: place.sourceUrl,
        attribution: photo ? `${photo.attribution} · ${photo.licenseUrl} · ${photo.creditUrl || photo.sourceUrl}` : snapshot.map!.attribution,
        reasons: ["Reused approved documentary original for this slide's cited place; original pixels preserved."],
      } });
    } catch { /* Missing private original is never substituted with generated geography. */ }
  }
  return result;
}


/** Include the selected originals and credits in the immutable composition identity. */
export function documentaryVisualInputHash(prepared?: Map<number, PreparedPlaceVisual>): string {
  const inputs = [...(prepared ?? new Map<number, PreparedPlaceVisual>())]
    .sort(([a], [b]) => a - b)
    .map(([order, visual]) => ({
      order,
      representation: visual.evidence.representation,
      sha256: visual.evidence.sha256,
      placeId: visual.evidence.place?.id,
      attribution: visual.evidence.attribution,
      preparedAt: visual.evidence.preparedAt,
    }));
  return createHash("sha256").update(JSON.stringify(inputs)).digest("hex").slice(0, 24);
}


/** Private approved original for the explicitly enabled reference-guided experiment. */
export async function readDocumentaryPhotoReference(evidence: PreparedPlaceVisual["evidence"]): Promise<File> {
  const { photo, place, referenceTopicId } = evidence;
  if (evidence.generationUse !== "ai-reference" || !referenceTopicId || !photo || !place ||
      !eligiblePhoto(photo, place) || evidence.sha256 !== photo.sha256) {
    throw new Error("The documentary photo reference is missing or expired. Prepare and approve it again.");
  }
  const file = await readPrivateR2ImageFile({
    objectKey: buildDocumentaryObjectKey(referenceTopicId, "originals", photo.sha256),
    contentType: photo.contentType,
  });
  if (createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex") !== photo.sha256) {
    throw new Error("The documentary photo reference failed its integrity check.");
  }
  return file;
}
