import {
  blockingCarouselNarrativeIssues,
  dropTrailingSentenceFragment,
  evaluateCarouselNarrative,
  isInstitutionFirstCoverCopy,
  maximumFactsForGoal,
  stripRecapLabelPrefix,
  trailingSentenceFragment,
} from "./carousel-narrative";
import type {
  CreativeConversionGoal,
  CreativeFormat,
  CreativeFramingStrategy,
  CreativeKeyFact,
  CreativeQualityIssue,
  CreativeQualityReview,
  CreativeQualityScores,
  GeneratedCreativeDraft,
} from "./creative-content.types";
import {
  deterministicFactQualityIssues,
  repairDeterministicFactCopy,
} from "./creative-fact-guard";
import {
  collapseStackedEstimateQualifiers,
  substantiveCreativeNumericLiterals as substantiveEvidenceNumbers,
} from "./creative-number-normalization";
import {
  reconcileCriticIssuesWithDeterministicValidation,
} from "./creative-issue-reconciliation";

export const CREATIVE_QUALITY_THRESHOLDS = {
  factuality: 96,
  hook: 90,
  curiosity: 88,
  swipeReward: 80,
  continuity: 80,
  relevance: 80,
  clarity: 80,
  resolution: 88,
  cta: 75,
  overall: 95,
} as const satisfies CreativeQualityScores;

export const MAX_CREATIVE_EDITORIAL_REPAIRS = 1;

export type CreativeDraftApprovalState = {
  blockers: CreativeQualityIssue[];
  requiresHumanReviewAcknowledgement: boolean;
};

/**
 * Keeps deterministic validation separate from the automated critic's
 * judgment. A reviewer must explicitly acknowledge the latter, but may never
 * approve around a deterministic factual or editorial blocker.
 */
export function getCreativeDraftApprovalState({
  deterministicIssues,
  qualityReview,
  qualityReviewIsCurrent,
}: {
  deterministicIssues: readonly CreativeQualityIssue[];
  qualityReview?: CreativeQualityReview;
  qualityReviewIsCurrent?: boolean;
}): CreativeDraftApprovalState {
  const blockers = deterministicIssues.filter(
    (issue) => issue.severity === "blocker",
  );

  return {
    blockers,
    requiresHumanReviewAcknowledgement:
      blockers.length === 0 &&
      Boolean(
        qualityReviewIsCurrent &&
          creativeQualityReviewHasUnresolvedBlockers(
            qualityReview,
            deterministicIssues,
          ),
      ),
  };
}

