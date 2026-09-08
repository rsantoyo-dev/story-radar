import type { CreativeKeyFact, GeneratedCreativeBrief } from "./creative-content.types";
/** Extract whole labelled table records, preserving verbatim evidence and row boundaries. */
export function roadNoticeRecords(source: string): string[] {
  return [...source.matchAll(/(?:^|\n)[ \t]*(\d{1,3}[ \t]*\n\s*[^\n]+(?:\n(?!\s*Entrave\b)[^\n]+)?\s*\n\s*Entrave\s*\n\s*(?:Majeure|Mineure)\s*\n\s*Direction\s*\n\s*(?:Sud|Nord|Est|Ouest)(?:\s+et\s+(?:sud|nord|est|ouest))?\s*\n\s*Du[^\n]+(?:\n\s*au[^\n]+)?)/gi)]
    .map(match => match[1].trim()).filter(record => record.length <= 500 && /\bau\s+\d/.test(record) && (record.match(/\b20\d{2}\b/g)?.length ?? 0) >= 2);
}

/** A repeated location can belong to two directions/date ranges: never guess which. */
export function completeRoadNoticeExcerpt(excerpt: string, source: string): string | undefined {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const matches = roadNoticeRecords(source).filter(record => normalize(record).includes(normalize(excerpt)));
  return matches.length === 1 ? matches[0] : undefined;
}

/** Scope a regional 511 page to an unambiguous route + end-date mention. */
export function select511Notice(url: string, title: string, source: string): string | undefined {
  try { if (!['www.511.gouv.qc.ca','511.gouv.qc.ca'].includes(new URL(url).hostname)) return; } catch { return; }
  const route = title.match(/(?:autoroute|route|A-)\s*(\d{1,3})\b/i)?.[1];
  const until = title.match(/jusqu[’']?(?:au|à|a)\s*(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)/i);
  if (!route || !until) return;
  const records = roadNoticeRecords(source).filter(record => record.startsWith(route+'\n') &&
    new RegExp(`\\bau\\s+${Number(until[1])}\\s+${until[2]}\\b`,'i').test(record));
  return records.length === 1 ? records[0] : undefined;
}


export function build511Brief(url: string, title: string, source: string, audience: string): GeneratedCreativeBrief | undefined {
  const record = select511Notice(url, title, source);
  if (!record) return;
  const lines = record.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const headline = `Route ${lines[0]} — ${lines[1]}`;
  const event = record.slice(record.indexOf("Entrave"), record.indexOf("Du ")).replace(/\s+/g," ").trim();
  const period = record.slice(record.indexOf("Du ")).replace(/\s+/g," ").trim();
  const keyFacts = [headline,event,period].map((statement,index) => ({id:`fact-${index+1}`,statement,sourceExcerpt:record}));
  return { recommendedFormat: "meme", fallbackFormat: "carousel", formatScores: [], confidence: 0,
    targetAudience: audience, keyMessage: `${headline}. ${event}. ${period}`,
    angle: "Notice routière officielle : lieu, entrave, direction et période du même registre.", hook: headline,
    tone: { primary: "informative", energy: 0, humor: 0, reason: "Structured official source" },
    contentSufficiency: "limited",
    keyFacts,
    carouselPlan: recover511CarouselPlan("quebec511", "structured-notice-v1", keyFacts),
    riskFlags: ["Entrave majeure ne précise pas à elle seule le nombre de voies fermées. Ne pas mélanger avec les autres notices de la page régionale.", "La source est dynamique : vérifier la période avant publication. Une photographie de lieu ne prouve pas son état actuel."],
    suggestedConcepts: [] };
}

/** Compatibility for structured-notice-v1 briefs saved before plans were included. */
export function recover511CarouselPlan(provider: string, model: string, facts: CreativeKeyFact[]): GeneratedCreativeBrief["carouselPlan"] {
  if (provider !== "quebec511" || model !== "structured-notice-v1" || facts.length !== 3 ||
      !facts.every((fact, index) => fact.id === `fact-${index + 1}` && fact.sourceExcerpt && fact.sourceExcerpt === facts[0].sourceExcerpt)) return;
  return {
    slideCount: 3,
    rationale: "Présenter le lieu, la nature de l’entrave et la période du même avis officiel.",
    slides: [
      { editorialGoal: "hook", viewerQuestion: "Quel secteur est concerné?", allowedFactIds: ["fact-1", "fact-2"] },
      { editorialGoal: "explain", viewerQuestion: "Que précise cet avis routier?", allowedFactIds: ["fact-2", "fact-3"] },
      { editorialGoal: "conclude", viewerQuestion: "Quelle période est annoncée?", allowedFactIds: ["fact-3"] },
    ],
  };
}
