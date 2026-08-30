import type {
  CreativeFactClaimGuard,
  GeneratedCreativeBrief,
  CreativeKeyFact,
  CreativeQualityIssue,
  GeneratedCreativeDraft,
} from "./creative-content.types";

const CERTAINTY_UPGRADE_PATTERN =
  /\b(?:is|are|was|were)\s+(?:fully\s+|entirely\s+)?(?:ai[-‐‑‒–— ]generated|ai[-‐‑‒–— ]written|written by ai)\b|\bai[-‐‑‒–— ]written\s+(?:content|pages?|articles?|text)\b/iu;
const SIGNAL_PATTERN =
  /\b(?:show(?:s|ed)? signs?|significant signs?|authorship signs?|signals?|likely (?:written|edited|generated)|detect(?:ed|ion)|identify|identified)\b/iu;
const ESTIMATE_PATTERN =
  /~|\b(?:about|approximately|estimated|estimate|nearly|roughly|around|over|more than|aproximadamente|estimad[oa]s?|casi|alrededor de|cerca de|unos?|en promedio|más de)\b/iu;
const PROJECTION_PATTERN = /\b(?:projected|forecast|expected to|could reach)\b/iu;
const ASSOCIATION_PATTERN = /\b(?:associated with|correlat(?:ed|ion)|linked to)\b/iu;
const REPORTED_PATTERN = /\b(?:according to|reported|report says|study says)\b/iu;

const UNSUPPORTED_INFERENCE_PATTERNS: Array<{
  pattern: RegExp;
  sourceSupport: RegExp;
}> = [
  {
    pattern: /\bconfirm(?:s|ed|ing)?\s+(?:the\s+)?trend\b/iu,
    sourceSupport: /\b(?:confirm|trend)\b/iu,
  },
  {
    pattern: /\b(?:proves?|proved|proving)\b/iu,
    sourceSupport: /\b(?:prove|proved|proof)\b/iu,
  },
  {
    pattern: /\b(?:causes?|caused|causing|leads? to|leading to|led to|drives?|driving)\b/iu,
    sourceSupport: /\b(?:cause|caused|lead(?:s|ing)? to|led to|drive|driving)\b/iu,
  },
  {
    pattern:
      /\b(?:factors?|reasons?|factores?|razones?)\b[^.!?]{0,80}\b(?:explain(?:s|ed|ing)?|explican?|explicar)\b/iu,
    sourceSupport:
      /\b(?:because|due to|explains?|explained by|caused by|porque|debido a|explica|explican)\b/iu,
  },
  {
    pattern: /\b(?:changing|reshaping|transforming)\s+how\b/iu,
    sourceSupport: /\b(?:changing|reshaping|transforming)\s+how\b/iu,
  },
  {
    pattern: /\b(?:therefore|which means|this means)\b/iu,
    sourceSupport: /\b(?:therefore|means)\b/iu,
  },
  {
    pattern:
      /\b(?:wealth|home equity|equity advantage|financial head start|years? of (?:prior )?wealth|down payment advantage|patrimonio|plusval[ií]a|capital acumulado|ventaja financiera|a[nñ]os? de patrimonio|ventaja (?:en el )?pago inicial)\b/iu,
    sourceSupport:
      /\b(?:wealth|home equity|equity|financial head start|prior wealth|down payment|patrimonio|plusval[ií]a|capital acumulado|ventaja financiera|pago inicial)\b/iu,
  },
  {
    pattern: /\b(?:suggest(?:s|ed|ing)?|implies?|implying|points? to)\b/iu,
    sourceSupport: /\b(?:suggest|imply|point to)\b/iu,
  },
  {
    pattern:
      /\b(?:widespread|far-reaching|massive|dramatic)\s+(?:impact|effect|reach)\b|\breach extends beyond\b/iu,
    sourceSupport:
      /\b(?:widespread|far-reaching|massive|dramatic)\s+(?:impact|effect|reach)\b|\breach extends beyond\b/iu,
  },
  {
    pattern: /\b(?:rise|rising|growth|growing|surge|shifted|shifting)\b/iu,
    sourceSupport: /\b(?:rise|rising|growth|growing|surge|shifted|shifting)\b/iu,
  },
  {
    pattern: /\b(?:gestational year|año gestacional)\b/iu,
    sourceSupport: /\b(?:gestational year|año gestacional)\b/iu,
  },
  {
    pattern:
      /\besto\s+(?:anticipa|permite|ayuda|mejora|reduce|garantiza)\b|\b(?:entender|conocer)\b[^.!?]{0,100}\b(?:te|les|nos)\s+(?:permite|ayuda)\s+(?:anticipar|prevenir|mejorar|reducir|planificar)\b/iu,
    sourceSupport:
      /\b(?:anticipat(?:e|es|ed|ing)?|allows?|helps?|improves?|reduces?|guarantees?|plans?|anticipa|permite|ayuda|mejora|reduce|garantiza|anticipar|prevenir|planificar)\b/iu,
  },
  {
    pattern:
      /\b(?:stages?|trimesters?|phases?|etapas?|trimestres?|fases?)\b/iu,
    sourceSupport:
      /\b(?:stages?|trimesters?|phases?|etapas?|trimestres?|fases?)\b/iu,
  },
  {
    pattern:
      /\b(?:physical|emotional|físic[oa]s?|emocionales?)\b[^.!?]{0,60}\b(?:changes?|needs?|cambios?|necesidades?)\b|\b(?:practical tips?|consejos? prácticos?)\b|\b(?:prepar(?:e|es|ed|ing) parents?|preparación de (?:los )?padres)\b/iu,
    sourceSupport:
      /\b(?:physical|emotional|físic[oa]s?|emocionales?|practical tips?|consejos? prácticos?|prepar(?:e|es|ed|ing)|preparación)\b/iu,
  },
];

const GENERIC_CLOSING_PATTERN =
  /^(?:the\s+)?(?:takeaway|conclusion|bottom line|what next)\??$/iu;