export function repairDeterministicCreativeCopy(
  draft: GeneratedCreativeDraft,
  format: CreativeFormat,
  keyFacts: readonly CreativeKeyFact[] = [],
  language?: string,
  conversionGoal?: CreativeConversionGoal,
): GeneratedCreativeDraft {
  const cleanText = (value: string) =>
    collapseStackedEstimateQualifiers(repairMalformedGroupedNumbers(value));
  const repaired: GeneratedCreativeDraft = {
    ...draft,
    concept: cleanText(draft.concept),
    caption: dropTrailingSentenceFragment(cleanText(draft.caption)),
    ...(draft.callToAction === undefined
      ? {}
      : { callToAction: cleanText(draft.callToAction) }),
    altText: cleanText(draft.altText),
    hashtags: [...draft.hashtags],
    units: draft.units.map((unit) => ({
      ...unit,
      headline: cleanText(unit.headline),
      ...(unit.subheadline === undefined
        ? {}
        : { subheadline: cleanText(unit.subheadline) }),
      ...(unit.body === undefined ? {} : { body: cleanText(unit.body) }),
      ...(unit.continuationCue === undefined
        ? {}
        : { continuationCue: cleanText(unit.continuationCue) }),
      ...(unit.ctaQuestion === undefined
        ? {}
        : { ctaQuestion: cleanText(unit.ctaQuestion) }),
      factIds: [...unit.factIds],
      characterIds: [...(unit.characterIds ?? [])],
    })),
  };
  if (format === "carousel") {
    if (
      repaired.callToAction &&
      isGenericFollowCallToAction(repaired.callToAction)
    ) {
      delete repaired.callToAction;
    }
    repaired.units.forEach((unit, unitIndex) => {
      if (unit.editorialGoal) {
        unit.factIds = unit.factIds.slice(
          0,
          maximumFactsForGoal(unit.editorialGoal),
        );
      }
      if (unit.continuationCue) {
        unit.continuationCue = stripRecapLabelPrefix(unit.continuationCue);
      }
      if (unit.body) {
        unit.body = dropTrailingSentenceFragment(unit.body);
      }
      if (isSpanishProfileLanguage(language)) {
        // A critic can accidentally paste an English source excerpt into an
        // otherwise Spanish slide. Optional copy is safer to omit than to
        // publish a guessed translation of source evidence.
        if (
          unit.body &&
          hasLikelyEnglishSentence(unit.body) &&
          !hasLikelyEnglishSentence(unit.headline)
        ) {
          unit.body = localizedEvidenceFallback(unit.editorialGoal, language);
        }
        if (
          unit.subheadline &&
          hasLikelyEnglishSentence(unit.subheadline) &&
          !hasLikelyEnglishSentence(unit.headline)
        ) {
          delete unit.subheadline;
        }
        if (
          unit.continuationCue &&
          hasLikelyEnglishSentence(unit.continuationCue)
        ) {
          delete unit.continuationCue;
        }
        if (unit.ctaQuestion && hasLikelyEnglishSentence(unit.ctaQuestion)) {
          if (unit.editorialGoal === "debate") {
            unit.ctaQuestion = localizedDebateQuestion(language);
          } else {
            delete unit.ctaQuestion;
          }
        }
      }
      const evidence = evidenceForUnit(unit.factIds, keyFacts);
      const cueEvidence = evidenceForUnit(
        [
          ...new Set([
            ...unit.factIds,
            ...(repaired.units[unitIndex + 1]?.factIds ?? []),
          ]),
        ],
        keyFacts,
      );
      unit.visualDirection = repairUnverifiedQuantitativeVisual(
        unit.visualDirection,
        evidence,
        language,
      );
      unit.headline = softenUnsupportedAbsolutes(unit.headline, evidence);
      if (unit.subheadline) {
        unit.subheadline = softenUnsupportedAbsolutes(
          unit.subheadline,
          evidence,
        );
      }
      if (unit.body) unit.body = softenUnsupportedAbsolutes(unit.body, evidence);
      if (unit.continuationCue) {
        unit.continuationCue = softenUnsupportedAbsolutes(
          unit.continuationCue,
          cueEvidence,
        );
      }
      if (unit.ctaQuestion) {
        unit.ctaQuestion = softenUnsupportedAbsolutes(unit.ctaQuestion, evidence);
      }
    });
    const closing = repaired.units.at(-1);
    if (closing) {
      closing.headline = stripRecapLabelPrefix(closing.headline);
      if (closing.subheadline) {
        closing.subheadline = stripRecapLabelPrefix(closing.subheadline);
      }
      if (
        closing.ctaQuestion &&
        isGenericFollowCallToAction(closing.ctaQuestion)
      ) {
        if (closing.editorialGoal === "debate") {
          closing.ctaQuestion = localizedDebateQuestion(language);
        } else {
          delete closing.ctaQuestion;
        }
      }
      // A carousel gets one primary conversion action. Prefer the visible
      // closing CTA over repeating a second request in publishing copy.
      if (
        !conversionGoal &&
        closing.ctaQuestion?.trim() &&
        repaired.callToAction?.trim()
      ) {
        delete repaired.callToAction;
      }
      if (
        !conversionGoal &&
        closing.editorialGoal === "debate" &&
        !closing.ctaQuestion?.trim() &&
        ![closing.headline, closing.body].some((value) => value?.includes("?")) &&
        closing.viewerQuestion?.trim()
      ) {
        closing.ctaQuestion = localizedDebateQuestion(language);
      }
      if (
        closing.editorialGoal === "debate" &&
        closing.ctaQuestion?.trim() &&
        closing.viewerQuestion?.trim() &&
        normalizeQuestionCopy(closing.ctaQuestion) ===
          normalizeQuestionCopy(closing.viewerQuestion)
      ) {
        closing.ctaQuestion = localizedDebateQuestion(language);
      }
      if (
        closing.editorialGoal === "debate" &&
        closing.ctaQuestion?.trim() &&
        isSpanishProfileLanguage(language) &&
        hasLikelyEnglishSentence(closing.ctaQuestion)
      ) {
        closing.ctaQuestion = "¿Qué te sorprendió más de esta información?";
      }
      if (
        closing.editorialGoal === "debate" &&
        closing.ctaQuestion?.trim() &&
        !closing.ctaQuestion.includes("?")
      ) {
        closing.ctaQuestion = `${closing.ctaQuestion.replace(/[.!]+$/u, "").trim()}?`;
      }
      if (
        closing.editorialGoal === "debate" &&
        closing.ctaQuestion?.trim() &&
        isGenericClosingQuestion(closing.ctaQuestion)
      ) {
        closing.ctaQuestion = groundedClosingQuestion(
          repaired.concept,
          language,
          closing.viewerQuestion,
        );
      }

      const fields = [
        "headline",
        "subheadline",
        "body",
        "ctaQuestion",
      ] as const;
      const questionFields = fields.filter(
        (field) => closing[field]?.includes("?"),
      );
      if (questionFields.length > 1) {
        const canonicalField = questionFields.includes("ctaQuestion")
          ? "ctaQuestion"
          : questionFields.includes("body")
            ? "body"
            : "headline";

        questionFields.forEach((field) => {
          if (field === canonicalField) return;
          const replacement = withoutQuestionSentences(closing[field]);
          if (field === "headline") {
            closing.headline =
              replacement || closingHeadlineFallback(closing.editorialGoal);
          } else if (replacement) {
            closing[field] = replacement;
          } else {
            delete closing[field];
          }
        });
      }
    }
  }
  const factRepaired = repairDeterministicFactCopy(
    repaired,
    keyFacts,
    language,
  );
  if (format === "carousel") {
    // Fact repair may add a uniquely matching numeric fact or restore a source
    // statement on an evidence slide. Re-apply presentation constraints last
    // so those useful factual repairs cannot violate the narrative budget or
    // leak source-language copy into the published slide.
    factRepaired.units.forEach((unit) => {
      if (unit.editorialGoal) {
        unit.factIds = unit.factIds.slice(
          0,
          maximumFactsForGoal(unit.editorialGoal),
        );
      }
      if (!isSpanishProfileLanguage(language)) return;
      if (
        unit.body &&
        hasLikelyEnglishSentence(unit.body) &&
        !hasLikelyEnglishSentence(unit.headline)
      ) {
        unit.body = localizedEvidenceFallback(unit.editorialGoal, language);
      }
      if (
        unit.subheadline &&
        hasLikelyEnglishSentence(unit.subheadline) &&
        !hasLikelyEnglishSentence(unit.headline)
      ) {
        delete unit.subheadline;
      }
      if (
        unit.continuationCue &&
        hasLikelyEnglishSentence(unit.continuationCue)
      ) {
        delete unit.continuationCue;
      }
      if (unit.ctaQuestion && hasLikelyEnglishSentence(unit.ctaQuestion)) {
        if (unit.editorialGoal === "debate") {
          unit.ctaQuestion = localizedDebateQuestion(language);
        } else {
          delete unit.ctaQuestion;
        }
      }
    });
  }
  return repairConversionGoalCtas(
    factRepaired,
    format,
    conversionGoal,
    language,
  );
}

const FOLLOW_CTA_PATTERN =
  /\b(?:follow(?: us| this account)?|síguenos?|sígueme|seguir)\b/iu;
const SAVE_CTA_PATTERN =
  /\b(?:save this|save it|bookmark|guarda(?: este| esta| esto)?|guárdalo|guardarlo|guardar)\b/iu;
const SHARE_CTA_PATTERN =
  /\b(?:share this|share it|send this|forward this|comparte (?:este|esta|esto)|compártelo|envía(?:lo)? a|reenvía)\b/iu;
