import test from "node:test";
import assert from "node:assert/strict";
import data from "./fixtures/quebec-road-35.json";
import { selectRoadSegment } from "./quebec-road-map";
const fact = { id: "fact-1", statement: "Entrave majeure", sourceExcerpt: "35\nÀ Saint-Jean-sur-Richelieu, entre la sortie 39 (R-104) et la R-104\nEntrave\nMajeure\nDirection\nSud et nord\nDu 21 juin 2026 à 20 h au 31 octobre 2026 à 6 h" };
test("matches the actual 168598 notice without borrowing Saint-Sebastien dates", () => {
 const segment = selectRoadSegment(data, [fact]);
 assert.equal(segment?.id, "168598");
 assert.equal(selectRoadSegment(data, [{ ...fact, sourceExcerpt: fact.sourceExcerpt.replace("31 octobre", "9 octobre") }]), undefined);
 assert.equal(selectRoadSegment(data, [{ ...fact, sourceExcerpt: fact.sourceExcerpt.replace("Sud et nord", "Sud") }]), undefined);
 assert.equal(selectRoadSegment({ ...data, numberMatched: 9999 }, [fact]), undefined);
});
test("rejects ambiguous and invalid geometry", () => {
 const feature = data.features.find(f => f.properties.identifiant === "168598")!;
 assert.equal(selectRoadSegment({ type: "FeatureCollection", numberMatched: 2, features: [feature, feature] }, [fact]), undefined);
 assert.equal(selectRoadSegment({ type: "FeatureCollection", numberMatched: 1, features: [{ ...feature, geometry: {type: "LineString", coordinates: [[0,0],[1,1]]} }] }, [fact]), undefined);
});