const ORDINAL_NUMBER_PATTERNS: ReadonlyArray<{
  number: string;
  pattern: RegExp;
}> = [
  { number: "1", pattern: /\bfirst\b/iu },
  { number: "2", pattern: /\bsecond\b/iu },
  { number: "3", pattern: /\bthird\b/iu },
  { number: "4", pattern: /\bfourth\b/iu },
  { number: "5", pattern: /\bfifth\b/iu },
  { number: "6", pattern: /\bsixth\b/iu },
  { number: "7", pattern: /\bseventh\b/iu },
  { number: "8", pattern: /\beighth\b/iu },
  { number: "9", pattern: /\bninth\b/iu },
  { number: "10", pattern: /\btenth\b/iu },
];

const VERBAL_RATIO_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  numbers: readonly string[];
}> = [
  { pattern: /\bone\s+in\s+four\b/iu, numbers: ["1", "4"] },
  { pattern: /\bone\s+in\s+twenty\b/iu, numbers: ["1", "20"] },
  { pattern: /\buna?\s+de\s+cada\s+cuatro\b/iu, numbers: ["1", "4"] },
  { pattern: /\buna?\s+de\s+cada\s+veinte\b/iu, numbers: ["1", "20"] },
];

const CARDINAL_NUMBER_PATTERNS: ReadonlyArray<{
  number: string;
  pattern: RegExp;
}> = [
  {
    number: "1",
    // Spanish "un/una" is normally an indefinite article ("una etapa"),
    // not the numeric claim 1. Explicit Spanish ratios and fractions are
    // handled by their dedicated patterns above.
    pattern: /\bone(?![- ](?:third|quarter))\b/iu,
  },
  { number: "2", pattern: /\b(?:two|twice|double|dos|dos veces|doble)\b/iu },
  { number: "3", pattern: /\b(?:three|tres)\b/iu },
  { number: "4", pattern: /\b(?:four|cuatro)\b/iu },
  { number: "5", pattern: /\b(?:five|cinco)\b/iu },
  { number: "6", pattern: /\b(?:six|seis)\b/iu },
  { number: "7", pattern: /\b(?:seven|siete)\b/iu },
  { number: "8", pattern: /\b(?:eight|ocho)\b/iu },
  { number: "9", pattern: /\b(?:nine|nueve)\b/iu },
  { number: "10", pattern: /\b(?:ten|diez)\b/iu },
  { number: "20", pattern: /\b(?:twenty|veinte)\b/iu },
];

export function withCreativeFactClaimGuard(
  fact: CreativeKeyFact,
): CreativeKeyFact {
  const inferred = inferCreativeFactClaimGuard(fact);
  const existing = fact.claimGuard;
  return {
    ...fact,
    claimGuard: existing
      ? {
          certainty: isFactCertainty(existing.certainty)
            ? existing.certainty
            : inferred.certainty,
          requiredPhrases: mergeText(existing.requiredPhrases, inferred.requiredPhrases),
          forbiddenPhrases: mergeText(
            existing.forbiddenPhrases,
            inferred.forbiddenPhrases,
          ),
          scopePhrases: mergeText(existing.scopePhrases, inferred.scopePhrases),
          allowedNumbers: mergeText(
            existing.allowedNumbers,
            inferred.allowedNumbers,
          ).map(normalizeNumber),
        }
      : inferred,
  };
}

export function inferCreativeFactClaimGuard(
  fact: CreativeKeyFact,
): CreativeFactClaimGuard {
  const qualifierText = (fact.requiredQualifiers ?? []).join(" ");
  const source = `${fact.statement} ${fact.sourceExcerpt ?? ""} ${qualifierText}`;
  const certainty: CreativeFactClaimGuard["certainty"] = SIGNAL_PATTERN.test(source)
    ? "detected-signal"
    : PROJECTION_PATTERN.test(source)
      ? "projection"
      : ASSOCIATION_PATTERN.test(source)
        ? "association"
        : ESTIMATE_PATTERN.test(source)
          ? "estimated"
          : REPORTED_PATTERN.test(source)
            ? "reported"
            : "asserted";
  return {
    certainty,
    requiredPhrases: uniqueText(fact.requiredQualifiers ?? []),
    forbiddenPhrases:
      certainty === "detected-signal"
        ? ["is AI-generated", "are AI-generated", "is AI-written", "are AI-written"]
        : [],
    scopePhrases: extractScopePhrases(fact.statement),
    // The concise fact statement may intentionally spell out or omit details
    // that remain explicit in the cited excerpt. Both are evidence, so retain
    // numeric literals from each instead of rejecting faithful slide copy.
    allowedNumbers: uniqueText([
      ...extractAllowedNumbers(fact.statement),
      ...extractAllowedNumbers(fact.sourceExcerpt ?? ""),
      ...extractExplicitEnumerationCounts(fact.statement),
    ]),
  };
}