const DISCUSSION_CTA_PATTERN =
  /\b(?:comment|tell us|share your (?:view|experience)|comenta|cu[eé]ntanos|dinos|qu[eé] opinas|tu opini[oó]n)\b/iu;

function detectedCtaGoals(value: string): Set<CreativeConversionGoal> {
  const copy = value.trim();
  const detected = new Set<CreativeConversionGoal>();
  if (!copy) return detected;
  if (FOLLOW_CTA_PATTERN.test(copy)) detected.add("followers");
  if (SAVE_CTA_PATTERN.test(copy)) detected.add("saves");
  if (SHARE_CTA_PATTERN.test(copy)) detected.add("shares");
  if (DISCUSSION_CTA_PATTERN.test(copy)) detected.add("discussion");
  if (detected.size === 0 && copy.includes("?")) detected.add("discussion");
  return detected;
}

function ctaConflictsWithConversionGoal(
  value: string,
  goal: CreativeConversionGoal,
  language?: string,
): boolean {
  const detected = detectedCtaGoals(value);
  if (detected.size > 1) return true;
  if (detected.size === 1) return !detected.has(goal);
  return isEnglishProfileLanguage(language) || isSpanishProfileLanguage(language);
}

function repairConversionGoalCtas(
  draft: GeneratedCreativeDraft,
  format: CreativeFormat,
  goal?: CreativeConversionGoal,
  language?: string,
): GeneratedCreativeDraft {
  if (!goal) return draft;
  const repaired = {
    ...draft,
    units: draft.units.map((unit) => ({ ...unit })),
  };

  if (format === "meme") {
    if (
      repaired.callToAction &&
      ctaConflictsWithConversionGoal(repaired.callToAction, goal, language)
    ) {
      delete repaired.callToAction;
    }
    return repaired;
  }

  const closing = repaired.units.at(-1);
  if (!closing) {
    delete repaired.callToAction;
    return repaired;
  }
  const visibleCta = closing.ctaQuestion?.trim();
  const generalCta = repaired.callToAction?.trim();
  const matchingCta =
    (visibleCta && !ctaConflictsWithConversionGoal(visibleCta, goal, language)
      ? visibleCta
      : undefined) ??
    (generalCta && !ctaConflictsWithConversionGoal(generalCta, goal, language)
      ? generalCta
      : undefined);

  delete repaired.callToAction;
  if (matchingCta) {
    closing.ctaQuestion = matchingCta;
  } else if (
    goal === "followers" &&
    // Only for a language this repair can actually write. Any other profile
    // language would get an English CTA that no language check would catch.
    (isSpanishProfileLanguage(language) || isEnglishProfileLanguage(language)) &&
    !draftLooksLikeSensitiveCoverage(draft) &&
    (closing.role === "conclusion" ||
      closing.role === "call-to-action" ||
      closing.editorialGoal === "conclude" ||
      closing.editorialGoal === "debate")
  ) {
    // The model routinely omits the follow request on routine stories. Insert a
    // benefit-led default rather than surface a blocker; an editor can refine it.
    closing.ctaQuestion = defaultFollowCta(language);
  } else {
    delete closing.ctaQuestion;
  }
  return repaired;
}

function defaultFollowCta(language?: string): string {
  return isSpanishProfileLanguage(language)
    ? "Síguenos para entender qué significa para ti cada novedad del tema."
    : "Follow to see what each update on this topic means for you.";
}

function localizedDebateQuestion(language?: string): string {
  return isSpanishProfileLanguage(language)
    ? "¿Qué te sorprendió más de esta información?"
    : "What stands out most to you?";
}

function localizedEvidenceFallback(
  goal: GeneratedCreativeDraft["units"][number]["editorialGoal"],
  language?: string,
): string | undefined {
  if (goal === "conclude" || goal === "debate") return undefined;
  return isSpanishProfileLanguage(language)
    ? "Este es el dato clave señalado por la fuente."
    : "This is the key point established by the source.";
}

const GENERIC_CTA_PATTERN =
  /^(?:[¿¡\s]*(?:what stands out(?: most)? to you|what do you think|thoughts|what surprised you(?: most)?|qué te sorprendió más(?: de esta información)?|qué opinas|cuál es tu opinión)[?.!¿¡\s]*|where would you apply how\b.*\bfirst\?|how would\b.+\bchange your approach\?|¿cómo cambiaría\b.+\btu enfoque\?)$/iu;

const GENERIC_FOLLOW_CTA_PATTERN =
  /^(?:follow(?: us| this account)? for more(?: content| updates)?|síguenos?(?: en esta cuenta)? para (?:más|más contenido|más información|más novedades))[.!¡\s]*$/iu;

function isGenericFollowCallToAction(value: string): boolean {
  return GENERIC_FOLLOW_CTA_PATTERN.test(value.trim());
}

const ABSOLUTE_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  support: RegExp;
  replacement: string;
}> = [
  { pattern: /\bzero[- ]drift\b/giu, support: /\bzero[- ]drift\b/iu, replacement: "automated drift" },
  { pattern: /\beliminat(?:e|es|ed|ing)\b/giu, support: /\beliminat(?:e|es|ed|ing)\b/iu, replacement: "reduces" },
  { pattern: /\bguarantee(?:s|d|ing)?\b/giu, support: /\bguarantee(?:s|d|ing)?\b/iu, replacement: "helps ensure" },
  { pattern: /\b(?:always|never)\b/giu, support: /\b(?:always|never)\b/iu, replacement: "consistently" },
];

function evidenceForUnit(
  factIds: readonly string[],
  keyFacts: readonly CreativeKeyFact[],
): string {
  return keyFacts
    .filter((fact) => factIds.includes(fact.id))
    .map((fact) => fact.sourceExcerpt?.trim() || fact.statement)
    .join(" ");
}

function softenUnsupportedAbsolutes(value: string, evidence: string): string {
  return ABSOLUTE_PATTERNS.reduce(
    (copy, rule) =>
      rule.support.test(evidence)
        ? copy
        : copy.replace(rule.pattern, (match) =>
            /^\p{Lu}/u.test(match)
              ? `${rule.replacement.charAt(0).toUpperCase()}${rule.replacement.slice(1)}`
              : rule.replacement,
          ),
    value,
  );
}

