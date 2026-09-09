import type {CarouselPlan} from "./carousel-narrative";
import type {CreativeKeyFact, CreativeQualityIssue, GeneratedCreativeDraft} from "./creative-content.types";

const normalized=(value:string)=>value.normalize("NFKD").replace(/\p{M}/gu,"").replace(/[‐‑‒–—]/gu,"-").toLowerCase();
const proposal=/\b(?:projet de reglement|projet de resolution|demande vise|propose[ds]?|proposal|proposed|solicitud|proyecto de|vise a autoriser)\b/iu;
const actions=[
  {name:"demolition",pattern:/\b(?:demolitions?|demolir|demolish\w*|demolicion)\b/iu},
  {name:"parking",pattern:/\b(?:stationnement|parking|estacionamiento)\b/iu},
  {name:"indoor recreation",pattern:/\b(?:jeux? interieur\w*|loisirs? interieur\w*|amusement interieur|guerre interieur|golf interieur|indoor (?:games?|recreation|amusement))\b/iu},
  {name:"housing",pattern:/\b(?:habitation|housing|vivienda|logements?)\b/iu},
];
/** Conservative relation checks for administrative proposals. No geocoding:
 * only named anchors present together with the action in a cited excerpt count.
 */
function anchors(value:string):string[]{
  const zones=value.match(/\b[A-Z]{1,3}[‐‑‒–—-]\d{3,5}\b/gu)??[];
  const streets=[...value.matchAll(/\b(?:rue|avenue|boulevard|chemin|calle|street|road)\s+(?:\d+(?:e|re|th|st)?\s+)?[\p{Lu}][\p{L}\p{N}’'‐‑‒–—-]*(?:\s+[\p{Lu}][\p{L}’'‐‑‒–—-]*)*/gu)].map(match=>match[0]);
  const numbered=[...value.matchAll(/\b\d+(?:[‐‑‒–—-]\d+)?\s*,?\s*\d+(?:e|re|th|st)\s+(?:Avenue|avenue|Street|street)\b/gu)].map(match=>match[0]);
  const numberedStreets=[...value.matchAll(/\b\d+(?:e|re|th|st)\s+(?:Avenue|avenue|Street|street)\b/gu)].map(match=>match[0]);
  const civicNumbers=numbered.map(address=>"civic:"+address.match(/^\d+(?:[‐‑‒–—-]\d+)?/u)![0]);
  if(numberedStreets.length){
    for(const match of value.matchAll(/\bau\s+(\d+(?:[‐‑‒–—-]\d+)?)(?=[.,;!?]|$)/gu))civicNumbers.push("civic:"+match[1]);
  }
  // Compare street and civic number regardless of their order in the sentence.
  return [...new Set([...zones,...streets,...civicNumbers,...numberedStreets,...numbered.map(address=>address.replace(/^\d+(?:[‐‑‒–—-]\d+)?\s*,?\s*/u,""))].map(value=>normalized(value).replace(/-/gu," ")))];
}
export function administrativeProjectIssues(draft:GeneratedCreativeDraft,facts:readonly CreativeKeyFact[]):CreativeQualityIssue[]{
  const evidence=(fact:CreativeKeyFact)=>fact.sourceExcerpt?.trim()||fact.statement;
  if(!facts.some(fact=>proposal.test(normalized(evidence(fact)))))return [];
  const issues:CreativeQualityIssue[]=[];
  function check(fields:(string|undefined)[],selected:readonly CreativeKeyFact[],unitOrder?:number){
    const sources=selected.map(fact=>({copy:normalized(evidence(fact)),anchors:anchors(evidence(fact))}));
    const allSource=sources.map(s=>s.copy).join(" ");
    const allAnchors=anchors(fields.filter(Boolean).join(" "));
    const add=(code:string,message:string)=>{
      if(!issues.some(issue=>issue.code===code&&issue.unitOrder===unitOrder))issues.push({code,severity:"blocker",...(unitOrder===undefined?{}:{unitOrder}),message});
    };
    // Sentence / explicit contrast boundaries separate independently attributed
    // dossiers. Never split a bare "and": it can assert a false relationship.
    const clauses=(text:string)=>text.split(/(?<=[.!?;])\s+|,?\s+(?:tandis qu[’']|pendant qu[’']|parallèlement,?\s+)|\s+et\s+(?=à l[’']ouest)/iu).filter(Boolean);
    const allClauses=fields.filter((field):field is string=>!!field).flatMap(clauses);
    for(const field of allClauses){
      if(!field)continue;
      const copy=normalized(field);
      const localAnchors=anchors(field);
      for(const action of actions){
        if(!action.pattern.test(copy))continue;
        const relevant=sources.filter(source=>action.pattern.test(source.copy));
        if(!relevant.length){add("PROJECT_ACTION_UNSUPPORTED",`The cited excerpts do not support the ${action.name} claim.`);continue;}
        const attributedElsewhere=allClauses.some(clause=>{
          if(!action.pattern.test(normalized(clause)))return false;
          const named=anchors(clause);
          return named.length>0 && named.every(anchor=>relevant.some(source=>source.anchors.includes(anchor)));
        });
        // An unlocated overview can refer to the explicitly attributed body.
        // An orphan claim still cannot borrow a different project's address.
        const locations=localAnchors.length?localAnchors:attributedElsewhere?[]:allAnchors;
        if(locations.length && !locations.some(anchor=>relevant.some(source=>source.anchors.includes(anchor)))){
          add("PROJECT_LOCATION_MISMATCH",`The ${action.name} claim is not linked to this location in its cited excerpt. Keep separate projects separate; recover the source heading or omit the location.`);
        } else if(localAnchors.some(anchor=>!relevant.some(source=>source.anchors.includes(anchor)))){
          add("PROJECT_LOCATION_MISMATCH",`A location in the ${action.name} statement belongs to a different or unidentified project.`);
        }
      }
      if(proposal.test(allSource) && /\b(?:autorise|autorisent|seront allegees|seront demolis|sera demoli|transformeront|will be demolished|will transform|seran demolidos)\b/iu.test(copy)
        && !/\b(?:deja autorise|a ete autorise|has been approved|was approved|ya aprobado)\b/iu.test(allSource)){
        add("PROJECT_STATUS_UPGRADE","The source describes a proposal or authorization request, not an adopted or completed change. Preserve its status.");
      }
      if(/\b(?:ratio|normes|requirements|requisitos)\b/iu.test(allSource)
        && /\b(?:suppression|supprim\w*|retir\w*|remov\w*|elimin\w*)\b.{0,55}\b(?:places|cases|spaces|plazas)\b/iu.test(copy)
        && !/\b(?:suppression|supprim\w*|retir\w*|remov\w*|elimin\w*)\b.{0,55}\b(?:places|cases|spaces|plazas)\b/iu.test(allSource)){
        add("PARKING_REQUIREMENT_AS_PHYSICAL_CHANGE","A lower parking requirement does not establish removal of existing parking spaces.");
      }
      for(const pattern of [/\bimpact se ressent deja\b/iu,/\bcommercants devront adapter\b/iu,/\binscrivez[ -]vous\b/iu]){
        if(pattern.test(copy)&&!pattern.test(allSource))add("PROJECT_CONSEQUENCE_UNSUPPORTED","The source does not establish this current impact, obligation or registration instruction.");
      }
    }
  }
  check([draft.concept,draft.caption,draft.altText,draft.callToAction],facts);
  draft.units.forEach((unit,index)=>{
    const selected=facts.filter(fact=>unit.factIds.includes(fact.id));
    // A planned participation question needs the event evidence, not just the
    // zoning facts. Keep this editorial omission distinct from false claims.
    if(unit.role==="conclusion" && /\b(?:consultation|citoyens|participat\w*)\b/iu.test(normalized(unit.viewerQuestion??""))){
      const eventFacts=facts.filter(fact=> /\b(?:consultation publique|public consultation|consulta publica)\b/iu.test(normalized(evidence(fact))) && /\d/u.test(evidence(fact)));
      if(eventFacts.length && !selected.some(fact=>eventFacts.includes(fact))){
        issues.push({code:"PUBLIC_PARTICIPATION_CLOSING_MISSING",severity:"warning",unitOrder:unit.order,message:"The closing asks about public participation but omits the dated consultation evidence. Include the supported date and venue and cite the event fact."});
      }
    }

    check([unit.headline,unit.subheadline,unit.body,unit.ctaQuestion,unit.visualDirection],selected,unit.order);
    const next=draft.units[index+1];
    check([unit.continuationCue],facts.filter(fact=>unit.factIds.includes(fact.id)||next?.factIds.includes(fact.id)),unit.order);
  });
  return issues;
}

/** Repair only an explicit participation question with one unambiguous dated
 * consultation fact. Multiple appointments require editorial disambiguation. */
export function repairPublicParticipationPlan(plan:CarouselPlan,facts:readonly CreativeKeyFact[]):CarouselPlan{
  const closing=plan.slides.at(-1);
  if(!closing || !/\b(?:consultation|citoyens|participat\w*)\b/iu.test(normalized(closing.viewerQuestion)))return plan;
  const events=facts.filter(fact=>{
    const text=fact.sourceExcerpt?.trim();
    return !!text && /\b(?:consultation publique|public consultation|consulta publica)\b/iu.test(normalized(text)) && /\d/u.test(text);
  });
  if(events.length!==1 || closing.allowedFactIds.includes(events[0].id))return plan;
  return {...plan,slides:plan.slides.map((slide,index)=>index===plan.slides.length-1?{...slide,allowedFactIds:[events[0].id]}:slide)};
}