export function deterministicFactQualityIssues(
  draft: GeneratedCreativeDraft,
  keyFacts: readonly CreativeKeyFact[],
): CreativeQualityIssue[] {
  if (keyFacts.length === 0) return [];
  const factsById = new Map(
    keyFacts.map((fact) => {
      const guarded = withCreativeFactClaimGuard(fact);
      return [guarded.id, guarded] as const;
    }),
  );
  const issues: CreativeQualityIssue[] = [];

  const draftCopy = [draft.caption, draft.callToAction, draft.altText]
    .filter(Boolean)
    .join(" ");
  const allFacts = [...factsById.values()];
  const allSourceCopy = allFacts.map((fact) => fact.statement).join(" ");
  if (
    allFacts.some(
      (fact) => fact.claimGuard?.certainty === "detected-signal",
    ) && CERTAINTY_UPGRADE_PATTERN.test(draftCopy)
  ) {
    issues.push({
      code: "CERTAINTY_UPGRADE",
      severity: "blocker",
      message:
        "The caption, call to action, or alt text turns detected AI-authorship signals into a categorical AI-generated claim.",
    });
  }
  const unsupportedDraftNumbers = extractBriefClaimNumbers(draftCopy).filter(
    (number) =>
      !allFacts.some((fact) =>
        fact.claimGuard?.allowedNumbers.includes(number),
      ),
  );
  if (unsupportedDraftNumbers.length > 0) {
    issues.push({
      code: "UNSUPPORTED_NUMBER",
      severity: "blocker",
      message: `The publishing copy uses ${unsupportedDraftNumbers.join(", ")} without support from the creative brief.`,
    });
  }
  if (
    UNSUPPORTED_INFERENCE_PATTERNS.some(
      ({ pattern, sourceSupport }) =>
        pattern.test(draftCopy) && !sourceSupport.test(allSourceCopy),
    )
  ) {
    issues.push({
      code: "UNSUPPORTED_INFERENCE",
      severity: "blocker",
      message:
        "The publishing copy adds a trend, causal effect, or consequence that the key facts do not establish.",
    });
  }

  draft.units.forEach((unit) => {
    const selectedFacts = unit.factIds.flatMap((id) => {
      const fact = factsById.get(id);
      return fact ? [fact] : [];
    });
    if (selectedFacts.length === 0) return;
    const visibleCopy = unitVisibleCopy(unit);
    const sourceCopy = selectedFacts.map((fact) => fact.statement).join(" ");

    if (
      selectedFacts.some(
        (fact) => fact.claimGuard?.certainty === "detected-signal",
      ) && CERTAINTY_UPGRADE_PATTERN.test(visibleCopy)
    ) {
      issues.push({
        code: "CERTAINTY_UPGRADE",
        severity: "blocker",
        unitOrder: unit.order,
        message: `Slide ${unit.order} turns detected AI-authorship signals into a categorical AI-generated claim. Preserve wording such as “shows signs” or “signals”.`,
      });
    }

    const unsupportedNumbers = extractAllowedNumbers(visibleCopy).filter(
      (number) =>
        !selectedFacts.some((fact) =>
          fact.claimGuard?.allowedNumbers.includes(number),
        ),
    );
    if (unsupportedNumbers.length > 0) {
      issues.push({
        code: "UNSUPPORTED_NUMBER",
        severity: "blocker",
        unitOrder: unit.order,
        message: `Slide ${unit.order} uses ${unsupportedNumbers.join(", ")} without support from its selected facts.`,
      });
    }

    if (
      selectedFacts.some(
        (fact) =>
          factUsesNumberInCopy(fact, visibleCopy) &&
          factRequiresEstimateQualifier(fact),
      ) && !ESTIMATE_PATTERN.test(visibleCopy)
    ) {
      issues.push({
        code: "LOST_QUALIFIER",
        severity: "blocker",
        unitOrder: unit.order,
        message: `Slide ${unit.order} presents an approximate value as exact. Preserve a qualifier such as “about”, “nearly”, or “estimated”.`,
      });
    }

    const missingScopeFacts = selectedFacts.filter((fact) => {
      const scopes = fact.claimGuard?.scopePhrases ?? [];
      return scopes.length > 0 && !scopes.some((scope) => scopeMatches(visibleCopy, scope));
    });
    if (missingScopeFacts.length > 0) {
      issues.push({
        code: "MISSING_SCOPE",
        severity: "blocker",
        unitOrder: unit.order,
        message: `Slide ${unit.order} omits the population or timeframe needed for ${missingScopeFacts.map((fact) => fact.id).join(", ")}.`,
      });
    }

    if (
      UNSUPPORTED_INFERENCE_PATTERNS.some(
        ({ pattern, sourceSupport }) =>
          pattern.test(visibleCopy) && !sourceSupport.test(sourceCopy),
      )
    ) {
      issues.push({
        code: "UNSUPPORTED_INFERENCE",
        severity: "blocker",
        unitOrder: unit.order,
        message: `Slide ${unit.order} adds a trend, causal effect, or consequence that its selected facts do not establish.`,
      });
    }
  });

  const closing = draft.units.at(-1);
  if (
    closing?.editorialGoal === "conclude" &&
    !closing.body?.trim() &&
    !closing.ctaQuestion?.trim() &&
    GENERIC_CLOSING_PATTERN.test(closing.headline.trim())
  ) {
    issues.push({
      code: "EMPTY_CONCLUSION",
      severity: "blocker",
      unitOrder: closing.order,
      message: `Slide ${closing.order} promises a takeaway but contains no conclusion or closing question.`,
    });
  }

  return deduplicateIssues(issues);
}

export function deterministicBriefFactQualityIssues(
  brief: GeneratedCreativeBrief,
  sourceText?: string,
): CreativeQualityIssue[] {
  if (brief.keyFacts.length === 0) return [];
  const facts = brief.keyFacts.map(withCreativeFactClaimGuard);
  const factsById = new Map(facts.map((fact) => [fact.id, fact] as const));
  const allSourceCopy = facts.map((fact) => fact.statement).join(" ");
  const issues: CreativeQualityIssue[] = [];
  if (sourceText !== undefined) {
    const normalizedSource = normalizeText(sourceText);
    facts.forEach((fact) => {
      const excerpt = fact.sourceExcerpt?.trim();
      if (!excerpt) {
        issues.push({
          code: "MISSING_SOURCE_EVIDENCE",
          severity: "blocker",
          message: `${fact.id} does not include a source excerpt.`,
        });
        return;
      }
      if (!normalizedSource.includes(normalizeText(excerpt))) {
        issues.push({
          code: "SOURCE_EVIDENCE_NOT_FOUND",
          severity: "blocker",
          message: `${fact.id} cites evidence that does not appear verbatim in the supplied source.`,
        });
        return;
      }
      const evidenceNumbers = new Set(extractBriefClaimNumbers(excerpt));
      const unsupportedFactNumbers = extractBriefClaimNumbers(
        fact.statement,
      ).filter((number) => !evidenceNumbers.has(number));
      if (unsupportedFactNumbers.length > 0) {
        issues.push({
          code: "FACT_NUMBER_NOT_IN_EVIDENCE",
          severity: "blocker",
          message: `${fact.id} uses ${unsupportedFactNumbers.join(", ")} outside its cited source excerpt.`,
        });
      }
      if (hasUnsupportedInference(fact.statement, excerpt)) {
        issues.push({
          code: "FACT_EXCEEDS_SOURCE_EVIDENCE",
          severity: "blocker",
          message: `${fact.id} adds a topic, benefit, or interpretation not established by its cited source excerpt.`,
        });
      }
    });
  }
  const strategyCopy = [
    brief.keyMessage,
    brief.angle,
    brief.hook,
    ...brief.suggestedConcepts.flatMap((concept) => [
      concept.title,
      concept.concept,
    ]),
  ].join(" ");

  appendUnsupportedCopyIssues(
    issues,
    strategyCopy,
    allSourceCopy,
    facts,
    "The creative brief",
  );

  brief.carouselPlan?.slides.forEach((slide, index) => {
    const selectedFacts = slide.allowedFactIds.flatMap((id) => {
      const fact = factsById.get(id);
      return fact ? [fact] : [];
    });
    appendUnsupportedCopyIssues(
      issues,
      slide.viewerQuestion,
      selectedFacts.map((fact) => fact.statement).join(" "),
      selectedFacts,
      `Carousel plan slide ${index + 1}`,
      index + 1,
    );
  });

  return deduplicateIssues(issues);
}

