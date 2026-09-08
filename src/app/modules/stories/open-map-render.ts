import "server-only";
import sharp from "sharp";
import { request } from "node:https";
import { createHash } from "node:crypto";
import { lookupPublicAddress } from "../sources/rss/fetch-rss-feed";
import { record } from "./creative-documentary";
import { escapeDocumentaryText } from "./creative-documentary-render";
import { mapViewport, openMapQuery, OSM_ATTRIBUTION, type MapTarget } from "./open-map-geometry";

const cache = new Map<string, { until: number; bytes: Buffer }>();
const pending = new Map<string, Promise<Buffer>>();
let quota = { day: "", calls: 0 };
/** No tiles, no paid API: small on-demand OSM extracts. Public-instance cap is per process. */
export async function renderOpenMap(target: MapTarget): Promise<Buffer> {
  const endpoint = process.env.CREATIVE_GEO_OVERPASS_URL || "https://overpass-api.de/api/interpreter";
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("Invalid configured map endpoint");
  const query = openMapQuery(target);
  const key = createHash("sha256").update(endpoint + JSON.stringify(target)).digest("hex");
  const hit = cache.get(key); if (hit && hit.until > Date.now()) return hit.bytes;
  const active = pending.get(key); if (active) return active;
  const work = (async () => {
    const day = new Date().toISOString().slice(0,10);
    if (quota.day !== day) quota = { day, calls: 0 };
    if (quota.calls >= 8) throw new Error("Open map daily budget exhausted");
    quota.calls++;
    url.searchParams.set("data", query);
    const body = await new Promise<Buffer>((resolve,reject) => {
      const req = request(url, { signal: AbortSignal.timeout(18_000), lookup: lookupPublicAddress, headers: { "User-Agent": `PressCraftor/0.1 (${process.env.CREATIVE_GEO_CONTACT || "local map composition"})`, "Accept-Encoding": "identity" } }, res => {
        if (res.statusCode !== 200) {res.destroy(); reject(new Error("Open map provider unavailable"));return;}
        let size=0; const chunks: Buffer[]=[];
        res.on("data", (chunk:Buffer)=>{size+=chunk.length;if(size>1_000_000)res.destroy(new Error("Open map data too large"));else chunks.push(chunk);});
        res.on("error",reject);res.on("end",()=>resolve(Buffer.concat(chunks)));
      });req.on("error",(cause)=>reject(new Error("Open map request failed", {cause})));req.end();
    });
    const bytes = await drawOpenMap(JSON.parse(body.toString()), target);
    if (cache.size >= 16) cache.delete(cache.keys().next().value!);
    cache.set(key,{until:Date.now()+30*60_000,bytes});return bytes;
  })().finally(()=>pending.delete(key));
  pending.set(key,work);return work;
}
export async function drawOpenMap(data: unknown, target: MapTarget): Promise<Buffer> {
  if (!record(data) || data.remark || !Array.isArray(data.elements) || data.elements.length > 6000) throw new Error("Incomplete map response");
  const viewport=mapViewport(target);const shapes:string[]=[];const labels:string[]=[];const placed: {x:number;y:number;width:number}[]=[];const names=new Set<string>();
  for (const element of data.elements) {
    if (!record(element) || element.type !== "way" || !Array.isArray(element.geometry) || !record(element.tags)) continue;
    const points = element.geometry.map(p => {if (!record(p) || typeof p.lon !== "number" || typeof p.lat !== "number") throw new Error("Invalid map geometry");return viewport.pixel([p.lon,p.lat]);});
    if (points.length<2 || points.length>2000) continue;
    const path=points.map(p=>`${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
    const water=Boolean(element.tags.waterway || element.tags.natural === "water");
    shapes.push(`<polyline points="${path}" fill="none" stroke="${water?"#9acbd9":"#c7c9c5"}" stroke-width="${water?3:5}" stroke-linejoin="round"/>`);
    const p=points[Math.floor(points.length/2)];
    if (labels.length<14 && typeof element.tags.name === "string" && p[0]>30 && p[1]>55 && p[1]<390 && element.tags.name.length<65) {
      const name=element.tags.name, width=name.length*8;
      if(p[0]+width<920 && !names.has(name) && !placed.some(label => Math.abs(label.y-p[1])<26 && p[0]<label.x+label.width+12 && p[0]+width+12>label.x)) {
        names.add(name);placed.push({x:p[0],y:p[1],width});
        labels.push(`<text x="${p[0]}" y="${p[1]}" font-family="sans-serif" font-size="13" fill="#34463f" paint-order="stroke" stroke="#f5f5ed" stroke-width="3">${escapeDocumentaryText(name)}</text>`);
      }
    }
  }
  if (!shapes.length) throw new Error("No usable map data");
  const points=target.points.map(viewport.pixel);
  const overlay=target.kind === "point" ? `<circle cx="${points[0][0]}" cy="${points[0][1]}" r="9" fill="#c74738" stroke="white" stroke-width="3"/>` : `<polyline points="${points.map(p=>p.join(",")).join(" ")}" fill="none" stroke="#c74738" stroke-width="6"/>`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="944" height="460"><rect width="944" height="460" fill="#f5f5ed"/>${shapes.join("")}${labels.join("")}${overlay}<rect x="0" y="423" width="944" height="37" fill="white"/><text x="12" y="446" font-family="sans-serif" font-size="14">${OSM_ATTRIBUTION}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
