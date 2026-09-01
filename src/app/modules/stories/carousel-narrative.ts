import { extractCreativeNumericLiterals } from "./creative-number-normalization";
import type { CreativeConversionGoal } from "./creative-content.types";

export const CAROUSEL_EDITORIAL_GOALS = [
  "hook",
  "explain",
  "prove",
  "compare",
  "impact",
  "problem",
  "opportunity",
  "watch",
  "conclude",
  "debate",
] as const;

export type CarouselEditorialGoal =
  (typeof CAROUSEL_EDITORIAL_GOALS)[number];

export type CarouselSlideCount = 3 | 4 | 5 | 6 | 7 | 8;

export type CarouselPlanSlide = {
  editorialGoal: CarouselEditorialGoal;
  viewerQuestion: string;
  allowedFactIds: string[];
};

export type CarouselPlan = {
  slideCount: CarouselSlideCount;
  rationale: string;
  slides: CarouselPlanSlide[];
};

export const CAROUSEL_EDITORIAL_GOAL_OPTIONS = [
  {
    value: "hook",
    label: "Hook",
    viewerQuestion: "What happened, and why should I care?",
  },
  {
    value: "explain",
    label: "Explain",
    viewerQuestion: "How is this happening?",
  },
  {
    value: "prove",
    label: "Evidence",
    viewerQuestion: "What evidence supports this?",
  },
  {
    value: "compare",
    label: "Compare",
    viewerQuestion: "How does this compare with the alternative?",
  },
  {
    value: "impact",
    label: "Impact",
    viewerQuestion: "Why does this matter?",
  },
  {
    value: "problem",
    label: "Problem",
    viewerQuestion: "What is the underlying risk or problem?",
  },
  {
    value: "opportunity",
    label: "Opportunity",
    viewerQuestion: "What could improve because of this?",
  },
  {
    value: "watch",
    label: "What to watch",
    viewerQuestion: "What should the viewer watch next?",
  },
  {
    value: "conclude",
    label: "Conclusion",
    viewerQuestion: "What is the essential takeaway?",
  },
  {
    value: "debate",
    label: "Debate",
    viewerQuestion: "What question should the viewer consider?",
  },
] as const satisfies ReadonlyArray<{
  value: CarouselEditorialGoal;
  label: string;
  viewerQuestion: string;
}>;

export const PREFERRED_CAROUSEL_ARCS = {
  3: ["hook", "impact", "debate"],
  4: ["hook", "explain", "impact", "debate"],
  5: ["hook", "explain", "prove", "impact", "debate"],
  6: ["hook", "explain", "prove", "impact", "conclude", "debate"],
  7: [
    "hook",
    "explain",
    "prove",
    "compare",
    "impact",
    "conclude",
    "debate",
  ],
  8: [
    "hook",
    "explain",
    "prove",
    "compare",
    "problem",
    "opportunity",
    "impact",
    "debate",
  ],
} as const satisfies Record<
  CarouselSlideCount,
  readonly CarouselEditorialGoal[]
>;

const MAX_FACTS_BY_GOAL: Record<CarouselEditorialGoal, number> = {
  hook: 2,
  explain: 2,
  prove: 3,
  compare: 3,
  impact: 3,
  problem: 3,
  opportunity: 3,
  watch: 2,
  conclude: 3,
  debate: 2,
};

export const CAROUSEL_SUBHEADLINE_MAX_WORDS = 18;
export const CAROUSEL_CONTINUATION_CUE_MAX_WORDS = 10;

export type CarouselNarrativeUnit = {
  role: string;
  editorialGoal?: CarouselEditorialGoal;
  viewerQuestion?: string;
  ctaQuestion?: string;
  headline?: string;
  subheadline?: string;
  body?: string;
  continuationCue?: string;
  factIds: readonly string[];
};

export type CarouselNarrativeIssueSeverity = "blocker" | "warning" | "info";