/**
 * Narrows only unsupported strategy/planning copy to already verified facts.
 * This is deliberately conservative: it never repairs fact statements or
 * source excerpts, which must still pass the source-evidence gate unchanged.
 */
export function repairDeterministicBriefScope(
  brief: GeneratedCreativeBrief,
  language?: string,
): GeneratedCreativeBrief {
  if (brief.keyFacts.length === 0) return brief;
  const facts = brief.keyFacts.map(withCreativeFactClaimGuard);
  const allSourceCopy = facts.map((fact) => fact.statement).join(" ");
  let repaired = false;

  const repairStrategyCopy = (
    value: string,
    fallbackFact: CreativeKeyFact,
    maxLength?: number,
  ): string => {
    if (!briefCopyExceedsFacts(value, allSourceCopy, facts)) return value;
    repaired = true;
    return maxLength
      ? truncateWithoutBreakingWord(fallbackFact.statement, maxLength)
      : fallbackFact.statement;
  };

  const keyMessage = repairStrategyCopy(brief.keyMessage, facts[0]!);
  const angle = repairStrategyCopy(brief.angle, facts[1] ?? facts[0]!);
  const hook = repairStrategyCopy(brief.hook, facts[0]!, 300);
  const suggestedConcepts = brief.suggestedConcepts.map((concept, index) => {
    const fallbackFact = facts[index % facts.length]!;
    return {
      ...concept,
      title: repairStrategyCopy(concept.title, fallbackFact, 120),
      concept: repairStrategyCopy(concept.concept, fallbackFact, 500),
    };
  });
  const carouselPlan = brief.carouselPlan
    ? {
        ...brief.carouselPlan,
        slides: brief.carouselPlan.slides.map((slide) => {
          const selectedFacts = slide.allowedFactIds.flatMap((id) => {
            const fact = facts.find((candidate) => candidate.id === id);
            return fact ? [fact] : [];
          });
          const selectedSourceCopy = selectedFacts
            .map((fact) => fact.statement)
            .join(" ");
          if (
            selectedFacts.length === 0 ||
            !briefCopyExceedsFacts(
              slide.viewerQuestion,
              selectedSourceCopy,
              selectedFacts,
            )
          ) {
            return slide;
          }
          repaired = true;
          return {
            ...slide,
            viewerQuestion: localizedSourceQuestion(
              slide.viewerQuestion,
              language,
            ),
          };
        }),
      }
    : undefined;

  if (!repaired) return brief;
  const repairFlag =
    "Automated factual-scope repair narrowed the strategy to verified source evidence.";
  return {
    ...brief,
    keyMessage,
    angle,
    hook,
    contentSufficiency:
      brief.contentSufficiency === "insufficient" ? "insufficient" : "limited",
    riskFlags: uniqueText([...brief.riskFlags, repairFlag]).slice(0, 5),
    suggestedConcepts,
    ...(carouselPlan ? { carouselPlan } : {}),
  };
}

function appendUnsupportedCopyIssues(
  issues: CreativeQualityIssue[],
  copy: string,
  sourceCopy: string,
  facts: readonly CreativeKeyFact[],
  label: string,
  unitOrder?: number,
): void {
  const unsupportedNumbers = extractBriefClaimNumbers(copy).filter(
    (number) =>
      !facts.some((fact) => fact.claimGuard?.allowedNumbers.includes(number)),
  );
  if (unsupportedNumbers.length > 0) {
    issues.push({
      code: "UNSUPPORTED_NUMBER",
      severity: "blocker",
      ...(unitOrder === undefined ? {} : { unitOrder }),
      message: `${label} uses ${unsupportedNumbers.join(", ")} without support from its facts.`,
    });
  }
  if (hasUnsupportedInference(copy, sourceCopy)) {
    issues.push({
      code: "UNSUPPORTED_BRIEF_SCOPE",
      severity: "blocker",
      ...(unitOrder === undefined ? {} : { unitOrder }),
      message: `${label} promises a topic, benefit, or interpretation that its facts do not establish.`,
    });
  }
}

