import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import * as geometry from "./open-map-geometry";
import { mentionsForUnit, visualEvidenceCurrent, PLACE_VISUAL_VERSION } from "./creative-place-visual";
import type { CreativeUnit, CreativeKeyFact } from "./creative-content.types";

test("open map geometry supports independent worldwide targets, preserves center and bounds requests", () => {
  for (const point of [[2.35,48.85],[139.76,35.68],[-58.38,-34.60],[18.42,-33.93]] as geometry.GeoPoint[]) {
    const target: geometry.MapTarget={kind:"point",name:"Place",points:[point]};
    const viewport=geometry.mapViewport(target);
    assert.deepEqual(viewport.pixel(point),[472,230]);
    assert.match(geometry.openMapQuery(target), /out geom/);
    assert.ok(viewport.bbox[0]<point[1] && viewport.bbox[2]>point[1]);
    assert.ok(viewport.bbox[1]<point[0] && viewport.bbox[3]>point[0]);
  }
  for (const points of [[],[[0,90]],[[NaN,0]],[[180,0]]] as geometry.GeoPoint[][]) assert.throws(()=>geometry.mapViewport({kind:"point",name:"Invalid",points}));
  assert.throws(()=>geometry.mapViewport({kind:"line",name:"Invalid",points:[[0,0]]}));
  assert.throws(()=>geometry.mapViewport({kind:"line",name:"Too far",points:[[0,0],[5,5]]}));
});

test("local OSM renderer validates responses and produces a real 944x460 map", async () => {
  const exports: Partial<typeof import("./open-map-render")>={};
  const source=readFileSync("src/app/modules/stories/open-map-render.ts","utf8");
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  runInNewContext(code,{exports,Map,Buffer,require:(name:string)=>{
    if(name==="sharp")return sharp;
    if(name==="./open-map-geometry")return geometry;
    if(name==="./creative-documentary")return {record:(v:unknown)=>v!==null&&typeof v==="object"&&!Array.isArray(v)};
    if(name==="./creative-documentary-render")return {escapeDocumentaryText:(v:string)=>v.replaceAll("&","&amp;").replaceAll("<","&lt;")};
    return {};
  }});
  const target:geometry.MapTarget={kind:"point",name:"Paris",points:[[2.35,48.85]]};
  for(const data of [{elements:[]},{remark:"timeout",elements:[]},{elements:[{type:"way",tags:{highway:"road"},geometry:[{lon:NaN,lat:48}]}]}]) await assert.rejects(()=>exports.drawOpenMap!(data,target));
  const bytes=await exports.drawOpenMap!({elements:[{type:"way",tags:{highway:"residential",name:"Rue <exemple>"},geometry:[{lon:2.345,lat:48.85},{lon:2.355,lat:48.85}]}]},target);
  const meta=await sharp(bytes).metadata();assert.equal(meta.width,944);assert.equal(meta.height,460);
  const raw=await sharp(bytes).removeAlpha().raw().toBuffer();const center=(230*944+472)*3;
  assert.equal(raw[center],199); // verified target marker, no generated cartography
});

test("each slide selects only its cited named event and expires visual evidence", () => {
  const unit={factIds:["a"]} as CreativeUnit;
  const facts=[{id:"a",sourceExcerpt:"Concert à Paris"},{id:"b",sourceExcerpt:"Visite à Tokyo"}] as CreativeKeyFact[];
  const mentions=["Paris","Tokyo"].map(name=>({name,kind:"named" as const,role:"event" as const,excerpt:name,municipality:"",region:"",country:""}));
  assert.deepEqual(mentionsForUnit(unit,facts,mentions).map(m=>m.name),["Paris"]);
  const now=Date.now();const evidence: import("./creative-place-visual").PlaceVisualEvidence={version:PLACE_VISUAL_VERSION,representation:"map" as const,preparedAt:new Date(now).toISOString(),reasons:[],sha256:"hash",attribution:geometry.OSM_ATTRIBUTION};
  assert.equal(visualEvidenceCurrent(evidence,now),true);
  assert.equal(visualEvidenceCurrent(evidence,now+86400000),false);
  assert.equal(visualEvidenceCurrent({...evidence,sha256:undefined},now),false);
});
