import assert from "node:assert/strict";
import test from "node:test";
import {administrativeProjectIssues,repairPublicParticipationPlan} from "./creative-project-grounding";
import {deterministicFactQualityIssues} from "./creative-fact-guard";
import type {CreativeKeyFact,GeneratedCreativeDraft} from "./creative-content.types";
const fact=(id:string,text:string):CreativeKeyFact=>({id,statement:text,sourceExcerpt:text});
const facts=[
  fact("games","Le projet de règlement vise à autoriser un parc d’amusement intérieur dans la zone C-1081, le long de la rue Saint-Jacques."),
  fact("parking","Le projet de règlement vise à autoriser dans la zone H-1118 un ratio de cases de stationnement inférieur aux normes en vigueur. Cette zone est située à l’ouest de la rue Laurier."),
  fact("demolition","415-417, 9e Avenue. La demande vise à autoriser la démolition du bâtiment principal."),
  fact("housing","Le projet de résolution vise à autoriser un projet d’habitation au 124, rue Collin et aux 117-119, rue Frontenac."),
];
function draft(headline:string,body="",ids=facts.map(f=>f.id)):GeneratedCreativeDraft{
  return {concept:"Consultation",caption:"Des projets à examiner.",hashtags:[],altText:"Cartes de dossiers.",units:[{
    order:1,type:"carousel-slide",role:"cover",editorialGoal:"hook",headline,body,visualDirection:"Cartes abstraites.",
    factIds:ids,assetRequest:"typography-only",aspectRatio:"4:5",characterIds:[]
  }]};
}
const codes=(value:GeneratedCreativeDraft,evidence=facts)=>administrativeProjectIssues(value,evidence).map(issue=>issue.code);
test("parking cannot move to the indoor recreation zone through combined fact IDs",()=>{
  const value=draft("Moins de stationnement sur la rue Saint-Jacques","Le projet vise la zone C-1081.",["games","parking"]);
  assert.ok(codes(value).includes("PROJECT_LOCATION_MISMATCH"));
  assert.ok(deterministicFactQualityIssues(value,facts).some(issue=>issue.code==="PROJECT_LOCATION_MISMATCH"&&issue.severity==="blocker"));
});
test("demolition cannot borrow housing addresses or an orphan main-building excerpt",()=>{
  const value=draft("Les bâtiments ciblés par les démolitions","124 rue Collin, 117-119 rue Frontenac.",["demolition","housing"]);
  assert.ok(codes(value).includes("PROJECT_LOCATION_MISMATCH"));
  const orphan=facts.map(f=>f.id==="demolition"?fact(f.id,"La demande vise à autoriser la démolition du bâtiment principal."):f);
  assert.ok(codes(value,orphan).includes("PROJECT_LOCATION_MISMATCH"));
});
test("the cited excerpt, not an expanded fact statement, establishes the location",()=>{
  const expanded=facts.map(f=>f.id==="housing"?{...f,statement:f.statement+" et rue Douglas."}:f);
  assert.ok(codes(draft("Un projet d’habitation rue Douglas","",["housing"]),expanded).includes("PROJECT_LOCATION_MISMATCH"));
});
test("proposals do not establish adoption, removed spaces, present impact or registration",()=>{
  assert.ok(codes(draft("Les règles seront allégées","",["parking"])).includes("PROJECT_STATUS_UPGRADE"));
  assert.ok(codes(draft("Suppression de places de stationnement","",["parking"])).includes("PARKING_REQUIREMENT_AS_PHYSICAL_CHANGE"));
  assert.ok(codes(draft("L’impact se ressent déjà","",["parking"])).includes("PROJECT_CONSEQUENCE_UNSUPPORTED"));
  assert.ok(codes(draft("Inscrivez-vous","",["housing"])).includes("PROJECT_CONSEQUENCE_UNSUPPORTED"));
});
test("qualified separate projects and supported registration remain usable",()=>{
  assert.deepEqual(codes(draft("Un ratio de stationnement inférieur est proposé","Le projet vise la zone H-1118 à l’ouest de la rue Laurier.",["parking"])),[]);
  assert.deepEqual(codes(draft("Une demande de démolition au 415-417, 9e Avenue","",["demolition"])),[]);
  assert.deepEqual(codes(draft("Un projet d’habitation au 124 rue Collin","et aux 117-119 rue Frontenac.",["housing"])),[]);
  assert.deepEqual(codes(draft("Inscrivez-vous","",["housing"]),[fact("housing","Pour la consultation du projet de résolution, inscrivez-vous.")]),[]);
});

test("a participation closing must select the dated consultation evidence",()=>{
  const event=fact("event","Une consultation publique est à l’horaire le 14 septembre à l’hôtel de ville.");
  const value=draft("De nouveaux espaces de loisirs en vue","",["games"]);
  value.units[0].role="conclusion";
  value.units[0].viewerQuestion="Comment et quand les citoyens peuvent-ils participer?";
  assert.ok(codes(value,[...facts,event]).includes("PUBLIC_PARTICIPATION_CLOSING_MISSING"));
  value.units[0].factIds.push("event");
  assert.ok(!codes(value,[...facts,event]).includes("PUBLIC_PARTICIPATION_CLOSING_MISSING"));
  assert.ok(!codes(value,facts).includes("PUBLIC_PARTICIPATION_CLOSING_MISSING"));
});

