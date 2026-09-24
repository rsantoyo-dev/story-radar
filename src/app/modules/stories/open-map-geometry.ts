export type GeoPoint = [number, number]; // longitude, latitude
/** `legend` is official source wording shown under the map (closure type, named detour); it never adds geometry. */
export type MapTarget = { points: GeoPoint[]; kind: "point" | "line"; name: string; context?: "venue" | "city"; legend?: string };
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
  const line = target.kind === "line";
  // A segment must stay visible between the title band (0–44) and the legend
  // or attribution bands at the bottom; a point is centred as before.
  const bands = line ? { top: 44, bottom: target.legend?.trim() ? 386 : 423 } : { top: 0, bottom: 460 };
  const pad = line ? 200 : 150;
  const height = Math.max(target.kind === "point" && target.context !== "city" ? 400 : 1200, (Math.max(...ys)-Math.min(...ys)+pad)*460/(bands.bottom-bands.top), (Math.max(...xs)-Math.min(...xs)+pad)*460/944);
  const width = height*944/460;
  // A verified segment may run several km along one axis (a 5.8 km stretch of
  // the A-15 needs a 17 km wide landscape frame once the bands are excluded);
  // it is drawn with major roads only past MAJOR_ROADS_FROM_WIDTH, so the
  // wider bound stays within the response limits. Points keep the tighter
  // neighbourhood bound.
  if (width > (line ? 18000 : 12000)) throw new Error("Place extent exceeds bounded local map coverage");
  // Shift the geographic centre so the geometry's midpoint lands mid-window.
  const center: GeoPoint = [(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2-(230-(bands.top+bands.bottom)/2)*height/460];
  const sw = unproject([center[0]-width/2,center[1]-height/2]), ne=unproject([center[0]+width/2,center[1]+height/2]);
  if (sw[0] < -180 || ne[0] > 180) throw new Error("Antimeridian extent requires another map provider");
  return { bbox: [sw[1],sw[0],ne[1],ne[0]], width, pixel: (p: GeoPoint): GeoPoint => {const xy=project(p);return [(xy[0]-center[0])/width*944+472,230-(xy[1]-center[1])/height*460];} };
}
/** Above this frame width a 944 px map cannot show residential streets legibly (≥ 8.5 m per pixel). */
export const MAJOR_ROADS_FROM_WIDTH = 8000;
export function openMapQuery(target: MapTarget): string {
  const viewport=mapViewport(target);
  const bbox=viewport.bbox.join(",");
  const major = viewport.width > MAJOR_ROADS_FROM_WIDTH;
  const highways = major ? "motorway|trunk|primary|secondary" : "motorway|trunk|primary|secondary|tertiary|residential|living_street|unclassified";
  const waterways = major ? `way["waterway"~"^(river|canal|riverbank)$"](${bbox});` : `way["waterway"](${bbox});`;
  // "tags geom(bbox)": tags and geometry clipped to the frame, without the
  // node-id lists and bounds the renderer never reads (about 20% fewer bytes
  // on a 13 km frame, measured live).
  return `[out:json][timeout:12][maxsize:8388608];(way["highway"~"^(${highways})(_link)?$"](${bbox});${waterways}way["natural"="water"](${bbox}););out tags geom(${bbox});`;
}