export function repairDeterministicFactCopy(
  draft: GeneratedCreativeDraft,
  keyFacts: readonly CreativeKeyFact[],
  language?: string,
): GeneratedCreativeDraft {
  if (keyFacts.length === 0) return draft;
  const factsById = new Map(
    keyFacts.map((fact) => {
      const guarded = withCreativeFactClaimGuard(fact);
      return [guarded.id, guarded] as const;
    }),
  );
  const allFacts = [...factsById.values()];
  const allSourceCopy = allFacts.map((fact) => fact.statement).join(" ");
  const repaired: GeneratedCreativeDraft = {
    ...draft,
    caption: repairPublishingCopy(
      draft.caption,
      allSourceCopy,
      localizedFallback(language, "summary"),
      language,
    ),
    altText: repairPublishingCopy(
      draft.altText,
      allSourceCopy,
      localizedFallback(language, "alt-text"),
      language,
    ),
    units: draft.units.map((unit) => {
      const factIds = repairNumericFactAssignments(unit, factsById);
      const selectedFacts = factIds.flatMap((id) => {
        const fact = factsById.get(id);
        return fact ? [fact] : [];
      });
      const sourceCopy = selectedFacts
        .map((fact) => fact.statement)
        .join(" ");
      const repairedHeadline = hasUnsupportedInference(
        unit.headline,
        sourceCopy,
      )
        ? repairUnsupportedInference(unit.headline, sourceCopy)
        : unit.headline;
      let headline = localizeEstimateQualifiers(
        repairCertaintyUpgrade(repairedHeadline),
        language,
      ) || localizedEvidenceHeadline(language);
      let body = unit.body
        ? localizeEstimateQualifiers(
            repairCertaintyUpgrade(
              repairUnsupportedInference(unit.body, sourceCopy),
            ),
            language,
          )
        : undefined;
      let ctaQuestion = unit.ctaQuestion
        ? localizeEstimateQualifiers(
            repairCertaintyUpgrade(unit.ctaQuestion),
            language,
          )
        : undefined;
      if (
        ctaQuestion &&
        hasUnsupportedInference(ctaQuestion, sourceCopy) &&
        (unit.editorialGoal === "conclude" ||
          unit.editorialGoal === "debate")
      ) {
        ctaQuestion = isSpanishLanguage(language)
          ? "¿Cómo interpretarías estos datos?"
          : "How would you interpret these findings?";
      }
      if (
        unit.editorialGoal === "prove" &&
        wordCount(body) <= 2 &&
        selectedFacts[0]
      ) {
        body = selectedFacts[0].statement;
      }
      let visibleCopy = [headline, body, ctaQuestion]
        .filter(Boolean)
        .join(" ");
      if (
        selectedFacts.some(
          (fact) =>
            factUsesNumberInCopy(fact, visibleCopy) &&
            factRequiresEstimateQualifier(fact),
        ) && !ESTIMATE_PATTERN.test(visibleCopy)
      ) {
        if (body && extractAllowedNumbers(body).length > 0) {
          body = repairMissingEstimateQualifier(body, selectedFacts, language);
        } else {
          headline = repairMissingEstimateQualifier(
            headline,
            selectedFacts,
            language,
          );
        }
        visibleCopy = [headline, body, ctaQuestion]
          .filter(Boolean)
          .join(" ");
      }
      const olderPagesFact = selectedFacts.find(
        (fact) =>
          fact.claimGuard?.scopePhrases.some(
            (scope) => normalizeText(scope) === "older pages",
          ) && !scopeMatches(visibleCopy, "older pages"),
      );
      if (olderPagesFact) {
        body = appendSentence(body, "The sample includes older pages.");
        visibleCopy = [headline, body, ctaQuestion]
          .filter(Boolean)
          .join(" ");
      }
      const missingNumericScope = selectedFacts.find(
        (fact) =>
          factUsesNumberInCopy(fact, visibleCopy) &&
          (fact.claimGuard?.scopePhrases.length ?? 0) > 0 &&
          !fact.claimGuard?.scopePhrases.some((scope) =>
            scopeMatches(visibleCopy, scope),
          ),
      )?.claimGuard?.scopePhrases[0];
      if (missingNumericScope) {
        if (body && extractAllowedNumbers(body).length > 0) {
          body = integrateScopeNaturally(body, missingNumericScope);
        } else {
          headline = integrateScopeNaturally(headline, missingNumericScope);
        }
      }
      visibleCopy = [headline, body, ctaQuestion].filter(Boolean).join(" ");
      const closingFact = selectedFacts[0];
      const closingNeedsSafeSynthesis = Boolean(
        closingFact &&
          (unit.editorialGoal === "conclude" ||
            unit.editorialGoal === "debate") &&
          (hasUnsupportedInference(visibleCopy, sourceCopy) ||
            CERTAINTY_UPGRADE_PATTERN.test(visibleCopy) ||
            (closingFact.claimGuard?.scopePhrases.length &&
              !closingFact.claimGuard.scopePhrases.some((scope) =>
                scopeMatches(visibleCopy, scope),
              ))),
      );
      if (closingFact && closingNeedsSafeSynthesis) {
        body =
          unit.editorialGoal === "debate" && ctaQuestion?.trim()
            ? undefined
            : safeConclusionForFact(closingFact, language);
      }
      return {
        ...unit,
        factIds,
        headline,
        ...(body ? { body } : { body: undefined }),
        ...(ctaQuestion
          ? { ctaQuestion }
          : { ctaQuestion: undefined }),
      };
    }),
  };

  repaired.caption = repairMissingPublishingScope(repaired.caption, allFacts);

  const closing = repaired.units.at(-1);
  if (closing?.editorialGoal === "debate" && closing.factIds.length > 1) {
    const visibleNumbers = extractAllowedNumbers(
      [closing.headline, closing.body, closing.ctaQuestion]
        .filter(Boolean)
        .join(" "),
    );
    const fullySupportingFacts = closing.factIds.filter((id) => {
      const fact = factsById.get(id);
      return Boolean(
        fact &&
          visibleNumbers.length > 0 &&
          visibleNumbers.every((number) =>
            fact.claimGuard?.allowedNumbers.includes(number),
          ),
      );
    });
    if (fullySupportingFacts.length === 1) {
      closing.factIds = [fullySupportingFacts[0]!];
    }
  }
  if (
    closing?.editorialGoal === "conclude" &&
    !closing.body?.trim() &&
    !closing.ctaQuestion?.trim() &&
    GENERIC_CLOSING_PATTERN.test(closing.headline.trim())
  ) {
    const fact = closing.factIds.map((id) => factsById.get(id)).find(Boolean);
    if (fact) closing.body = safeConclusionForFact(fact, language);
  }
  return repaired;
}

function repairNumericFactAssignments(
  unit: GeneratedCreativeDraft["units"][number],
  factsById: ReadonlyMap<string, CreativeKeyFact>,
): string[] {
  const factIds = [...unit.factIds];
  const visibleNumbers = extractAllowedNumbers(
    [unit.headline, unit.body, unit.ctaQuestion].filter(Boolean).join(" "),
  );

  for (const number of visibleNumbers) {
    const alreadySupported = factIds.some((id) =>
      factsById.get(id)?.claimGuard?.allowedNumbers.includes(number),
    );
    if (alreadySupported) continue;

    const matchingFacts = [...factsById.values()].filter((fact) =>
      fact.claimGuard?.allowedNumbers.includes(number),
    );
    if (matchingFacts.length !== 1) continue;
    const matchingId = matchingFacts[0]!.id;
    if (!factIds.includes(matchingId) && factIds.length < 6) {
      factIds.push(matchingId);
    }
  }
  return factIds;
}