function containsUnsupportedAbsolute(value: string, evidence: string): boolean {
  return ABSOLUTE_PATTERNS.some(
    (rule) => rule.pattern.test(value) && !rule.support.test(evidence),
  );
}

function isGenericClosingQuestion(value: string): boolean {
  return GENERIC_CTA_PATTERN.test(value.trim());
}

function groundedClosingQuestion(
  _concept: string,
  language?: string,
  viewerQuestion?: string,
): string {
  const internalQuestion = viewerQuestion?.trim();
  if (
    internalQuestion?.includes("?") &&
    !isInternalPlanningQuestion(internalQuestion) &&
    !isGenericClosingQuestion(internalQuestion) &&
    !(isSpanishProfileLanguage(language) && hasLikelyEnglishSentence(internalQuestion))
  ) {
    return internalQuestion;
  }
  return isSpanishProfileLanguage(language)
    ? "¿Qué lectura haces de estos datos?"
    : "What is your reading of these findings?";
}

function isInternalPlanningQuestion(value: string): boolean {
  return /\b(?:what question should (?:the )?viewer|what should (?:the )?(?:viewer|readers?|audience) consider|why should (?:the viewer|i) care|what happened and why|viewer question|pregunta (?:interna|para el espectador))\b/iu.test(
    value,
  );
}