export type CarouselNarrativeWarning = {
  severity: CarouselNarrativeIssueSeverity;
  code:
    | "missing-goal"
    | "missing-viewer-question"
    | "arc-deviation"
    | "missing-deviation-rationale"
    | "fact-budget"
    | "new-closing-fact"
    | "cover-role"
    | "closing-role"
    | "closing-goal"
    | "cta-position"
    | "missing-debate-question"
    | "closing-question-count"
    | "role-goal-mismatch"
    | "evidence-without-facts"
    | "fact-overuse"
    | "multiple-slide-claims"
    | "semantic-repetition"
    | "missing-supporting-copy"
    | "headline-too-long"
    | "subheadline-too-long"
    | "redundant-subheadline"
    | "body-too-long"
    | "missing-cover-continuation-cue"
    | "generic-continuation-cue"
    | "continuation-cue-too-long"
    | "continuation-cue-on-final";
  message: string;
  unitIndex?: number;
};

export function isCarouselEditorialGoal(
  value: unknown,
): value is CarouselEditorialGoal {
  return (
    typeof value === "string" &&
    (CAROUSEL_EDITORIAL_GOALS as readonly string[]).includes(value)
  );
}

export function getPreferredCarouselArc(
  slideCount: number,
  conversionGoal?: CreativeConversionGoal,
): readonly CarouselEditorialGoal[] | undefined {
  if (slideCount < 3 || slideCount > 8) return undefined;
  const preferred = PREFERRED_CAROUSEL_ARCS[slideCount as CarouselSlideCount];
  if (!conversionGoal) return preferred;
  return [
    ...preferred.slice(0, -1),
    getPreferredCarouselClosingGoal(conversionGoal),
  ];
}

export function getPreferredCarouselClosingGoal(
  conversionGoal: CreativeConversionGoal,
): Extract<CarouselEditorialGoal, "conclude" | "debate"> {
  return conversionGoal === "discussion" ? "debate" : "conclude";
}

export function alignCarouselPlanWithConversionGoal(
  plan: CarouselPlan,
  conversionGoal: CreativeConversionGoal,
): { plan: CarouselPlan; repaired: boolean } {
  const expectedClosingGoal =
    getPreferredCarouselClosingGoal(conversionGoal);
  const closingIndex = plan.slides.length - 1;
  const closing = plan.slides[closingIndex];
  if (!closing || closing.editorialGoal === expectedClosingGoal) {
    return { plan, repaired: false };
  }
  return {
    repaired: true,
    plan: {
      ...plan,
      slides: plan.slides.map((slide, index) =>
        index === closingIndex
          ? {
              ...slide,
              editorialGoal: expectedClosingGoal,
              viewerQuestion: getDefaultViewerQuestion(expectedClosingGoal),
            }
          : slide,
      ),
    },
  };
}

export function getDefaultViewerQuestion(
  goal: CarouselEditorialGoal,
): string {
  return (
    CAROUSEL_EDITORIAL_GOAL_OPTIONS.find((option) => option.value === goal)
      ?.viewerQuestion ?? "What should the viewer understand here?"
  );
}

export function isCarouselSlideCount(
  value: unknown,
): value is CarouselSlideCount {
  return Number.isInteger(value) && (value as number) >= 3 && (value as number) <= 8;
}

export function maximumFactsForGoal(goal: CarouselEditorialGoal): number {
  return MAX_FACTS_BY_GOAL[goal];
}

/**
 * Repairs mechanical fact-assignment mistakes without inventing evidence.
 * Models sometimes return a sound narrative plan but leave allowedFactIds
 * empty (especially on the hook) or spend a new fact on the closing slide.
 * The factual-scope guard still validates the resulting viewer question
 * against the assigned facts after this normalization.
 */
