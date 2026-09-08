import { renderOpenMap } from "./open-map-render";
import "server-only";
import { createHash } from "node:crypto";
import { fetchDocumentaryResource } from "./creative-documentary-providers";
import { ROAD_DATA_URL, selectRoadSegment } from "./quebec-road-map";
import type { CreativeKeyFact } from "./creative-content.types";
export async function prepareRoadMap(sourceUrl: string, facts: CreativeKeyFact[]) {
  const evidence: { reason: string; segment?: ReturnType<typeof selectRoadSegment>; source: string; fetchedAt: string; sha256?: string } = { reason: "No official road source", source: ROAD_DATA_URL, fetchedAt: new Date().toISOString() };
  try {
    const source = new URL(sourceUrl);
    if (!["www.511.gouv.qc.ca", "511.gouv.qc.ca"].includes(source.hostname)) return { evidence };
    const signal = AbortSignal.timeout(25_000);
    const data = JSON.parse((await fetchDocumentaryResource(new URL(ROAD_DATA_URL), signal, 8_000_000)).toString());
    const segment = selectRoadSegment(data, facts);
    if (!segment) { evidence.reason = "No unique official segment matches the cited location, direction and dates"; return { evidence }; }
    const detailId = source.searchParams.get("idChantier");
    if (detailId && detailId !== segment.id) { evidence.reason = "Source notice ID conflicts with cited evidence"; return { evidence }; }
    evidence.segment = segment;
    const bytes = await renderOpenMap({kind:"line",name:segment.location,points:segment.coordinates as [number,number][]});
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
    return JSON.stringify(selectRoadSegment(data, facts)) === JSON.stringify(evidence.segment);
  } catch { return false; }
}