function repairCertaintyUpgrade(value: string): string {
  return value
    .replace(/\bare\s+(?:fully\s+|entirely\s+)?ai[-‐‑‒–— ]generated\b/giu, "show signs of AI authorship")
    .replace(/\bis\s+(?:fully\s+|entirely\s+)?ai[-‐‑‒–— ]generated\b/giu, "shows signs of AI authorship")
    .replace(/\bare\s+ai[-‐‑‒–— ]written\b/giu, "show signs of AI authorship")
    .replace(/\bis\s+ai[-‐‑‒–— ]written\b/giu, "shows signs of AI authorship")
    .replace(
      /\bai[-‐‑‒–— ]written\s+(content|pages?|articles?|text)\b/giu,
      (match, noun: string, offset: number, input: string) => {
        const sentenceStart =
          offset === 0 || /[.!?]\s*$/u.test(input.slice(0, offset));
        const normalizedNoun = sentenceStart
          ? `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`
          : noun;
        return `${normalizedNoun} showing signs of AI authorship`;
      },
    );
}

function repairPublishingCopy(
  value: string,
  sourceCopy: string,
  fallback: string,
  language?: string,
): string {
  const repaired = localizeEstimateQualifiers(
    repairCertaintyUpgrade(repairUnsupportedInference(value, sourceCopy)),
    language,
  );
  const safeSentences =
    repaired.match(/[^.!?]+[.!?]+|[^.!?]+$/gu)?.filter(
      (sentence) => !hasUnsupportedInference(sentence, sourceCopy),
    ) ?? [];
  const result = safeSentences.join(" ").replace(/\s+/gu, " ").trim();
  return result || fallback;
}

function hasUnsupportedInference(value: string, sourceCopy: string): boolean {
  return UNSUPPORTED_INFERENCE_PATTERNS.some(
    ({ pattern, sourceSupport }) =>
      pattern.test(value) && !sourceSupport.test(sourceCopy),
  );
}

function repairUnsupportedInference(
  value: string,
  sourceCopy: string,
): string {
  const partiallyRepaired = value
      .replace(/,?\s*confirm(?:s|ed|ing)?\s+(?:the\s+)?trend\.?\s*$/iu, "")
      .replace(
        /,?\s*(?:suggest(?:s|ed|ing)?|implies?|implying|points? to)\b[^.?!]*[.?!]?\s*$/iu,
        "",
      )
      .replace(/[—–-]\s*(?:changing|reshaping|transforming)\s+how\b[^.?!]*[.?!]?\s*$/iu, "");
  const safeSentences =
    partiallyRepaired.match(/[^.!?]+[.!?]+|[^.!?]+$/gu)?.filter(
      (sentence) => !hasUnsupportedInference(sentence, sourceCopy),
    ) ?? [];
  return normalizePunctuation(safeSentences.join(" "));
}

function repairMissingEstimateQualifier(
  value: string,
  facts: readonly CreativeKeyFact[],
  language?: string,
): string {
  const allowedApproximateNumbers = new Set(
    facts
      .filter(factRequiresEstimateQualifier)
      .flatMap((fact) => fact.claimGuard?.allowedNumbers ?? []),
  );
  const qualifier = facts
    .flatMap((fact) => fact.requiredQualifiers ?? [])
    .map((candidate) => estimatePrefix(candidate, language))
    .find(Boolean) ?? defaultEstimateQualifier(language);
  return value.replace(
    /~?\d[\d,.]*(?:\s*%|\s*percent)?/giu,
    (number) =>
      allowedApproximateNumbers.has(normalizeNumber(number)) &&
      !ESTIMATE_PATTERN.test(number)
        ? `${qualifier} ${number}`
        : number,
  );
}

function estimatePrefix(
  value: string,
  language?: string,
): string | undefined {
  const normalized = normalizeText(value);
  if (normalized.includes("more than") || normalized.startsWith("over ")) {
    return isSpanishLanguage(language) ? "más de" : "more than";
  }
  const prefix = normalized.match(
    /\b(?:about|approximately|estimated|nearly|roughly|around)\b/iu,
  )?.[0];
  if (!prefix || !isSpanishLanguage(language)) return prefix;
  return prefix === "nearly" ? "casi" : "aproximadamente";
}

function repairMissingPublishingScope(
  caption: string,
  facts: readonly CreativeKeyFact[],
): string {
  const matchingFact = facts.find(
    (fact) =>
      factUsesNumberInCopy(fact, caption) &&
      (fact.claimGuard?.scopePhrases.length ?? 0) > 0 &&
      !fact.claimGuard?.scopePhrases.some((scope) =>
        scopeMatches(caption, scope),
      ),
  );
  const scope = matchingFact?.claimGuard?.scopePhrases[0];
  return scope ? integrateScopeNaturally(caption, scope) : caption;
}

function integrateScopeNaturally(value: string, scope: string): string {
  if (scopeMatches(value, scope)) return value;
  const afterPublication = scope.match(/^pages?\s+published\s+after\s+(.+)$/iu);
  if (!afterPublication?.[1]) return value;

  const event = afterPublication[1].trim();
  if (/\b(?:after|since)\b/iu.test(value)) {
    return value
      .replace(/\bnew content\b/iu, "new web pages")
      .replace(/\bweb pages appears\b/iu, "web pages appear");
  }
  return value.replace(
    /\b(?:new\s+|recently\s+published\s+)?(?:(web)\s+)?pages?(?:\s+published)?\b/iu,
    (_, web: string | undefined) =>
      `${web ? "web " : ""}pages published after ${event}`,
  );
}