export function repairCarouselPlanEvidence(
  plan: CarouselPlan,
  knownFactIds: ReadonlySet<string>,
): { plan: CarouselPlan; repaired: boolean } {
  const availableFactIds = [...knownFactIds];
  const establishedFacts = new Set<string>();
  let repaired = false;

  const slides = plan.slides.map((slide) => {
    let allowedFactIds = [
      ...new Set(
        slide.allowedFactIds.filter((factId) => knownFactIds.has(factId)),
      ),
    ];
    if (allowedFactIds.length !== slide.allowedFactIds.length) repaired = true;

    const isClosing =
      slide.editorialGoal === "conclude" || slide.editorialGoal === "debate";
    if (isClosing) {
      const reusableFacts = allowedFactIds.filter((factId) =>
        establishedFacts.has(factId),
      );
      if (reusableFacts.length !== allowedFactIds.length) repaired = true;
      allowedFactIds = reusableFacts;
      if (allowedFactIds.length === 0 && establishedFacts.size > 0) {
        allowedFactIds = [[...establishedFacts][0]!];
        repaired = true;
      }
    } else if (allowedFactIds.length === 0 && availableFactIds.length > 0) {
      allowedFactIds = [
        availableFactIds.find((factId) => !establishedFacts.has(factId)) ??
          availableFactIds[0]!,
      ];
      repaired = true;
    }

    const budget = maximumFactsForGoal(slide.editorialGoal);
    if (allowedFactIds.length > budget) {
      allowedFactIds = allowedFactIds.slice(0, budget);
      repaired = true;
    }
    allowedFactIds.forEach((factId) => establishedFacts.add(factId));
    return { ...slide, allowedFactIds };
  });

  return { plan: { ...plan, slides }, repaired };
}

/** Hard plan invariants. Arc deviations remain valid when rationale explains them. */
export function validateCarouselPlan(
  plan: CarouselPlan,
  knownFactIds: ReadonlySet<string>,
  conversionGoal?: CreativeConversionGoal,
): string[] {
  const errors: string[] = [];
  if (plan.slides.length !== plan.slideCount) {
    errors.push("carouselPlan slideCount must match its slides");
  }

  const establishedFacts = new Set<string>();
  plan.slides.forEach((slide, index) => {
    if (!slide.viewerQuestion.trim()) {
      errors.push(`carouselPlan slide ${index + 1} needs a viewerQuestion`);
    }
    if (
      slide.editorialGoal !== "hook" &&
      questionIntentCount(slide.viewerQuestion) > 1
    ) {
      errors.push(
        `carouselPlan slide ${index + 1} asks multiple editorial questions; give the slide one job`,
      );
    }
    if (slide.allowedFactIds.some((factId) => !knownFactIds.has(factId))) {
      errors.push(`carouselPlan slide ${index + 1} cites an unknown fact`);
    }
    if (slide.allowedFactIds.length > maximumFactsForGoal(slide.editorialGoal)) {
      errors.push(
        `carouselPlan slide ${index + 1} exceeds the ${slide.editorialGoal} fact budget`,
      );
    }
    if (
      slide.allowedFactIds.length === 0 &&
      slide.editorialGoal !== "conclude" &&
      slide.editorialGoal !== "debate"
    ) {
      errors.push(
        `carouselPlan slide ${index + 1} needs evidence for its ${slide.editorialGoal} purpose`,
      );
    }
    if (
      (slide.editorialGoal === "conclude" ||
        slide.editorialGoal === "debate") &&
      slide.allowedFactIds.some((factId) => !establishedFacts.has(factId))
    ) {
      errors.push(
        `carouselPlan slide ${index + 1} introduces a fact in the closing stage`,
      );
    }
    slide.allowedFactIds.forEach((factId) => establishedFacts.add(factId));

    const previous = plan.slides[index - 1];
    const isMiddlePair = index >= 2 && index < plan.slides.length - 1;
    if (
      isMiddlePair &&
      previous?.allowedFactIds.some((factId) =>
        slide.allowedFactIds.includes(factId),
      )
    ) {
      errors.push(
        `carouselPlan slides ${index} and ${index + 1} reuse evidence in consecutive middle slides; assign each slide one primary factual job`,
      );
    }
  });

  const closingGoal = plan.slides.at(-1)?.editorialGoal;
  if (closingGoal !== "conclude" && closingGoal !== "debate") {
    errors.push(
      "carouselPlan final slide must conclude the story or open a debate",
    );
  }
  if (
    conversionGoal &&
    closingGoal !== getPreferredCarouselClosingGoal(conversionGoal)
  ) {
    errors.push(
      `carouselPlan final slide must use ${getPreferredCarouselClosingGoal(conversionGoal)} for the ${conversionGoal} conversion goal`,
    );
  }

  return errors;
}

/**
 * Serializable policy sent to the draft model. The same definitions power the
 * editor warnings below, so prompt guidance and review cannot silently drift.
 */