function normalizeQuestionCopy(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function deterministicCreativeQualityIssues(
  draft: GeneratedCreativeDraft,
  format: CreativeFormat,
  keyFacts: readonly CreativeKeyFact[] = [],
  language?: string,
  conversionGoal?: CreativeConversionGoal,
  framingStrategy?: CreativeFramingStrategy,
): CreativeQualityIssue[] {
  const narrativeIssues =
    format === "carousel"
      ? evaluateCarouselNarrative(
          draft.units,
          draft.narrativeRationale,
          conversionGoal,
          framingStrategy,
        ).map((issue) => ({
          code: issue.code.toUpperCase().replaceAll("-", "_"),
          severity: issue.severity === "blocker" ? "blocker" as const : "warning" as const,
          message: issue.message,
          ...(issue.unitIndex === undefined
            ? {}
            : { unitOrder: issue.unitIndex + 1 }),
        }))
      : [];
  const editorialPrecisionIssues = draft.units.flatMap((unit, unitIndex) => {
    const evidence = evidenceForUnit(unit.factIds, keyFacts);
    const cueEvidence = evidenceForUnit(
      [
        ...new Set([
          ...unit.factIds,
          ...(draft.units[unitIndex + 1]?.factIds ?? []),
        ]),
      ],
      keyFacts,
    );
    const unitCopy = [
      unit.headline,
      unit.subheadline,
      unit.body,
      unit.ctaQuestion,
    ]
      .filter(Boolean)
      .join(" ");
    const continuationCopy = unit.continuationCue?.trim() ?? "";
    const visibleCopy = [unitCopy, continuationCopy].filter(Boolean).join(" ");
    const issues: CreativeQualityIssue[] =
      containsUnsupportedAbsolute(unitCopy, evidence) ||
      containsUnsupportedAbsolute(continuationCopy, cueEvidence)
      ? [{
          code: "UNSUPPORTED_ABSOLUTE",
          severity: "blocker" as const,
          unitOrder: unit.order,
          message: `Slide ${unit.order} uses an absolute promise that its selected evidence does not establish.`,
        }]
      : [];
    if (hasMalformedGroupedNumber(visibleCopy)) {
      issues.push({
        code: "MALFORMED_NUMBER_FORMAT",
        severity: "blocker",
        unitOrder: unit.order,
        message: `Slide ${unit.order} contains whitespace inside a grouped number. Use a form such as 155.000 or 155,000 without spaces around the separator.`,
      });
    }
    if (
      requestsQuantitativeChart(unit.visualDirection) &&
      substantiveEvidenceNumbers(evidence).length < 2 &&
      !declaresQualitativeVisual(unit.visualDirection)
    ) {
      issues.push({
        code: "UNVERIFIED_QUANTITATIVE_VISUAL",
        severity: "warning",
        unitOrder: unit.order,
        message: `Slide ${unit.order} requests a quantitative chart without enough exact values; use a clearly non-proportional conceptual comparison instead.`,
      });
    }
    return issues;
  });
  const closing = draft.units.at(-1);
  const ctaSpecificityIssues =
    format === "carousel" &&
    closing?.ctaQuestion?.trim() &&
    isGenericClosingQuestion(closing.ctaQuestion)
      ? [{
          code: "GENERIC_CTA",
          severity: "blocker" as const,
          unitOrder: closing.order,
          message:
            "The closing question is generic; connect it to the carousel's central concept.",
        }]
      : [];
  const followCtaIssues = format === "carousel"
    ? [
        ...(draft.callToAction?.trim() &&
        isGenericFollowCallToAction(draft.callToAction)
          ? [{ unitOrder: undefined }]
          : []),
        ...(closing?.ctaQuestion?.trim() &&
        isGenericFollowCallToAction(closing.ctaQuestion)
          ? [{ unitOrder: closing.order }]
          : []),
      ].map(({ unitOrder }) => ({
        code: "GENERIC_FOLLOW_CTA",
        severity: "blocker" as const,
        ...(unitOrder === undefined ? {} : { unitOrder }),
        message:
          "The follow CTA is generic; state the recurring topic value people will receive, or omit the CTA when it is inappropriate.",
      }))
    : [];
  const conversionGoalIssues = conversionGoal
    ? deterministicConversionGoalIssues(
        draft,
        format,
        conversionGoal,
        language,
      )
    : [];
  const captionTableOfContentsIssues =
    format === "carousel" && isTableOfContentsCaption(draft.caption)
      ? [{
          code: "CAPTION_TABLE_OF_CONTENTS",
          severity: "warning" as const,
          message:
            "The caption describes the carousel's structure (\"El carrusel comienza con…\", \"Luego, la inflación:\", \"primero… después…\") instead of carrying the story's hook; open it with the reader-relevant point.",
        }]
      : [];
  const captionInstitutionRecapIssues =
    format === "carousel" &&
    framingStrategy === "reader-consequence" &&
    isInstitutionFirstCoverCopy(firstSentenceOf(draft.caption))
      ? [{
          code: "CAPTION_INSTITUTION_RECAP",
          severity: "warning" as const,
          message:
            "The reader-consequence framing requires the caption's first sentence to carry the reader stake, but it opens with an institution or a bare policy-status statement.",
        }]
      : [];
  const captionFragment = trailingSentenceFragment(draft.caption);
  const captionTruncationIssues = captionFragment
    ? [{
        code: "CAPTION_TRUNCATED",
        severity: "warning" as const,
        message: `The caption ends with an incomplete sentence ("${captionFragment}"); finish the thought or drop it.`,
      }]
    : [];
  return [
    ...narrativeIssues,
    ...deterministicFactQualityIssues(draft, keyFacts),
    ...editorialPrecisionIssues,
    ...ctaSpecificityIssues,
    ...followCtaIssues,
    ...conversionGoalIssues,
    ...captionTableOfContentsIssues,
    ...captionInstitutionRecapIssues,
    ...captionTruncationIssues,
    ...visibleDraftLanguageIssues(draft, language),
  ];
}

function firstSentenceOf(value?: string): string {
  return value?.trim().split(/(?<=[.!?])\s+/u)[0]?.trim() ?? "";
}

const SENSITIVE_COVERAGE_PATTERN =
  /\b(?:muert|falleci|fallec|deceso|tragedia|tr[aá]gic|crisis|catastr|desastr|emergencia|v[ií]ctima|violenci|abus|asalt|tiroteo|disparo|homicid|asesinat|suicid|autolesi|accidente|herido|heridos|desaparecid|secuestr|guerra|conflicto armado|masacre|inundaci|terremot|incendio|brote|epidemi|pandemi|contagi|diagn[oó]stic|c[aá]ncer|enfermedad grave|hospitali|cuidados paliativos|duelo|death|died|fatal|tragedy|tragic|casualties|victim|violence|shooting|homicide|murder|suicide|self-harm|disaster|catastrophe|war|massacre|outbreak|epidemic|pandemic|terminal illness|palliative|grief|layoffs?|despidos?)\b/iu;

function draftLooksLikeSensitiveCoverage(draft: GeneratedCreativeDraft): boolean {
  const text = [
    draft.concept,
    draft.caption,
    ...draft.units.flatMap((unit) => [unit.headline, unit.subheadline, unit.body]),
  ]
    .filter(Boolean)
    .join(" ");
  return SENSITIVE_COVERAGE_PATTERN.test(text);
}

function isTableOfContentsCaption(caption?: string): boolean {
  const value = caption?.trim();
  if (!value) return false;
  return (
    /\b(?:este|el)\s+carrusel\s+(?:comienza|empieza|arranca|abre|explica|desglosa|repasa|cubre|te\s+(?:explica|cuenta|lleva))\b/iu.test(
      value,
    ) ||
    /\bdesglosa\s+por\s+qu[eé]\b/iu.test(value) ||
    /\bprimero\b[^.]*\b(?:despu[eé]s|luego|y\s+termina)\b/iu.test(value) ||
    /(?:^|[.!?]\s+)(?:luego|despu[eé]s|a\s+continuaci[oó]n)\s*,?\s+(?:la|el|los|las)\s+[\p{L}\p{N}]+\s*[:,]/iu.test(
      value,
    ) ||
    /\bthis\s+carousel\s+(?:starts|begins|opens|walks|breaks?\s+down|covers|explains)\b/iu.test(
      value,
    ) ||
    /\bfirst\b[^.]*\bthen\b[^.]*\b(?:finally|ends?\s+with)\b/iu.test(value)
  );
}

function deterministicConversionGoalIssues(
  draft: GeneratedCreativeDraft,
  format: CreativeFormat,
  goal: CreativeConversionGoal,
  language?: string,
): CreativeQualityIssue[] {
  const issues: CreativeQualityIssue[] = [];
  if (format === "meme") {
    if (!draft.callToAction?.trim()) {
      issues.push({
        code: "MISSING_CONVERSION_CTA",
        severity: "warning",
        message: `The ${goal} conversion goal has no CTA. Add one when it is appropriate for the story; omission remains allowed for sensitive coverage.`,
      });
      return issues;
    }
    if (
      ctaConflictsWithConversionGoal(draft.callToAction, goal, language)
    ) {
      issues.push({
        code: "CTA_GOAL_MISMATCH",
        severity: "blocker",
        message: `The meme CTA does not match the ${goal} conversion goal.`,
      });
    }
    return issues;
  }

  const closing = draft.units.at(-1);
  if (!closing?.ctaQuestion?.trim()) {
    // A routine story with a "followers" goal must ship the follow request; a
    // visual note about following the account does not fill the ctaQuestion
    // field. Omission stays a soft warning only for sensitive coverage.
    const routineFollowersGoal =
      goal === "followers" && !draftLooksLikeSensitiveCoverage(draft);
    issues.push({
      code: "MISSING_CONVERSION_CTA",
      severity: routineFollowersGoal ? "blocker" : "warning",
      ...(closing ? { unitOrder: closing.order } : {}),
      message: routineFollowersGoal
        ? "The followers conversion goal needs the follow request in the closing slide's ctaQuestion; this routine story is not sensitive coverage and a visual-direction note does not count."
        : `The ${goal} conversion goal has no CTA on the closing slide. Add one when it is appropriate for the story; omission remains allowed for sensitive coverage.`,
    });
  }
  if (draft.callToAction?.trim()) {
    issues.push({
      code: "CTA_LOCATION",
      severity: "blocker",
      message:
        "A carousel must keep its single CTA on the closing slide, not in the general CTA field.",
    });
  }
  if (
    closing &&
    closing.editorialGoal !== (goal === "discussion" ? "debate" : "conclude")
  ) {
    issues.push({
      code: "CTA_GOAL_MISMATCH",
      severity: "blocker",
      unitOrder: closing.order,
      message: `The closing narrative goal does not match the ${goal} conversion goal.`,
    });
  }
  if (
    closing?.ctaQuestion?.trim() &&
    ctaConflictsWithConversionGoal(closing.ctaQuestion, goal, language)
  ) {
    issues.push({
      code: "CTA_GOAL_MISMATCH",
      severity: "blocker",
      unitOrder: closing.order,
      message: `The visible closing CTA does not match the ${goal} conversion goal.`,
    });
  }
  return issues;
}

const MALFORMED_GROUPED_NUMBER_PATTERN =
  /\d\s*[.,]\s+(?=\d{3}\b)/gu;

function hasMalformedGroupedNumber(value: string): boolean {
  return new RegExp(MALFORMED_GROUPED_NUMBER_PATTERN).test(value);
}

function repairMalformedGroupedNumbers(value: string): string {
  return value.replace(/(\d)\s*([.,])\s+(?=\d{3}\b)/gu, "$1$2");
}

const AUTOMATICALLY_REPAIRABLE_REVIEW_CODES = new Set([
  "FACT_BUDGET",
  "MIXED_LANGUAGE",
  "GENERIC_CTA",
  "GENERIC_FOLLOW_CTA",
  "CTA_GOAL_MISMATCH",
  "CTA_LOCATION",
  "UNSUPPORTED_INFERENCE",
  // Numeric support is recalculated from the current copy and current facts.
  // Do not keep approval locked on a stale critic finding after deterministic
  // normalization (for example, Spanish decimal commas) proves it supported.
  "UNSUPPORTED_NUMBER",
  "UNSUPPORTED_ABSOLUTE",
  "CLOSING_QUESTION_COUNT",
  "MISSING_DEBATE_QUESTION",
]);

/**
 * The saved critic review describes the generated copy, while approval first
 * applies deterministic repairs. A repaired mechanical finding must not keep
 * human approval disabled; subjective and factual critic findings still do.
 */
export function creativeQualityReviewHasUnresolvedBlockers(
  review: CreativeQualityReview | undefined,
  currentIssues: readonly CreativeQualityIssue[],
): boolean {
  if (review?.status !== "rejected") return false;

  const currentBlockerKeys = new Set(
    currentIssues
      .filter((issue) => issue.severity === "blocker")
      .map((issue) => `${issue.code}:${issue.unitOrder ?? 0}`),
  );
  return review.issues.some((issue) => {
    if (issue.severity !== "blocker") return false;
    if (!AUTOMATICALLY_REPAIRABLE_REVIEW_CODES.has(issue.code)) return true;
    return currentBlockerKeys.has(`${issue.code}:${issue.unitOrder ?? 0}`);
  });
}

export function visibleDraftLanguageIssues(
  draft: GeneratedCreativeDraft,
  language?: string,
): CreativeQualityIssue[] {
  if (!isSpanishProfileLanguage(language)) return [];
  const issues: CreativeQualityIssue[] = [];
  const publishingFields = [draft.concept, draft.caption, draft.callToAction, draft.altText];
  if (publishingFields.some(hasLikelyEnglishSentence)) {
    issues.push({
      code: "MIXED_LANGUAGE",
      severity: "blocker",
      message: "The publishing copy contains English sentences, but the creative profile requires Spanish.",
    });
  }
  draft.units.forEach((unit) => {
    if (
      [
        unit.headline,
        unit.subheadline,
        unit.body,
        unit.continuationCue,
        unit.ctaQuestion,
      ].some(hasLikelyEnglishSentence)
    ) {
      issues.push({
        code: "MIXED_LANGUAGE",
        severity: "blocker",
        unitOrder: unit.order,
        message: `Slide ${unit.order} contains English copy, but the creative profile requires Spanish.`,
      });
    }
  });
  return issues;
}

function isSpanishProfileLanguage(language?: string): boolean {
  return /^(?:es|spa|spanish|espanol|español)(?:\b|[-_])/iu.test(
    language?.trim() ?? "",
  );
}

function isEnglishProfileLanguage(language?: string): boolean {
  return /^(?:en|eng|english)(?:\b|[-_])/iu.test(language?.trim() ?? "");
}

function hasLikelyEnglishSentence(value?: string): boolean {
  if (!value?.trim()) return false;
  if (SHORT_ENGLISH_EDITORIAL_PHRASE_PATTERN.test(value)) return true;
  const markers = value.match(
    /\b(?:the|when|from|your|will|within|during|there|chance|age|count|backwards|end|cycle|estimate|fertile|occur|what|why|how|did|does|this|mean|for|those|planning|buy|their|first|home|should|could|would|with|who|which|most|stands|out|you|know|that|is|are|available|only|hours|long)\b/giu,
  );
  return (markers?.length ?? 0) >= 3;
}

// Short source-language phrases can be unambiguously English without meeting
// the broader three-marker threshold above. Keep this list intentionally
// narrow so ordinary Spanish copy containing established loanwords such as
// "software", "startup", or "marketing" is not rejected.
const SHORT_ENGLISH_EDITORIAL_PHRASE_PATTERN =
  /\b(?:year[\s\-‐‑‒–—]+over[\s\-‐‑‒–—]+year|year[\s\-‐‑‒–—]+on[\s\-‐‑‒–—]+year|month[\s\-‐‑‒–—]+over[\s\-‐‑‒–—]+month|edge(?:d)?\s+(?:up|down)|little\s+changed)\b/iu;

const QUANTITATIVE_CHART_PATTERN =
  /\b(?:bar chart|column chart|line chart|comparison chart|comparative chart|quantitative chart|gr[aá]fic[oa] (?:de barras|de columnas|de l[ií]neas|comparativ[oa]|cuantitativ[oa])|barras? (?:comparativas?|proporcionales?)|ejes? (?:num[eé]ricos?|cuantitativos?)|plot)\b/iu;
const QUALITATIVE_VISUAL_PATTERN =
  /\b(?:qualitative|conceptual|non[- ]proportional|not to scale|without (?:a )?scale|sin escala|no proporcional|sin ejes|sin valores inventados)\b/iu;

function requestsQuantitativeChart(value: string): boolean {
  return QUANTITATIVE_CHART_PATTERN.test(value);
}

function declaresQualitativeVisual(value: string): boolean {
  return QUALITATIVE_VISUAL_PATTERN.test(value);
}

function repairUnverifiedQuantitativeVisual(
  value: string,
  evidence: string,
  language?: string,
): string {
  if (
    !requestsQuantitativeChart(value) ||
    substantiveEvidenceNumbers(evidence).length >= 2 ||
    declaresQualitativeVisual(value)
  ) {
    return value;
  }
  const constraint = isSpanishProfileLanguage(language)
    ? "Representa la comparación de forma conceptual y no proporcional, sin escala, ejes, barras cuantitativas ni valores inventados."
    : "Show the comparison conceptually and non-proportionally, with no scale, axes, quantitative bars, or invented values.";
  return `${value.replace(/\s+$/u, "")} ${constraint}`;
}

export function creativeQualityThresholdFailures(
  scores: CreativeQualityScores,
  format: CreativeFormat,
  requireCta: boolean,
): CreativeQualityIssue[] {
  const failures: CreativeQualityIssue[] = [];
  const required = {
    factuality: CREATIVE_QUALITY_THRESHOLDS.factuality,
    hook: CREATIVE_QUALITY_THRESHOLDS.hook,
    curiosity: CREATIVE_QUALITY_THRESHOLDS.curiosity,
    relevance: CREATIVE_QUALITY_THRESHOLDS.relevance,
    clarity: CREATIVE_QUALITY_THRESHOLDS.clarity,
    resolution: CREATIVE_QUALITY_THRESHOLDS.resolution,
    ...(requireCta ? { cta: CREATIVE_QUALITY_THRESHOLDS.cta } : {}),
    overall: CREATIVE_QUALITY_THRESHOLDS.overall,
    ...(format === "carousel"
      ? {
          swipeReward: CREATIVE_QUALITY_THRESHOLDS.swipeReward,
          continuity: CREATIVE_QUALITY_THRESHOLDS.continuity,
        }
      : {}),
  } satisfies Partial<CreativeQualityScores>;

  Object.entries(required).forEach(([dimension, minimum]) => {
    const score = scores[dimension as keyof CreativeQualityScores];
    if (score < minimum) {
      failures.push({
        code: `QUALITY_${dimension.toUpperCase()}_BELOW_THRESHOLD`,
        // Scores are editorial signals. Hard factual blocking requires a
        // concrete issue (unsupported number, scope, qualifier, attribution,
        // etc.), not a model's subjective numeric score by itself.
        severity: "warning",
        message: `${qualityLabel(dimension)} scored ${score}; the minimum is ${minimum}.`,
      });
    }
  });
  return failures;
}

export function buildCreativeQualityReview({
  draft,
  format,
  scores,
  criticIssues,
  repairPasses,
  keyFacts = [],
  conversionGoal,
  framingStrategy,
  language,
}: {
  draft: GeneratedCreativeDraft;
  format: CreativeFormat;
  scores: CreativeQualityScores;
  criticIssues: CreativeQualityIssue[];
  repairPasses: number;
  keyFacts?: readonly CreativeKeyFact[];
  conversionGoal?: CreativeConversionGoal;
  framingStrategy?: CreativeFramingStrategy;
  language?: string;
}): CreativeQualityReview {
  const deterministicIssues = deterministicCreativeQualityIssues(
    draft,
    format,
    keyFacts,
    language,
    conversionGoal,
    framingStrategy,
  );
  const reconciledCriticIssues =
    reconcileCriticIssuesWithDeterministicValidation(
      criticIssues,
      deterministicIssues,
    );
  const issues = deduplicateQualityIssues([
    ...deterministicIssues,
    ...reconciledCriticIssues,
  ]);
  const calibratedScores = calibrateCreativeQualityScores(
    scores,
    issues,
    format,
  );
  const reviewedIssues = deduplicateQualityIssues([
    ...issues,
    ...creativeQualityThresholdFailures(
      calibratedScores,
      format,
      Boolean(
        draft.callToAction?.trim() ||
          draft.units.at(-1)?.ctaQuestion?.trim() ||
          draft.units.at(-1)?.editorialGoal === "debate",
      ),
    ),
  ]);
  const deterministicBlockerKeys = new Set(
    deterministicIssues
      .filter((issue) => issue.severity === "blocker")
      .map(qualityIssueLocationKey),
  );
  const hardBlocked = reviewedIssues.some(
    (issue) =>
      issue.severity === "blocker" &&
      (deterministicBlockerKeys.has(qualityIssueLocationKey(issue)) ||
        HARD_FACTUAL_QUALITY_CODES.has(issue.code)),
  );
  const editorialRepairRequested =
    repairPasses === 0 &&
    reviewedIssues.some(
      (issue) =>
        issue.severity === "blocker" ||
        issue.code.startsWith("QUALITY_"),
    );
  const normalizedIssues =
    repairPasses > 0
      ? reviewedIssues.map((issue) =>
          issue.severity === "blocker" &&
          !deterministicBlockerKeys.has(qualityIssueLocationKey(issue)) &&
          !HARD_FACTUAL_QUALITY_CODES.has(issue.code)
            ? { ...issue, severity: "warning" as const }
            : issue,
        )
      : reviewedIssues;
  return {
    status: hardBlocked || editorialRepairRequested
      ? repairPasses >= MAX_CREATIVE_EDITORIAL_REPAIRS
        ? "rejected"
        : "needs-repair"
      : "accepted",
    scores: calibratedScores,
    issues: normalizedIssues,
    repairPasses,
  };
}

function qualityIssueLocationKey(issue: CreativeQualityIssue): string {
  return `${issue.code}:${issue.unitOrder ?? 0}`;
}

const HARD_FACTUAL_QUALITY_CODES = new Set([
  "CERTAINTY_UPGRADE",
  "FACT_MISMATCH",
  "LOST_QUALIFIER",
  "MISATTRIBUTED",
  "MISSING_SCOPE",
  "OVERSTATED",
  "UNSUPPORTED",
  "UNSUPPORTED_INFERENCE",
  "UNSUPPORTED_NUMBER",
]);

function calibrateCreativeQualityScores(
  input: CreativeQualityScores,
  issues: CreativeQualityIssue[],
  format: CreativeFormat,
): CreativeQualityScores {
  const scores = { ...input };
  const codes = new Set(issues.map((issue) => issue.code));
  const hasCode = (...values: string[]) => values.some((value) => codes.has(value));

  if (
    hasCode(
      "UNSUPPORTED",
      "OVERSTATED",
      "FACT_MISMATCH",
      "LOST_QUALIFIER",
      "MISATTRIBUTED",
      "CERTAINTY_UPGRADE",
      "UNSUPPORTED_NUMBER",
      "MISSING_SCOPE",
      "UNSUPPORTED_INFERENCE",
    )
  ) {
    scores.factuality = Math.min(scores.factuality, 94);
  }
  if (hasCode("WEAK_HOOK", "BURIED_HOOK")) {
    scores.hook = Math.min(scores.hook, 81);
  }
  if (
    hasCode(
      "LOW_HUMAN_CURIOSITY",
      "ABSTRACT_HOOK",
      "UNEARNED_PERSONAL_IMPACT",
      "COVER_NOT_READER_FRAMED",
      "COVER_SUPPORTING_RESTATES_HOLD",
    )
  ) {
    scores.curiosity = Math.min(scores.curiosity, 81);
  }
  if (hasCode("COVER_NOT_READER_FRAMED")) {
    scores.hook = Math.min(scores.hook, 81);
  }
  if (hasCode("LOW_STORY_RELEVANCE", "NEW_CLOSING_FACT", "CLOSING_GOAL")) {
    scores.relevance = Math.min(scores.relevance, 79);
  }
  if (
    hasCode(
      "VIEWER_QUESTION_MISMATCH",
      "WEAK_SWIPE_REWARD",
      "CUE_ECHOES_NEXT_HEADLINE",
    )
  ) {
    scores.swipeReward = Math.min(scores.swipeReward, 79);
  }
  if (
    hasCode(
      "SEMANTIC_REPETITION",
      "WEAK_CONTINUITY",
      "NEW_CLOSING_FACT",
      "CLOSING_GOAL",
    )
  ) {
    scores.continuity = Math.min(scores.continuity, 79);
  }
  if (
    hasCode(
      "DUPLICATE_CTA",
      "WEAK_CTA",
      "CTA_CONFLICT",
      "CTA_GOAL_MISMATCH",
      "CTA_LOCATION",
      "MISSING_DEBATE_QUESTION",
      "CLOSING_QUESTION_COUNT",
      "CLOSING_GOAL",
      "GENERIC_CTA",
      "GENERIC_FOLLOW_CTA",
    )
  ) {
    scores.cta = Math.min(scores.cta, 74);
  }
  if (hasCode("CLOSING_QUESTION_COUNT", "FACT_BUDGET")) {
    scores.clarity = Math.min(scores.clarity, 84);
  }
  if (hasCode("EMPTY_CONCLUSION")) {
    scores.clarity = Math.min(scores.clarity, 79);
    scores.relevance = Math.min(scores.relevance, 79);
    scores.cta = Math.min(scores.cta, 74);
  }
  if (
    hasCode(
      "WEAK_RESOLUTION",
      "HOOK_RESOLUTION_GAP",
      "RECAP_LABEL_HEADLINE",
      "REDUNDANT_CLOSING",
      "CLOSING_NOT_READER_RESOLVED",
    )
  ) {
    scores.resolution = Math.min(scores.resolution, 81);
  }

  const weightedOverall =
    format === "carousel"
      ? scores.factuality * 0.22 +
        scores.hook * 0.12 +
        scores.curiosity * 0.12 +
        scores.swipeReward * 0.08 +
        scores.continuity * 0.08 +
        scores.relevance * 0.12 +
        scores.clarity * 0.1 +
        scores.resolution * 0.08 +
        scores.cta * 0.08
      : scores.factuality * 0.28 +
        scores.hook * 0.16 +
        scores.curiosity * 0.16 +
        scores.relevance * 0.14 +
        scores.clarity * 0.12 +
        scores.resolution * 0.08 +
        scores.cta * 0.06;
  scores.overall = Math.min(scores.overall, Math.round(weightedOverall), 98);
  if (issues.some((issue) => issue.severity === "blocker")) {
    scores.overall = Math.min(scores.overall, 87);
  } else if (issues.length > 0) {
    scores.overall = Math.min(scores.overall, 92);
  }
  return scores;
}

export function assertNoDeterministicCreativeBlockers(
  draft: GeneratedCreativeDraft,
  format: CreativeFormat,
  keyFacts: readonly CreativeKeyFact[] = [],
  framingStrategy?: CreativeFramingStrategy,
): void {
  const blockers = [
    ...(format === "carousel"
      ? blockingCarouselNarrativeIssues(
          draft.units,
          draft.narrativeRationale,
          undefined,
          framingStrategy,
        ).map((issue) => issue.message)
      : []),
    ...deterministicFactQualityIssues(draft, keyFacts)
      .filter((issue) => issue.severity === "blocker")
      .map((issue) => issue.message),
  ];
  if (blockers.length > 0) {
    throw new CreativeQualityGateError(
      blockers.join(" "),
    );
  }
}

function deduplicateQualityIssues(
  issues: CreativeQualityIssue[],
): CreativeQualityIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.unitOrder ?? 0}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function qualityLabel(dimension: string): string {
  return dimension.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (value) =>
    value.toUpperCase(),
  );
}

function withoutQuestionSentences(value?: string): string {
  if (!value?.trim()) return "";
  const pattern =
    /(?:\b(?:Dr|Mr|Mrs|Ms|vs|e\.g|i\.e|etc)\.|\.(?=\d)|[^.!?]|[.!?](?!\s|$))+[.!?]*/giu;
  return (value.match(pattern) ?? [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => Boolean(sentence) && !sentence.includes("?"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function closingHeadlineFallback(
  goal: GeneratedCreativeDraft["units"][number]["editorialGoal"],
): string {
  return goal === "debate" ? "The debate" : "The takeaway";
}

export class CreativeQualityGateError extends Error {}