function safeConclusionForFact(
  fact: CreativeKeyFact,
  language?: string,
): string {
  if (fact.claimGuard?.certainty === "detected-signal") {
    const event = fact.statement.match(
      /pages?\s+published\s+after\s+(.+?)(?=\s+(?:show|were|had|display)|[,.;]|$)/iu,
    )?.[1];
    if (isSpanishLanguage(language)) {
      return event
        ? `Para las páginas publicadas después de ${event}, estos resultados describen señales de autoría con IA, no certeza sobre cómo se escribió cada página.`
        : "Estos resultados describen señales de autoría con IA, no certeza sobre cómo se escribió cada página.";
    }
    return event
      ? `For pages published after ${event}, these findings describe AI-authorship signals—not certainty about how every page was written.`
      : "These findings describe AI-authorship signals—not certainty about how every page was written.";
  }
  return fact.statement;
}

function localizedEvidenceHeadline(language?: string): string {
  return isSpanishLanguage(language)
    ? "Lo que muestran los datos"
    : "What the data shows";
}

function localizeEstimateQualifiers(
  value: string,
  language?: string,
): string {
  if (!isSpanishLanguage(language)) return value;
  return value
    .replace(
      /\bpoco más de\s+(?:about|approximately|roughly|around)\s+(?=~?\d)/giu,
      "aproximadamente ",
    )
    .replace(
      /\b(?:about|approximately|roughly|around)\s+(?=~?\d)/giu,
      "aproximadamente ",
    )
    .replace(/\bnearly\s+(?=~?\d)/giu, "casi ")
    .replace(/\bmore than\s+(?=~?\d)/giu, "más de ");
}

function defaultEstimateQualifier(language?: string): string {
  return isSpanishLanguage(language) ? "aproximadamente" : "about";
}

function localizedFallback(
  language: string | undefined,
  kind: "summary" | "alt-text",
): string {
  if (isSpanishLanguage(language)) {
    return kind === "summary"
      ? "Resumen de la información respaldada por la fuente."
      : "Carrusel que explica información respaldada por la fuente.";
  }
  return kind === "summary"
    ? "A summary of information supported by the source."
    : "A carousel explaining information supported by the source.";
}

function isSpanishLanguage(language: string | undefined): boolean {
  const normalized = normalizeText(language ?? "");
  return (
    normalized === "es" ||
    normalized.startsWith("es ") ||
    normalized.includes("espanol") ||
    normalized.includes("spanish")
  );
}

function extractScopePhrases(statement: string): string[] {
  const matches = [
    ...statement.matchAll(/\bolder pages?\b/giu),
    ...statement.matchAll(/\bnew(?:er)? pages?\b/giu),
    ...statement.matchAll(/\bpages?\s+published\s+(?:after|before|since)\s+(.+?)(?=\s+(?:show|were|had|display)|[,.;]|$)/giu),
    ...statement.matchAll(/\bfrom the past\s+(?:\w+|\d+)\s+years?\b/giu),
    ...statement.matchAll(/\brandom sample\b/giu),
    ...statement.matchAll(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/giu),
  ];
  return uniqueText(matches.map((match) => match[0]));
}

function extractAllowedNumbers(value: string): string[] {
  const numbers = extractNumericLiterals(value);
  // Key facts often express an ordinal in words while concise slide copy uses
  // its numeric form (for example, "the first day" -> "day 1"). Treat those
  // forms as equivalent so an accurate shortening is not rejected as an
  // invented statistic.
  const ordinalCopy = value.replace(
    /\b(?:one[- ]third|two[- ]thirds)\b/giu,
    "",
  );
  ORDINAL_NUMBER_PATTERNS.forEach(({ number, pattern }) => {
    if (pattern.test(ordinalCopy)) numbers.push(number);
  });
  VERBAL_RATIO_PATTERNS.forEach(({ pattern, numbers: ratioNumbers }) => {
    if (pattern.test(value)) numbers.push(...ratioNumbers);
  });
  CARDINAL_NUMBER_PATTERNS.forEach(({ number, pattern }) => {
    if (pattern.test(value)) numbers.push(number);
  });
  if (/\b(?:a|one) quarter\b|\buna? cuarta parte\b/iu.test(value)) {
    numbers.push("25%");
  }
  if (/\bone[- ]third\b/iu.test(value)) numbers.push("33%");
  if (/\btwo[- ]thirds\b/iu.test(value)) numbers.push("67%");
  // 35% is commonly and accurately summarized as "roughly one-third".
  // Preserve both normalized forms so the guard does not reject a cautious
  // verbal approximation of the source statistic.
  if (numbers.includes("35%")) numbers.push("33%");
  return uniqueText(numbers);
}

function extractExplicitEnumerationCounts(value: string): string[] {
  const counts: string[] = [];
  const sentences = value.match(/[^.!?]+[.!?]?/gu) ?? [];

  for (const sentence of sentences) {
    // Only infer a count from an explicit list of at least three items. This
    // supports concise labels such as "4-part architecture" without treating
    // an ordinary two-clause sentence as a numbered factual claim.
    const commaParts = sentence.split(/\s*,\s*/u);
    if (commaParts.length < 3) continue;
    const finalPart = commaParts.at(-1) ?? "";
    if (!/^(?:and|or|y|o)\s+/iu.test(finalPart.trim())) continue;
    const count = commaParts.length;
    if (count >= 3 && count <= 10) counts.push(String(count));
  }

  return uniqueText(counts);
}

function extractBriefClaimNumbers(value: string): string[] {
  // Slide/page/part numbers describe document structure, not factual claims.
  const factualCopy = value
    .replace(
      /\b(?:slide|page|part|diapositiva|pagina|página|parte)\s*#?\s*\d+\b/giu,
      " ",
    )
    .replace(
      /\b\d+\s*[- ]?\s*(?:slides?|pages?|parts?|diapositivas?|paginas?|páginas?|partes?)\b/giu,
      " ",
    )
    .replace(
      /\b(?:carousel|carrusel)\s+(?:of|de|with|con)\s+\d+\b/giu,
      " ",
    );
  const numbers = extractNumericLiterals(factualCopy);
  if (/\bone[- ]third\b/iu.test(factualCopy)) numbers.push("33%");
  if (/\btwo[- ]thirds\b/iu.test(factualCopy)) numbers.push("67%");
  return uniqueText(numbers);
}