export function carouselNarrativePolicyForPrompt(
  conversionGoal?: CreativeConversionGoal,
) {
  const preferredClosingGoal = conversionGoal
    ? getPreferredCarouselClosingGoal(conversionGoal)
    : undefined;
  return {
    flexibility:
      "Use the preferred arc for the selected slide count unless the story requires another sequence. It already reflects preferredClosingGoal. Explain other deviations in narrativeRationale.",
    ...(preferredClosingGoal ? { preferredClosingGoal } : {}),
    roleSemantics:
      "role controls presentation and layout; editorialGoal controls the narrative job of the slide.",
    preferredArcs: Object.entries(PREFERRED_CAROUSEL_ARCS).map(
      ([slideCount, goals]) => ({
        slideCount: Number(slideCount),
        goals:
          getPreferredCarouselArc(Number(slideCount), conversionGoal) ?? goals,
      }),
    ),
    editorialGoals: CAROUSEL_EDITORIAL_GOAL_OPTIONS,
    factBudgets: Object.entries(MAX_FACTS_BY_GOAL).map(
      ([goal, maximumFacts]) => ({ goal, maximumFacts }),
    ),
    rules: [
      "Use only facts necessary to advance the story; do not use every available fact simply because it exists.",
      "viewerQuestion describes the mental question answered by that slide and is not visible slide copy.",
      "ctaQuestion is optional visible copy and belongs only on the final conclusion or call-to-action slide.",
      `subheadline is optional visible hierarchy copy. Use it only when it adds a distinct clarifying layer below the headline, and keep it to ${CAROUSEL_SUBHEADLINE_MAX_WORDS} words or fewer.`,
      `continuationCue is optional visible semantic reward copy for non-final slides. The cover should normally include one concrete reason to continue, in ${CAROUSEL_CONTINUATION_CUE_MAX_WORDS} words or fewer. Do not put a continuationCue on the final slide.`,
      "Never use a bare navigation label such as Desliza, Swipe, Next, or Siguiente as continuationCue. The renderer supplies navigation chrome; continuationCue must name the specific idea the next slide will resolve.",
      "Treat subheadline and continuationCue as factual visible copy: do not add claims or numbers that the supplied evidence does not support.",
      "The final slide must use conclude or debate. This terminal narrative job is required even when the earlier arc deviates from the preferred sequence.",
      ...(preferredClosingGoal
        ? [
            `Use ${preferredClosingGoal} as the final editorialGoal for the configured conversion goal.`,
          ]
        : []),
      "A conclude or debate slide should reuse earlier facts and should not introduce unsupported or new information.",
      "Establish related comparison facts together before the final slide; never reserve a new statistic solely for the closing slide.",
      "Each viewerQuestion must ask exactly one editorial question; do not join two questions with 'and'.",
      "Give each middle slide primary ownership of its evidence. Consecutive middle slides should not reuse the same fact or numerical claim.",
      "Use one fact on at most two slides. The cover and closing may reuse the thesis, but never repeat that same finding across the cover, a middle slide, and the closing.",
      "Scope comparisons explicitly. If a change is relative to a previous event in the same category, program, cohort, or region, name that comparison set; never let 'previous' imply the immediately prior overall event.",
      "Preserve as-of scope for a record in a current or unfinished period: use the supported equivalent of 'so far', 'to date', or 'as of', and never turn it into an unbounded full-period or full-year claim.",
      "Treat sequence numbers, edition counts, identifiers, and other administrative ordinals as context, not impact. Do not give one an impact slide unless the evidence establishes a meaningful consequence; choose a better goal or fewer slides.",
      "If the preferred arc would force an impact slide to paraphrase evidence, choose a better evidence-led goal and explain the deviation.",
    ],
  };
}

