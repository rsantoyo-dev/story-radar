export type GeoPoint = [number, number]; // longitude, latitude
export type MapTarget = { points: GeoPoint[]; kind: "point" | "line"; name: string };
export const OSM_ATTRIBUTION = "© OpenStreetMap contributors · openstreetmap.org/copyright";
const earth = 6378137;
export function project([lon, lat]: GeoPoint): GeoPoint {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 85) throw new Error("Unsupported coordinates");
  return [earth * lon * Math.PI / 180, earth * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];
}
export function unproject([x, y]: GeoPoint): GeoPoint { return [x / earth * 180 / Math.PI, (2 * Math.atan(Math.exp(y / earth)) - Math.PI / 2) * 180 / Math.PI]; }
export function mapViewport(target: MapTarget) {
  if ((target.kind === "line" && target.points.length < 2) || !target.points.length || target.points.length > 1000 || (target.kind === "point" && target.points.length !== 1)) throw new Error("Invalid map target");
  const points = target.points.map(project);
  const xs = points.map(p=>p[0]), ys=points.map(p=>p[1]);
  const center: GeoPoint = [(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];
  const height = Math.max(1200, Math.max(...ys)-Math.min(...ys)+500, (Math.max(...xs)-Math.min(...xs)+500)*460/944);
  const width = height*944/460;
  if (width > 12000) throw new Error("Place extent exceeds bounded local map coverage");
  const sw = unproject([center[0]-width/2,center[1]-height/2]), ne=unproject([center[0]+width/2,center[1]+height/2]);
  if (sw[0] < -180 || ne[0] > 180) throw new Error("Antimeridian extent requires another map provider");
  return { bbox: [sw[1],sw[0],ne[1],ne[0]], pixel: (p: GeoPoint): GeoPoint => {const xy=project(p);return [(xy[0]-center[0])/width*944+472,230-(xy[1]-center[1])/height*460];} };
}
export function openMapQuery(target: MapTarget): string {
  const bbox=mapViewport(target).bbox.join(",");
  return `[out:json][timeout:12][maxsize:8388608];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|living_street|unclassified)(_link)?$"](${bbox});way["waterway"](${bbox});way["natural"="water"](${bbox}););out geom;`;
}