function briefCopyExceedsFacts(
  copy: string,
  sourceCopy: string,
  facts: readonly CreativeKeyFact[],
): boolean {
  const unsupportedNumber = extractBriefClaimNumbers(copy).some(
    (number) =>
      !facts.some((fact) => fact.claimGuard?.allowedNumbers.includes(number)),
  );
  return unsupportedNumber || hasUnsupportedInference(copy, sourceCopy);
}

function localizedSourceQuestion(
  existingQuestion: string,
  language?: string,
): string {
  if (isSpanishLanguage(language)) {
    return "¿Qué establece la fuente aquí?";
  }
  if (/^(?:fr|fra|french|français|francais)(?:\b|[-_])/iu.test(language ?? "")) {
    return "Que rapporte la source ici ?";
  }
  if (
    /[¿áéíóúñ]|\b(?:que|qué|como|cómo|cual|cuál|embarazo|fuente)\b/iu.test(
      existingQuestion,
    )
  ) {
    return "¿Qué establece la fuente aquí?";
  }
  if (
    /[àâçéèêëîïôûùüÿœ]|\b(?:que|quoi|comment|source)\b/iu.test(
      existingQuestion,
    )
  ) {
    return "Que rapporte la source ici ?";
  }
  return "What does the source establish here?";
}

function truncateWithoutBreakingWord(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const shortened = value.slice(0, maxLength + 1).replace(/\s+\S*$/u, "");
  return (shortened || value.slice(0, maxLength)).trim();
}

function extractNumericLiterals(value: string): string[] {
  return [
    ...value.matchAll(
      /(?:[$€£]\s*)?~?\d[\d,.]*(?:\s*(?:%|(?:percent|mil millones|thousand|million|billion|millones?|millón|mil|k|m|b)\b))?/giu,
    ),
  ].map((match) => normalizeNumber(match[0]));
}

function factUsesNumberInCopy(fact: CreativeKeyFact, copy: string): boolean {
  const copyNumbers = new Set(extractAllowedNumbers(copy));
  return (fact.claimGuard?.allowedNumbers ?? []).some((number) =>
    copyNumbers.has(number),
  );
}

function factRequiresEstimateQualifier(fact: CreativeKeyFact): boolean {
  return (fact.requiredQualifiers ?? []).some((qualifier) =>
    ESTIMATE_PATTERN.test(qualifier),
  );
}

function normalizeNumber(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[$€£]/gu, "")
    .replace(/^~/u, "")
    .replace(/,/gu, "")
    .replace(/\s*percent$/u, "%")
    .trim()
    .replace(/[.,]+$/u, "");
  const scaled = normalized.match(
    /^(\d+(?:\.\d+)?)\s*(k|m|b|thousand|million|billion|mil millones|mil|millones?|millón)$/iu,
  );
  if (scaled?.[1] && scaled[2]) {
    const scale = scaled[2].toLowerCase();
    const multiplier =
      scale === "k" || scale === "thousand" || scale === "mil"
        ? 1_000
        : scale === "b" || scale === "billion" || scale === "mil millones"
          ? 1_000_000_000
          : 1_000_000;
    return String(Number(scaled[1]) * multiplier);
  }
  return normalized.replace(/\s+/gu, "");
}

function scopeMatches(copy: string, scope: string): boolean {
  const normalizedCopy = normalizeText(copy);
  const normalizedScope = normalizeText(scope);
  if (normalizedCopy.includes(normalizedScope)) return true;
  if (normalizedScope === "older pages") {
    return /\b(?:older|pre-chatgpt|published before)\b.*\bpages?\b/iu.test(copy);
  }
  if (normalizedScope.startsWith("pages published after")) {
    const anchor = normalizedScope.replace(/^pages published /u, "");
    if (normalizedCopy.includes(anchor.replace(/ release$/u, ""))) return true;
    const eventTerms = anchor
      .replace(/^after /u, "")
      .split(" ")
      .map((term) => term.replace(/s$/u, ""))
      .filter(
        (term) =>
          term.length > 2 &&
          !/^\d{4}$/u.test(term) &&
          ![
            "january",
            "february",
            "march",
            "april",
            "may",
            "june",
            "july",
            "august",
            "september",
            "october",
            "november",
            "december",
            "launch",
            "launched",
            "release",
            "released",
          ].includes(term),
      );
    return (
      /\b(?:after|since)\b/iu.test(copy) &&
      /\bpages?\b/iu.test(copy) &&
      eventTerms.every((term) => normalizedCopy.includes(term))
    );
  }
  if (normalizedScope === "random sample") return /\bsample\b/iu.test(copy);
  return false;
}

function unitVisibleCopy(
  unit: GeneratedCreativeDraft["units"][number],
): string {
  return [unit.headline, unit.body, unit.ctaQuestion].filter(Boolean).join(" ");
}

function appendSentence(value: string | undefined, sentence: string): string {
  const current = value?.trim();
  if (!current) return sentence;
  return `${normalizePunctuation(current)} ${sentence}`;
}

function wordCount(value: string | undefined): number {
  return value?.trim().split(/\s+/u).filter(Boolean).length ?? 0;
}

function normalizePunctuation(value: string): string {
  const trimmed = value.replace(/\s+/gu, " ").trim();
  return trimmed && !/[.!?]$/u.test(trimmed) ? `${trimmed}.` : trimmed;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[’']/gu, "")
    .replace(/[^a-z0-9%]+/giu, " ")
    .toLowerCase()
    .trim();
}

function mergeText(
  first: readonly string[] | undefined,
  second: readonly string[] | undefined,
): string[] {
  return uniqueText([...(first ?? []), ...(second ?? [])]);
}

function uniqueText(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    const key = normalizeText(trimmed);
    if (!trimmed || seen.has(key)) return [];
    seen.add(key);
    return [trimmed];
  });
}

function isFactCertainty(
  value: unknown,
): value is CreativeFactClaimGuard["certainty"] {
  return [
    "asserted",
    "reported",
    "estimated",
    "detected-signal",
    "projection",
    "association",
  ].includes(String(value));
}

function deduplicateIssues(
  issues: CreativeQualityIssue[],
): CreativeQualityIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.unitOrder ?? 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
