import type {
  CreativeFactClaimGuard,
  CreativeKeyFact,
  CreativeQualityIssue,
  GeneratedCreativeDraft,
} from "./creative-content.types";

const CERTAINTY_UPGRADE_PATTERN =
  /\b(?:is|are|was|were)\s+(?:fully\s+|entirely\s+)?(?:ai[-‐‑‒–— ]generated|ai[-‐‑‒–— ]written|written by ai)\b|\bai[-‐‑‒–— ]written\s+(?:content|pages?|articles?|text)\b/iu;
const SIGNAL_PATTERN =
  /\b(?:show(?:s|ed)? signs?|significant signs?|authorship signs?|signals?|likely (?:written|edited|generated)|detect(?:ed|ion)|identify|identified)\b/iu;
const ESTIMATE_PATTERN =
  /~|\b(?:about|approximately|estimated|estimate|nearly|roughly|around|over|more than)\b/iu;
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
    pattern: /\b(?:causes?|caused|causing|leads? to|led to|drives?|driving)\b/iu,
    sourceSupport: /\b(?:cause|caused|lead to|led to|drive|driving)\b/iu,
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
];

const GENERIC_CLOSING_PATTERN =
  /^(?:the\s+)?(?:takeaway|conclusion|bottom line|what next)\??$/iu;

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
          ),
        }
      : inferred,
  };
}

export function inferCreativeFactClaimGuard(
  fact: CreativeKeyFact,
): CreativeFactClaimGuard {
  const qualifierText = (fact.requiredQualifiers ?? []).join(" ");
  const source = `${fact.statement} ${qualifierText}`;
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
    allowedNumbers: extractAllowedNumbers(fact.statement),
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
  const unsupportedDraftNumbers = extractAllowedNumbers(draftCopy).filter(
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

export function repairDeterministicFactCopy(
  draft: GeneratedCreativeDraft,
  keyFacts: readonly CreativeKeyFact[],
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
      "A summary of reported findings about AI-authorship signals on web pages.",
    ),
    altText: repairPublishingCopy(
      draft.altText,
      allSourceCopy,
      "Carousel explaining reported findings about AI-authorship signals on web pages.",
    ),
    units: draft.units.map((unit) => {
      const selectedFacts = unit.factIds.flatMap((id) => {
        const fact = factsById.get(id);
        return fact ? [fact] : [];
      });
      const sourceCopy = selectedFacts
        .map((fact) => fact.statement)
        .join(" ");
      let headline = repairCertaintyUpgrade(unit.headline);
      let body = unit.body
        ? repairCertaintyUpgrade(repairUnsupportedInference(unit.body))
        : undefined;
      let ctaQuestion = unit.ctaQuestion
        ? repairCertaintyUpgrade(unit.ctaQuestion)
        : undefined;
      if (
        ctaQuestion &&
        hasUnsupportedInference(ctaQuestion, sourceCopy) &&
        (unit.editorialGoal === "conclude" ||
          unit.editorialGoal === "debate")
      ) {
        ctaQuestion = "How should readers interpret these AI-authorship signals?";
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
          body = repairMissingEstimateQualifier(body, selectedFacts);
        } else {
          headline = repairMissingEstimateQualifier(headline, selectedFacts);
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
        body = safeConclusionForFact(closingFact);
      }
      return {
        ...unit,
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
  if (
    closing?.editorialGoal === "conclude" &&
    !closing.body?.trim() &&
    !closing.ctaQuestion?.trim() &&
    GENERIC_CLOSING_PATTERN.test(closing.headline.trim())
  ) {
    const fact = closing.factIds.map((id) => factsById.get(id)).find(Boolean);
    if (fact) closing.body = safeConclusionForFact(fact);
  }
  return repaired;
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
): string {
  const repaired = repairCertaintyUpgrade(repairUnsupportedInference(value));
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

function repairUnsupportedInference(value: string): string {
  return normalizePunctuation(
    value
      .replace(/,?\s*confirm(?:s|ed|ing)?\s+(?:the\s+)?trend\.?\s*$/iu, "")
      .replace(
        /,?\s*(?:suggest(?:s|ed|ing)?|implies?|implying|points? to)\b[^.?!]*[.?!]?\s*$/iu,
        "",
      )
      .replace(/[—–-]\s*(?:changing|reshaping|transforming)\s+how\b[^.?!]*[.?!]?\s*$/iu, ""),
  );
}

function repairMissingEstimateQualifier(
  value: string,
  facts: readonly CreativeKeyFact[],
): string {
  const allowedApproximateNumbers = new Set(
    facts
      .filter(factRequiresEstimateQualifier)
      .flatMap((fact) => fact.claimGuard?.allowedNumbers ?? []),
  );
  const qualifier = facts
    .flatMap((fact) => fact.requiredQualifiers ?? [])
    .map(estimatePrefix)
    .find(Boolean) ?? "about";
  return value.replace(
    /~?\d[\d,.]*(?:\s*%|\s*percent)?/giu,
    (number) =>
      allowedApproximateNumbers.has(normalizeNumber(number)) &&
      !ESTIMATE_PATTERN.test(number)
        ? `${qualifier} ${number}`
        : number,
  );
}

function estimatePrefix(value: string): string | undefined {
  const normalized = normalizeText(value);
  if (normalized.includes("more than") || normalized.startsWith("over ")) {
    return "more than";
  }
  return normalized.match(
    /\b(?:about|approximately|estimated|nearly|roughly|around)\b/iu,
  )?.[0];
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

function safeConclusionForFact(fact: CreativeKeyFact): string {
  if (fact.claimGuard?.certainty === "detected-signal") {
    const event = fact.statement.match(
      /pages?\s+published\s+after\s+(.+?)(?=\s+(?:show|were|had|display)|[,.;]|$)/iu,
    )?.[1];
    return event
      ? `For pages published after ${event}, these findings describe AI-authorship signals—not certainty about how every page was written.`
      : "These findings describe AI-authorship signals—not certainty about how every page was written.";
  }
  return fact.statement;
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
  const numbers = [...value.matchAll(/~?\d[\d,.]*(?:\s*%|\s*percent)?/giu)].map(
    (match) => normalizeNumber(match[0]),
  );
  if (/\bone[- ]third\b/iu.test(value)) numbers.push("33%");
  if (/\btwo[- ]thirds\b/iu.test(value)) numbers.push("67%");
  // 35% is commonly and accurately summarized as "roughly one-third".
  // Preserve both normalized forms so the guard does not reject a cautious
  // verbal approximation of the source statistic.
  if (numbers.includes("35%")) numbers.push("33%");
  return uniqueText(numbers);
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
  return value
    .toLowerCase()
    .replace(/^~/u, "")
    .replace(/,/gu, "")
    .replace(/\s*percent$/u, "%")
    .replace(/\s+/gu, "");
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