test("separate attributed clauses do not transfer parking to the recreation street",()=>{
  const value=draft("Des propositions à examiner","Le projet prévoit des loisirs intérieurs sur la rue Saint-Jacques, tandis qu’à l’ouest de la rue Laurier, un ratio de stationnement inférieur aux normes est proposé.",["games","parking"]);
  assert.deepEqual(codes(value),[]);
  value.units[0].body="Un ratio de stationnement inférieur est proposé sur la rue Saint-Jacques. Les loisirs intérieurs sont proposés rue Laurier.";
  assert.ok(codes(value).includes("PROJECT_LOCATION_MISMATCH"));
});
test("separate parking and demolition dossiers support an unlocated overview",()=>{
  const value=draft("Stationnement et démolition demandée","À l’ouest de la rue Laurier, un projet vise un ratio de stationnement inférieur aux normes. Sur la 9e Avenue, une demande vise à autoriser la démolition du bâtiment principal au 415-417.",["parking","demolition"]);
  assert.deepEqual(codes(value),[]);
  value.units[0].body="Sur la 9e Avenue, une demande vise à autoriser la démolition au 999.";
  assert.ok(codes(value).includes("PROJECT_LOCATION_MISMATCH"));
  value.units[0].body="Une demande vise à autoriser la démolition rue Laurier. Le stationnement concerne la 9e Avenue.";
  assert.ok(codes(value).includes("PROJECT_LOCATION_MISMATCH"));
});

test("a public participation plan receives the actual event fact without guessing between events",()=>{
  const plan={slideCount:3 as const,rationale:"Public meeting",slides:[
    {editorialGoal:"hook" as const,viewerQuestion:"Quels projets?",allowedFactIds:["games"]},
    {editorialGoal:"explain" as const,viewerQuestion:"Quels usages?",allowedFactIds:["games"]},
    {editorialGoal:"conclude" as const,viewerQuestion:"Quand et où les citoyens peuvent-ils participer?",allowedFactIds:["games"]}
  ]};
  const event=fact("event","Une consultation publique est à l’horaire le 14 septembre à l’hôtel de ville.");
  assert.deepEqual(repairPublicParticipationPlan(plan,[...facts,event]).slides[2].allowedFactIds,["event"]);
  assert.deepEqual(plan.slides[2].allowedFactIds,["games"]);
  assert.equal(repairPublicParticipationPlan(plan,facts),plan);
  assert.equal(repairPublicParticipationPlan(plan,[...facts,event,{...event,id:"another"}]),plan);
});

test("unlocated demolition and separately attributed zoning do not borrow each other's location",()=>{
  const evidence=[fact("demolition","La demande vise à autoriser la démolition du bâtiment principal."),fact("parking","Un projet de règlement vise à autoriser un ratio de stationnement inférieur aux normes dans la zone H-1118.")];
  const value=draft("Démolition demandée, zonage proposé","Une demande vise à autoriser la démolition du bâtiment principal. Séparément, un projet de règlement vise à autoriser des projets intégrés en zone H-1118 et un ratio de stationnement inférieur aux normes en vigueur.",["demolition","parking"]);
  value.caption="Une demande vise la démolition d’un bâtiment principal, un projet de règlement concerne la zone H-1118 et un projet d’habitation vise deux adresses.";
  evidence.push(facts.find(f=>f.id==="housing")!);
  const issues=administrativeProjectIssues(value,evidence);
  assert.ok(!issues.some(i=>i.severity==="blocker"));
  assert.ok(issues.some(i=>i.code==="PROJECT_IDENTITY_INCOMPLETE"&&i.unitOrder===1));
  value.units[0].body="Une demande vise à autoriser la démolition du bâtiment principal en zone H-1118. Séparément, le ratio de stationnement est proposé.";
  assert.ok(codes(value,evidence).includes("PROJECT_LOCATION_MISMATCH"));
});
test("committee attendance is not a demolition claim about a named venue",()=>{
  const event=fact("event","Le comité de démolition se réunit à l’hôtel de ville, rue Laurier.");
  const value=draft("Comité de démolition rue Laurier","",["event"]);
  assert.deepEqual(codes(value,[...facts,event]),[]);
  value.units[0].headline="Le comité de démolition propose la démolition rue Laurier";
  assert.ok(codes(value,[...facts,event]).includes("PROJECT_LOCATION_MISMATCH")||codes(value,[...facts,event]).includes("PROJECT_ACTION_UNSUPPORTED"));
});

test("a demolition title above housing copy still implies an unsupported relationship",()=>{
  const value=draft("Les bâtiments ciblés par les démolitions","Un projet d’habitation vise le 124 rue Collin et les 117-119 rue Frontenac.",["demolition","housing"]);
  assert.ok(codes(value).includes("PROJECT_LOCATION_MISMATCH"));
});
