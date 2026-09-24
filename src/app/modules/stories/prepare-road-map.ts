import { renderOpenMap } from "./open-map-render";
import "server-only";
import { createHash } from "node:crypto";
import { fetchDocumentaryResource } from "./creative-documentary-providers";
import { ROAD_DATA_URL, hasRoadNoticeRecord, isOfficialRoadNoticeSource, matchRoadSegment, sameRoadSegment, selectRoadSegment } from "./quebec-road-map";
import type { CreativeKeyFact } from "./creative-content.types";
/**
 * A 511 notice record is matched from the facts the slide cites, as before. A
 * prose notice (ministry press release) is matched from the brief's whole fact
 * set: its route, direction, dates and named anchors are usually spread across
 * several facts, and the same set is what approval and export re-verify.
 */
export async function prepareRoadMap(sourceUrl: string, unitFacts: CreativeKeyFact[], briefFacts: CreativeKeyFact[] = unitFacts) {
  const evidence: { reason: string; segment?: ReturnType<typeof selectRoadSegment>; source: string; fetchedAt: string; sha256?: string } = { reason: "No official road source", source: ROAD_DATA_URL, fetchedAt: new Date().toISOString() };
  try {
    const source = new URL(sourceUrl);
    if (!isOfficialRoadNoticeSource(source)) return { evidence };
    const signal = AbortSignal.timeout(25_000);
    const data = JSON.parse((await fetchDocumentaryResource(new URL(ROAD_DATA_URL), signal, 8_000_000)).toString());
    const match = matchRoadSegment(data, hasRoadNoticeRecord(unitFacts) ? unitFacts : briefFacts);
    if (!match.segment) { evidence.reason = match.reason; return { evidence }; }
    const segment = match.segment;
    const detailId = source.searchParams.get("idChantier");
    if (detailId && detailId !== segment.id && detailId !== segment.chantier) { evidence.reason = "Source notice ID conflicts with cited evidence"; return { evidence }; }
    evidence.segment = segment;
    // The legend repeats the official wording only; a detour is named, never drawn.
    const legend = [segment.entrave, segment.detour ? `Détour : ${segment.detour}` : ""].filter(Boolean).join(" · ");
    const bytes = await renderOpenMap({kind:"line",name:segment.location,points:segment.coordinates as [number,number][], ...(legend ? { legend } : {})});
    evidence.sha256 = createHash("sha256").update(bytes).digest("hex");
    evidence.reason = "Official MTMD segment rendered as location context; not a photograph of the works";
    return { evidence, bytes };
  } catch { evidence.reason = "Official segment or map provider unavailable; no location invented"; return { evidence }; }
}

export async function roadMapStillCurrent(evidence: import("./creative-content.types").CreativeUnit["roadMapEvidence"], facts: CreativeKeyFact[]): Promise<boolean> {
  if (!evidence?.sha256) return true;
  if (!evidence.segment) return false;
  try {
    const data = JSON.parse((await fetchDocumentaryResource(new URL(ROAD_DATA_URL), AbortSignal.timeout(12_000), 8_000_000)).toString());
    return sameRoadSegment(selectRoadSegment(data, facts), evidence.segment);
  } catch { return false; }
}