export function evaluateCarouselNarrative(
  units: readonly CarouselNarrativeUnit[],
  narrativeRationale?: string,
  conversionGoal?: CreativeConversionGoal,
): CarouselNarrativeWarning[] {
  const warnings: CarouselNarrativeWarning[] = [];
  const preferredArc = getPreferredCarouselArc(
    units.length,
    conversionGoal,
  );

  units.forEach((unit, unitIndex) => {
    const slide = unitIndex + 1;
    if (!unit.editorialGoal) {
      warnings.push({
        severity: "blocker",
        code: "missing-goal",
        unitIndex,
        message: `Slide ${slide} needs an editorial purpose.`,
      });
    }
    if (!unit.viewerQuestion?.trim()) {
      warnings.push({
        severity: "blocker",
        code: "missing-viewer-question",
        unitIndex,
        message: `Slide ${slide} does not define the viewer question it answers.`,
      });
    }
    if (
      unit.editorialGoal !== "hook" &&
      unit.viewerQuestion?.trim() &&
      questionIntentCount(unit.viewerQuestion) > 1
    ) {
      warnings.push({
        severity: "blocker",
        code: "multiple-slide-claims",
        unitIndex,
        message: `Slide ${slide} asks more than one editorial question; split the ideas so the slide has one clear job.`,
      });
    }
    if (
      unit.editorialGoal &&
      unit.factIds.length > MAX_FACTS_BY_GOAL[unit.editorialGoal]
    ) {
      warnings.push({
        severity: "blocker",
        code: "fact-budget",
        unitIndex,
        message: `Slide ${slide} uses ${unit.factIds.length} facts; ${unit.editorialGoal} usually needs at most ${MAX_FACTS_BY_GOAL[unit.editorialGoal]}.`,
      });
    }
    if (unit.ctaQuestion?.trim() && unitIndex !== units.length - 1) {
      warnings.push({
        severity: "blocker",
        code: "cta-position",
        unitIndex,
        message: `Slide ${slide} has visible CTA copy, but it should normally be reserved for the final slide.`,
      });
    }

    if (
      unit.editorialGoal &&
      !["conclude", "debate"].includes(unit.editorialGoal) &&
      unit.factIds.length === 0
    ) {
      warnings.push({
        severity: "blocker",
        code: "evidence-without-facts",
        unitIndex,
        message: `Slide ${slide} has a ${unit.editorialGoal} purpose but does not cite supporting evidence.`,
      });
    }

    const headlineTarget = unit.role === "cover" ? 12 : 14;
    if (wordCount(unit.headline) > headlineTarget) {
      warnings.push({
        severity: "warning",
        code: "headline-too-long",
        unitIndex,
        message: `Slide ${slide} headline uses ${wordCount(unit.headline)} words; aim for ${headlineTarget} or fewer.`,
      });
    }
    if (wordCount(unit.subheadline) > CAROUSEL_SUBHEADLINE_MAX_WORDS) {
      warnings.push({
        severity: "warning",
        code: "subheadline-too-long",
        unitIndex,
        message: `Slide ${slide} subheadline uses ${wordCount(unit.subheadline)} words; aim for ${CAROUSEL_SUBHEADLINE_MAX_WORDS} or fewer.`,
      });
    }
    if (
      unit.subheadline?.trim() &&
      normalizedVisibleCopy(unit.subheadline) ===
        normalizedVisibleCopy(unit.headline)
    ) {
      warnings.push({
        severity: "warning",
        code: "redundant-subheadline",
        unitIndex,
        message: `Slide ${slide} repeats its headline as the subheadline; use the second line only when it adds useful hierarchy.`,
      });
    }
    if (wordCount(unit.body) > 45) {
      warnings.push({
        severity: "warning",
        code: "body-too-long",
        unitIndex,
        message: `Slide ${slide} supporting text uses ${wordCount(unit.body)} words; aim for 45 or fewer.`,
      });
    }
    if (
      wordCount(unit.continuationCue) >
      CAROUSEL_CONTINUATION_CUE_MAX_WORDS
    ) {
      warnings.push({
        severity: "warning",
        code: "continuation-cue-too-long",
        unitIndex,
        message: `Slide ${slide} continuation cue uses ${wordCount(unit.continuationCue)} words; aim for ${CAROUSEL_CONTINUATION_CUE_MAX_WORDS} or fewer.`,
      });
    }
    if (
      unit.continuationCue?.trim() &&
      isGenericContinuationCue(unit.continuationCue)
    ) {
      warnings.push({
        severity: "blocker",
        code: "generic-continuation-cue",
        unitIndex,
        message: `Slide ${slide} uses a generic navigation label; name the concrete idea the next slide will reveal instead.`,
      });
    }
    if (
      unitIndex > 0 &&
      unitIndex < units.length - 1 &&
      unit.role === "content" &&
      !unit.body?.trim()
    ) {
      warnings.push({
        severity: "blocker",
        code: "missing-supporting-copy",
        unitIndex,
        message: `Slide ${slide} has a headline but no supporting copy; add the evidence that fulfills its viewer question.`,
      });
    }
  });

  units.forEach((unit, unitIndex) => {
    if (unitIndex < 2 || unitIndex >= units.length - 1) return;
    const previous = units[unitIndex - 1];
    if (!previous) return;
    const sharedFacts = unit.factIds.filter((factId) =>
      previous.factIds.includes(factId),
    );
    const sharedNumbers = numericTokens(unit.body).filter((number) =>
      numericTokens(previous.body).includes(number),
    );
    if (sharedFacts.length > 0 && sharedNumbers.length > 0) {
      warnings.push({
        severity: "blocker",
        code: "semantic-repetition",
        unitIndex,
        message: `Slides ${unitIndex} and ${unitIndex + 1} repeat ${sharedFacts.join(", ")} and the same numerical claim (${sharedNumbers.join(", ")}); give each slide distinct evidence.`,
      });
    }
  });

  const first = units[0];
  if (first && first.role !== "cover") {
    warnings.push({
      severity: "blocker",
      code: "cover-role",
      unitIndex: 0,
      message: "The first carousel slide should normally use the cover role.",
    });
  }
  if (first?.role === "cover" && !first.continuationCue?.trim()) {
    warnings.push({
      severity: "warning",
      code: "missing-cover-continuation-cue",
      unitIndex: 0,
      message:
        "The cover should normally include a concrete continuation cue that previews the next slide's reward.",
    });
  }

  const lastIndex = units.length - 1;
  const last = units[lastIndex];
  if (last) {
    if (last.continuationCue?.trim()) {
      warnings.push({
        severity: "blocker",
        code: "continuation-cue-on-final",
        unitIndex: lastIndex,
        message:
          "The final carousel slide cannot include a continuation cue because there is no next slide.",
      });
    }
    if (last.role !== "conclusion" && last.role !== "call-to-action") {
      warnings.push({
        severity: "blocker",
        code: "closing-role",
        unitIndex: lastIndex,
        message:
          "The final carousel slide should normally use the conclusion or call-to-action role.",
      });
    }
    if (last.editorialGoal !== "conclude" && last.editorialGoal !== "debate") {
      warnings.push({
        severity: "blocker",
        code: "closing-goal",
        unitIndex: lastIndex,
        message:
          "The final slide must conclude the established story or open one evidence-grounded debate; impact and comparison facts belong earlier.",
      });
    }
    if (last.editorialGoal === "debate" && !last.ctaQuestion?.trim()) {
      warnings.push({
        severity: "blocker",
        code: "missing-debate-question",
        unitIndex: lastIndex,
        message: "A debate ending should include a visible CTA question.",
      });
    }
    if (
      last.editorialGoal === "conclude" ||
      last.editorialGoal === "debate"
    ) {
      const priorFacts = new Set(
        units.slice(0, -1).flatMap((unit) => unit.factIds),
      );
      const newClosingFacts = last.factIds.filter(
        (factId) => !priorFacts.has(factId),
      );
      if (newClosingFacts.length > 0) {
        warnings.push({
          severity: "blocker",
          code: "new-closing-fact",
          unitIndex: lastIndex,
          message: `The final slide introduces ${newClosingFacts.join(", ")}; conclusions should normally reuse facts established earlier.`,
        });
      }
    }

    const visibleQuestionCount = [
      last.headline,
      last.subheadline,
      last.body,
      last.ctaQuestion,
      last.continuationCue,
    ].reduce(
      (count, value) => count + (value?.match(/\?/g)?.length ?? 0),
      0,
    );
    if (visibleQuestionCount > 1) {
      warnings.push({
        severity: "blocker",
        code: "closing-question-count",
        unitIndex: lastIndex,
        message: `The final slide contains ${visibleQuestionCount} visible questions; keep exactly one closing question.`,
      });
    }
    else if (last.editorialGoal === "debate" && visibleQuestionCount !== 1) {
      warnings.push({
        severity: "blocker",
        code: "closing-question-count",
        unitIndex: lastIndex,
        message: "A debate ending must contain exactly one visible question.",
      });
    }
  }

  units.forEach((unit, unitIndex) => {
    const isFirst = unitIndex === 0;
    const isLast = unitIndex === lastIndex;
    if (!isFirst && !isLast && unit.role !== "content") {
      warnings.push({
        severity: "blocker",
        code: "role-goal-mismatch",
        unitIndex,
        message: `Slide ${unitIndex + 1} uses the ${unit.role} role in a position that does not match its narrative job.`,
      });
    }
    const goalMatchesRole =
      !unit.editorialGoal ||
      (unit.role === "cover" &&
        unit.editorialGoal !== "conclude" &&
        unit.editorialGoal !== "debate") ||
      (unit.role === "content" &&
        unit.editorialGoal !== "conclude" &&
        unit.editorialGoal !== "debate") ||
      ((unit.role === "conclusion" || unit.role === "call-to-action") &&
        ["impact", "opportunity", "watch", "conclude", "debate"].includes(
          unit.editorialGoal,
        ));
    if (!goalMatchesRole) {
      warnings.push({
        severity: "blocker",
        code: "role-goal-mismatch",
        unitIndex,
        message: `Slide ${unitIndex + 1} combines the ${unit.role} role with the ${unit.editorialGoal} purpose; those presentation and narrative jobs conflict.`,
      });
    }
  });

  const factUsage = new Map<string, number[]>();
  units.forEach((unit, unitIndex) => {
    new Set(unit.factIds).forEach((factId) =>
      factUsage.set(factId, [
        ...(factUsage.get(factId) ?? []),
        unitIndex + 1,
      ]),
    );
  });
  factUsage.forEach((slideNumbers, factId) => {
    if (slideNumbers.length > 2) {
      warnings.push({
        severity: "warning",
        code: "fact-overuse",
        message: `${factId} is cited on slides ${slideNumbers.join(", ")}; keep one finding to at most two narrative jobs instead of repeating it across the cover, middle, and closing.`,
      });
    }
  });

  if (
    preferredArc &&
    units.every((unit) => unit.editorialGoal) &&
    units.some(
      (unit, index) => unit.editorialGoal !== preferredArc[index],
    )
  ) {
    warnings.push({
      severity: "warning",
      code: "arc-deviation",
      message: `This arc differs from the preferred ${units.length}-slide sequence: ${preferredArc.join(" → ")}. Keep the deviation when it better serves the story.`,
    });
    if (!narrativeRationale?.trim()) {
      warnings.push({
        severity: "warning",
        code: "missing-deviation-rationale",
        message:
          "Add a narrative rationale so reviewers understand why this story uses a different arc.",
      });
    }
  }

  return warnings;
}

