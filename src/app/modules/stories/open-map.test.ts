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
    assert.match(geometry.openMapQuery(target), /out tags geom\(/);
    assert.ok(viewport.bbox[0]<point[1] && viewport.bbox[2]>point[1]);
    assert.ok(viewport.bbox[1]<point[0] && viewport.bbox[3]>point[0]);
  }
  for (const points of [[],[[0,90]],[[NaN,0]],[[180,0]]] as geometry.GeoPoint[][]) assert.throws(()=>geometry.mapViewport({kind:"point",name:"Invalid",points}));
  assert.throws(()=>geometry.mapViewport({kind:"line",name:"Invalid",points:[[0,0]]}));
  assert.throws(()=>geometry.mapViewport({kind:"line",name:"Too far",points:[[0,0],[5,5]]}));
  // The official A-15 segment between the Champlain bridge and boulevard Matte
  // (MTMD row 172650) is 5.8 km north–south: accepted as a line, drawn with
  // major roads only; a short segment keeps residential streets.
  const a15: geometry.MapTarget={kind:"line",name:"A-15",points:[[-73.494404,45.466437],[-73.490699,45.429629]]};
  assert.ok(geometry.mapViewport(a15).width>geometry.MAJOR_ROADS_FROM_WIDTH);
  // Both ends stay inside the window between the title band and the bottom bands.
  for (const legend of [undefined,"Route fermée"]) {
    const viewport=geometry.mapViewport({...a15,...(legend?{legend}:{})});
    const ys=a15.points.map(p=>viewport.pixel(p)[1]);
    assert.ok(Math.min(...ys)>=44 && Math.max(...ys)<=(legend?386:423), `${legend}: ${ys.join(",")}`);
  }
  assert.match(geometry.openMapQuery(a15),/\^\(motorway\|trunk\|primary\|secondary\)\(_link\)\?\$/);
  assert.match(geometry.openMapQuery(a15),/"waterway"~"\^\(river\|canal\|riverbank\)\$"/);
  const short: geometry.MapTarget={kind:"line",name:"Short",points:[[-73.494404,45.466437],[-73.494404,45.448]]};
  assert.ok(geometry.mapViewport(short).width<=geometry.MAJOR_ROADS_FROM_WIDTH);
  assert.match(geometry.openMapQuery(short),/residential/);
  assert.match(geometry.openMapQuery(short),/way\["waterway"\]\(/);
  assert.throws(()=>geometry.mapViewport({kind:"line",name:"Too long",points:[[-73.494404,45.5],[-73.494404,45.36]]}));
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
  // An official legend adds a white band under the map and nothing else; the
  // band sits below the label zone and above the attribution.
  const way={elements:[{type:"way",tags:{highway:"residential",name:"Rue"},geometry:[{lon:2.345,lat:48.85},{lon:2.355,lat:48.85}]}]};
  const plain=await sharp(await exports.drawOpenMap!(way,target)).removeAlpha().raw().toBuffer();
  const legend=await sharp(await exports.drawOpenMap!(way,{...target,legend:"Route fermée · Détour : Sortie 75 <b>"})).removeAlpha().raw().toBuffer();
  const band=(400*944+900)*3;
  assert.equal(plain[band],245);assert.equal(legend[band],255);
  assert.equal(legend[center],plain[center]);
  assert.equal((await exports.drawOpenMap!(way,{...target,legend:"   "})).equals(await exports.drawOpenMap!(way,target)),true);
  // Frame-clipped geometry (out geom(bbox)) marks outside nodes as null: the
  // way is drawn as two runs with a real gap, not bridged by a chord.
  const clipped={elements:[{type:"way",tags:{highway:"primary",name:"Rue coupée"},geometry:[{lon:2.345,lat:48.85},{lon:2.348,lat:48.85},null,{lon:2.352,lat:48.85},{lon:2.355,lat:48.85}]}]};
  const gap=await sharp(await exports.drawOpenMap!(clipped,target)).removeAlpha().raw().toBuffer();
  assert.equal(gap[(230*944+172)*3],199); // first run
  assert.equal(gap[(230*944+412)*3],245); // the gap stays background
  await assert.rejects(()=>exports.drawOpenMap!({elements:[{type:"way",tags:{highway:"primary"},geometry:[null,null]}]},target),/No usable map data/);
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
