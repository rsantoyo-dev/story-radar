import { validateCarouselPlan } from "./carousel-narrative";
import assert from "node:assert/strict";
import test from "node:test";
import {roadNoticeRecords,completeRoadNoticeExcerpt,select511Notice,build511Brief,recover511CarouselPlan} from "./road-notice-evidence";
import {repairBriefFactEvidence, deterministicBriefFactQualityIssues} from "./creative-fact-guard";
import type {GeneratedCreativeBrief} from "./creative-content.types";
const row=(location:string,direction:string,end:string)=>`35\n\n${location}\n\nEntrave\n\nMajeure\n\nDirection\n\n${direction}\n\nDu 8 septembre 2026 à 7 h au ${end}`;
const seb="À Saint-Sébastien, entre les km 20 et 17", jean="À Saint-Jean-sur-Richelieu, entre la sortie 39 (R-104) et la R-104";
const source=row(seb,"Sud","9 octobre 2026 à 17 h")+'\n\n'+row(jean,"Sud et nord","31 octobre 2026 à 6 h");
test("511 records retain route, direction and their own end date",()=>{
 assert.equal(roadNoticeRecords(source).length,2);
 assert.match(completeRoadNoticeExcerpt(seb,source)!,/9 octobre/);
 assert.doesNotMatch(completeRoadNoticeExcerpt(seb,source)!,/31 octobre/);
 assert.match(completeRoadNoticeExcerpt(jean,source)!,/31 octobre/);
});
test("brief evidence repair expands a uniquely identified table row instead of stripping dates",()=>{
 const brief={keyFacts:[{id:"fact-1",statement:"Fermeture partielle jusqu'au 9 octobre",sourceExcerpt:seb}],contentSufficiency:"limited",riskFlags:[]} as unknown as GeneratedCreativeBrief;
 const result=repairBriefFactEvidence(brief,source);
 assert.match(result.keyFacts[0].statement,/Entrave Majeure Direction Sud/);
 assert.match(result.keyFacts[0].statement,/9 octobre/);
 assert.doesNotMatch(result.keyFacts[0].statement,/Fermeture partielle/);
 assert.ok(source.includes(result.keyFacts[0].sourceExcerpt!));
});
test("repeated locations and truncated table rows cannot supply invented evidence",()=>{
 assert.equal(completeRoadNoticeExcerpt(seb,source+'\n\n'+row(seb,"Nord","10 octobre 2026 à 8 h")),undefined);
 assert.equal(completeRoadNoticeExcerpt(seb,`35\n\n${seb}\n\nEntrave`),undefined);
 assert.equal(completeRoadNoticeExcerpt(seb,row(seb,"Sud","9 octobre 2026 à 17 h").split(" au ")[0]),undefined);
});

test("regional 511 selection uses an unambiguous route and end date, not a nearby municipality guess",()=>{
 const title="Fermeture partielle de l’autoroute 35 près de Saint-Jean-sur-Richelieu jusqu’au 9 octobre";
 assert.equal(select511Notice("https://www.511.gouv.qc.ca/fr/Diffusion/EtatReseau/Region.aspx?id=11000",title,source),roadNoticeRecords(source)[0]);
 assert.equal(select511Notice("https://example.com",title,source),undefined);
 assert.equal(select511Notice("https://www.511.gouv.qc.ca",title,source+'\n\n'+row(jean,"Nord","9 octobre 2026 à 17 h")),undefined);
});

 test("flattened provider citations recover the exact record including its route",()=>{
 const excerpt=roadNoticeRecords(source)[0].replace(/^35\s+/, "").replace(/\s+/g," ");
 const brief={keyFacts:[{id:"fact-1",statement:"Une entrave bloque autoroute 35",sourceExcerpt:excerpt}],contentSufficiency:"limited",riskFlags:[]} as unknown as GeneratedCreativeBrief;
 const result=repairBriefFactEvidence(brief,source);
 assert.equal(result.keyFacts[0].sourceExcerpt,roadNoticeRecords(source)[0]);
 assert.match(result.keyFacts[0].statement,/^35 /);
 assert.doesNotMatch(result.keyFacts[0].statement,/bloque/);
 });
 test("structured official brief stays within one complete notice",()=>{
 const brief=build511Brief("https://www.511.gouv.qc.ca", "autoroute 35 jusqu’au 9 octobre",source,"Local readers")!;
 assert.equal(brief.keyFacts.length,3);
 assert.deepEqual(deterministicBriefFactQualityIssues(brief,source),[]);
 assert.doesNotMatch(brief.keyMessage,/31 octobre|fermeture|Saint-Jean/i);
 assert.equal(build511Brief("https://example.com", "autoroute 35 jusqu’au 9 octobre",source,"Local readers"),undefined);
 });

test("structured notices provide valid carousel plans and recover only their legacy format", () => {
 const brief=build511Brief("https://www.511.gouv.qc.ca", "autoroute 35 jusqu’au 9 octobre",source,"Local readers")!;
 assert.ok(brief.carouselPlan);
 assert.deepEqual(validateCarouselPlan(brief.carouselPlan, new Set(brief.keyFacts.map(f=>f.id))), []);
 assert.deepEqual(recover511CarouselPlan("quebec511", "structured-notice-v1", brief.keyFacts), brief.carouselPlan);
 assert.equal(recover511CarouselPlan("gemini", "structured-notice-v1", brief.keyFacts), undefined);
 assert.equal(recover511CarouselPlan("quebec511", "structured-notice-v1", brief.keyFacts.slice(0,2)), undefined);
});