export function blockingCarouselNarrativeIssues(
  units: readonly CarouselNarrativeUnit[],
  narrativeRationale?: string,
  conversionGoal?: CreativeConversionGoal,
): CarouselNarrativeWarning[] {
  return evaluateCarouselNarrative(
    units,
    narrativeRationale,
    conversionGoal,
  ).filter((issue) => issue.severity === "blocker");
}

function wordCount(value?: string): number {
  return value?.trim() ? value.trim().split(/\s+/u).length : 0;
}

function normalizedVisibleCopy(value?: string): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function isGenericContinuationCue(value: string): boolean {
  const normalized = normalizedVisibleCopy(value);
  return /^(?:(?:desliza|desliza para (?:ver|continuar)|sigue deslizando|siguiente|continua|ver mas)|(?:swipe|swipe (?:left|for more)|keep swiping|next|continue|read more))$/u.test(
    normalized,
  );
}

function questionIntentCount(value: string): number {
  const interrogatives = value.match(
    /\b(?:what|why|how|when|where|which|who|qué|por qué|cómo|cuándo|dónde|cuál|quién)\b/giu,
  );
  return Math.max(value.match(/\?/gu)?.length ?? 0, interrogatives?.length ?? 0);
}

function numericTokens(value?: string): string[] {
  return [...new Set(extractCreativeNumericLiterals(value ?? ""))];
}
