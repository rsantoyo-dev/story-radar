import { extractCreativeNumericLiterals } from "./creative-number-normalization";
import type {
  CreativeConversionGoal,
  CreativeFramingStrategy,
} from "./creative-content.types";

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
    | "continuation-cue-on-final"
    | "recap-label-headline"
    | "redundant-closing"
    | "cover-not-reader-framed"
    | "cue-echoes-next-headline"
    | "closing-not-reader-resolved"
    | "redundant-cover-body"
    | "cover-supporting-restates-hold"
    | "duplicate-headline"
    | "truncated-supporting-copy"
    | "generic-analysis-headline";
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
      "Every visible sentence must be grammatically complete. Never leave a clause hanging on a connector ('…, as.', '…, with some outlets.') or a bare noun phrase ('Some tech outlets.'). If a source clause only offers unsupported speculation you cannot state, omit that clause entirely rather than truncating it.",
      "Each slide needs its own distinct headline that states that slide's specific point. Do not reuse a headline across slides, and never use a generic analysis label ('What the data shows', 'Key findings', 'Lo que muestran los datos') — least of all on the final slide, whose headline must state the actual conclusion.",
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
  framingStrategy?: CreativeFramingStrategy,
): CarouselNarrativeWarning[] {
  const warnings: CarouselNarrativeWarning[] = [];
  const preferredArc = getPreferredCarouselArc(
    units.length,
    conversionGoal,
  );

  const coverUnit = units[0];
  if (
    framingStrategy === "reader-consequence" &&
    coverUnit &&
    coverUnit.role === "cover" &&
    (isInstitutionFirstCoverCopy(coverUnit.headline) ||
      isWithheldAnswerCoverCopy(coverUnit.headline))
  ) {
    warnings.push({
      severity: "blocker",
      code: "cover-not-reader-framed",
      unitIndex: 0,
      message:
        "The creative profile uses the reader-consequence framing, but the cover headline opens with an organization, a bare policy-status statement, or a yes/no question that withholds the answer, and never names what changes for the audience. State the outcome and lead with the reader's stake (what they pay, owe, save, or decide); mention the institution only after and do not defer the central fact to a later slide. When the decision is a hold or no-change, contrast what is settled for the reader against what still moves (their debt vs. their purchases) — do not announce the unchanged figure.",
    });
  }

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

    // A cover that contrasts two reader-facing clauses ("Para X …; para Y …")
    // legitimately runs longer than a single-idea headline.
    const isTwoClauseCover =
      unit.role === "cover" && /[;—–]|\s-\s/u.test(unit.headline ?? "");
    const headlineTarget =
      unit.role === "cover" ? (isTwoClauseCover ? 16 : 12) : 14;
    if (wordCount(unit.headline) > headlineTarget) {
      warnings.push({
        severity: "warning",
        code: "headline-too-long",
        unitIndex,
        message: `Slide ${slide} headline uses ${wordCount(unit.headline)} words; aim for ${headlineTarget} or fewer.`,
      });
    }
    if (
      unit.headline?.trim() &&
      isGenericAnalysisHeadline(unit.headline)
    ) {
      const isFinalSlide = unitIndex === units.length - 1;
      warnings.push({
        severity: "blocker",
        code: "generic-analysis-headline",
        unitIndex,
        message: isFinalSlide
          ? `Slide ${slide} uses a generic analysis label ("${unit.headline.trim()}") instead of the actual conclusion; state the decision, consequence, or answer the cover promised.`
          : `Slide ${slide} uses a generic analysis label ("${unit.headline.trim()}") instead of stating its specific point.`,
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
    const trailingFragment = trailingSentenceFragment(unit.body);
    if (trailingFragment) {
      warnings.push({
        severity: "blocker",
        code: "truncated-supporting-copy",
        unitIndex,
        message: `Slide ${slide} supporting text ends with an incomplete sentence ("${trailingFragment}"); finish the thought or drop it.`,
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
    const nextUnit = units[unitIndex + 1];
    if (
      unit.continuationCue?.trim() &&
      nextUnit?.headline?.trim() &&
      normalizedVisibleCopy(unit.continuationCue) ===
        normalizedVisibleCopy(nextUnit.headline)
    ) {
      warnings.push({
        severity: "warning",
        code: "cue-echoes-next-headline",
        unitIndex,
        message: `Slide ${slide} continuation cue repeats the next slide's headline verbatim; tease the idea instead of stating its answer.`,
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

  const headlineSlides = new Map<string, number[]>();
  units.forEach((unit, unitIndex) => {
    const key = normalizedVisibleCopy(unit.headline);
    if (!key) return;
    headlineSlides.set(key, [...(headlineSlides.get(key) ?? []), unitIndex + 1]);
  });
  for (const slides of headlineSlides.values()) {
    if (slides.length < 2) continue;
    warnings.push({
      severity: "warning",
      code: "duplicate-headline",
      unitIndex: slides[slides.length - 1]! - 1,
      message: `Slides ${slides.join(" and ")} use the same headline; give each slide a distinct headline that states its own point.`,
    });
  }

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
        "The cover should include a concrete continuation cue that previews the next slide's reward.",
    });
  }
  if (
    framingStrategy === "reader-consequence" &&
    first?.role === "cover" &&
    first.body?.trim() &&
    isInstitutionFirstCoverCopy(firstSentenceOfCopy(first.body))
  ) {
    warnings.push({
      severity: "warning",
      code: "cover-supporting-restates-hold",
      unitIndex: 0,
      message:
        "The reader-consequence cover's supporting text restates the unchanged decision; use it to carry the second signal — the thing still moving for the reader — not to repeat the hold.",
    });
  }
  if (first?.role === "cover" && first.body?.trim()) {
    const bodyNumbers = new Set(numericTokens(first.body));
    const restatesExactly = [first.headline, first.subheadline].some(
      (value) =>
        value?.trim() &&
        normalizedVisibleCopy(first.body) === normalizedVisibleCopy(value),
    );
    const restatesTheThesisNumber =
      bodyNumbers.size > 0 &&
      [first.headline, first.subheadline].some((value) => {
        if (!value?.trim()) return false;
        const otherNumbers = new Set(numericTokens(value));
        const shared = [...bodyNumbers].some((n) => otherNumbers.has(n));
        const bodyOnly = [...bodyNumbers].some((n) => !otherNumbers.has(n));
        return shared && !bodyOnly;
      });
    if (restatesExactly || restatesTheThesisNumber) {
      warnings.push({
        severity: "warning",
        code: "redundant-cover-body",
        unitIndex: 0,
        message:
          "The cover's supporting text restates the headline or subheadline without adding a distinct fact; add one or drop the field.",
      });
    }
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

    if (
      isRecapLabelCopy(last.headline) ||
      isRecapLabelCopy(last.subheadline)
    ) {
      warnings.push({
        severity: "blocker",
        code: "recap-label-headline",
        unitIndex: lastIndex,
        message:
          "The final slide opens with a summary label such as “La conclusión” or “The takeaway”; deliver the actual answer or decision the cover promised instead of announcing that a summary follows.",
      });
    }

    if (
      first &&
      last !== first &&
      last.factIds.length > 0 &&
      last.factIds.every((factId) => first.factIds.includes(factId)) &&
      (visibleCopyOverlapRatio(last, first) >= CLOSING_COVER_OVERLAP_LIMIT ||
        sharesOnlyNumericThesis(last, first))
    ) {
      warnings.push({
        severity: "warning",
        code: "redundant-closing",
        unitIndex: lastIndex,
        message:
          "The final slide reuses only the cover's facts and adds no new evidence, consequence, or decision beyond the cover's central number; a conclusion should resolve the opening rather than restate it in different words.",
      });
    }

    if (framingStrategy === "reader-consequence") {
      const closingCopy = [last.headline, last.body]
        .filter((value): value is string => Boolean(value?.trim()))
        .join(" ");
      if (
        closingCopy &&
        !hasReaderStakeLanguage(closingCopy) &&
        numericTokens(closingCopy).length >= 2
      ) {
        warnings.push({
          severity: "warning",
          code: "closing-not-reader-resolved",
          unitIndex: lastIndex,
          message:
            "The reader-consequence framing promises an answer for the reader, but the final slide resolves with a list of figures and never says what the decision means for what they pay, owe, or decide.",
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
  framingStrategy?: CreativeFramingStrategy,
): CarouselNarrativeWarning[] {
  return evaluateCarouselNarrative(
    units,
    narrativeRationale,
    conversionGoal,
    framingStrategy,
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

const NOUN_PHRASE_OPENER =
  /^(?:the|a|an|some|this|that|these|those|several|many|most|few|its|their|his|her|our|el|la|los|las|un|una|unos|unas|este|esta|estos|estas|su|sus|algunos|algunas|varios|varias|otro|otra|otros|otras)$/iu;
// Words that cannot end a grammatical sentence: a period straight after one is a
// truncation artifact regardless of how long the clause is ("\u2026factor, as.").
const DANGLING_TAIL_WORD =
  /^(?:and|or|but|with|for|to|of|in|on|at|by|from|such|as|including|according|because|which|that|while|whether|than|into|onto|about|after|before|during|over|under|through|between|versus|vs|y|o|pero|con|para|por|de|en|que|porque|seg[u\u00fa]n|como|incluyendo|mientras|aunque|sobre|entre|hacia|desde|hasta|tal|tales)$/iu;
const FINITE_VERB_HINT =
  /^(?:is|are|was|were|be|been|being|has|have|had|do|does|did|said|says|say|show|shows|showed|shown|found|finds|find|rose|rise|rises|risen|fell|fall|falls|fallen|grew|grow|grows|grown|drop|drops|dropped|report|reports|reported|add|adds|added|note|notes|noted|confirm|confirms|confirmed|remain|remains|remained|stay|stays|stayed|climb|climbs|climbed|jump|jumps|jumped|slow|slows|slowed|expect|expects|expected|estimate|estimates|estimated|announce|announces|announced|warn|warns|warned|suggest|suggests|suggested|recover|recovers|recovered|went|go|goes|gone|came|come|comes|made|make|makes|took|take|takes|taken|gave|give|gives|given|saw|see|sees|seen|got|get|gets|set|sets|put|puts|led|lead|leads|run|runs|ran|hit|hits|lost|lose|loses|won|win|wins|began|begin|begins|begun|ended|end|ends|held|hold|holds|kept|keep|keeps|move|moves|moved|use|uses|used|need|needs|needed|mean|means|meant|sit|sits|sat|will|can|could|may|might|would|should|es|son|era|fue|fueron|ha|han|hab[i\u00ed]a|hace|hizo|tiene|tienen|tuvo|va|van|dio|vio|puso|llev[o\u00f3]|us[o\u00f3]|usa|usan|necesita|significa|dice|dijo|dicen|report[o\u00f3]|reportaron|muestra|mostr[o\u00f3]|sube|subi[o\u00f3]|baja|baj[o\u00f3]|creci[o\u00f3]|cay[o\u00f3]|sigue|siguen|queda|quedan|permanece|permanecen|advierte|advirti[o\u00f3]|estima|estim[o\u00f3])$/iu;

// A conclusion headline that names the act of analysis instead of its result.
// Distinct from isRecapLabelCopy, which needs an explicit "Label: \u2026" separator.
const GENERIC_ANALYSIS_HEADLINE =
  /^(?:what (?:the (?:data|numbers?|study|studies|research|findings?|results?|chart|charts|report|reports|figures?) (?:shows?|say|says|tell us|tells us|reveals?|means?|indicates?)|this means|it (?:means|shows)|to (?:know|watch|take away))|(?:the )?(?:takeaways?|bottom line|big picture|upshot|verdict|main point|key (?:takeaways?|points?|findings?))|final thoughts?|in (?:summary|short|closing)|lo que (?:(?:muestran|dicen|revelan|indican) los (?:datos|n[u\u00fa]meros|estudios)|significa(?:n)? (?:esto|todo esto|los datos)|hay que saber)|la (?:conclusi[o\u00f3]n|clave|moraleja|lecci[o\u00f3]n|idea)|el (?:balance|veredicto|panorama|punto (?:clave|principal)|resumen)|en (?:resumen|s[i\u00ed]ntesis|conclusi[o\u00f3]n))\s*[.:!?]?$/iu;

export function isGenericAnalysisHeadline(value: string): boolean {
  return GENERIC_ANALYSIS_HEADLINE.test(value.trim());
}

// A sentence that stops on a bare copula/auxiliary ("\u2026the disruptions was.",
// "\u2026its contribution was only.") \u2014 the complement never arrived.
const TRAILING_ADVERB =
  /^(?:only|not|also|still|yet|already|too|now|then|likely|possibly|probably|apparently|reportedly|solo|s[i\u00ed]|tambi[e\u00e9]n|a[u\u00fa]n|todav[i\u00ed]a|ya|quiz[a\u00e1]s?|posiblemente|probablemente)$/iu;
const BARE_COPULA =
  /^(?:was|were|is|are|am|be|been|being|had|has|have|will|would|could|should|shall|may|might|can|must|do|does|did|fue|fueron|era|eran|es|son|sido|ha|han|hab[i\u00ed]a|est[a\u00e1]|est[a\u00e1]n|estaba|ser[a\u00e1]|ser[i\u00ed]a)$/iu;
const PRONOUN_SUBJECT =
  /^(?:it|that|this|these|those|he|she|they|there|what|which|who|ello?|eso|esto|ellos?|ellas?)$/iu;

// A trailing comma-clause that hangs off the end of an otherwise complete
// sentence: "\u2026, with some tech outlets.", "\u2026, such as older accounts." The
// original clause continued ("\u2026with some outlets suggesting\u2026") and was cut.
// Attribution tails ("\u2026, according to X.", "\u2026, per the report.") are excluded.
const DANGLING_TRAILING_CLAUSE =
  /,\s+(?:(?:with|for|such as|including|alongside|plus|amid|con|para|incluyendo|junto con|adem[a\u00e1]s de)\s+[^,.]{1,40}|(?:and|with|for|y|con)\s+(?:some|several|many|certain|various|numerous|other|a few|algunos?|algunas|vari[ao]s|ciertos?|otros?)\s+[^,.]{1,30})\.$/iu;

/**
 * A trailing sentence in visible copy that reads as a truncation artifact:
 * it ends on a word that cannot close a sentence ("\u2026contributing factor, as."),
 * it is a short verbless noun phrase ("Some tech outlets."), or it trails off
 * in a hanging comma-clause ("\u2026, with some tech outlets."). Returns the
 * offending sentence, or undefined when the text ends cleanly. Used for slide
 * bodies and for the carousel caption.
 */
export function trailingSentenceFragment(body?: string): string | undefined {
  const trimmed = body?.trim();
  if (!trimmed) return undefined;
  const sentences = trimmed
    .split(/(?<=[.!?\u2026])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const last = sentences[sentences.length - 1];
  if (!last || !/[.]$/u.test(last) || /[?!\u2026]$/u.test(last)) return undefined;
  const words = last
    .replace(/[.]+$/u, "")
    .split(/\s+/u)
    .map((word) => word.replace(/[,;:]+$/u, ""))
    .filter(Boolean);
  if (words.length === 0) return undefined;
  // High-precision truncation signals \u2014 a period straight after a word that
  // cannot close a sentence, or a hanging comma-clause. These read as cut-off
  // even when the fragment is the only sentence present.
  if (DANGLING_TAIL_WORD.test(words[words.length - 1]!)) return last;
  {
    let copulaIndex = words.length - 1;
    if (copulaIndex >= 1 && TRAILING_ADVERB.test(words[copulaIndex]!)) {
      copulaIndex -= 1;
    }
    if (
      copulaIndex >= 1 &&
      BARE_COPULA.test(words[copulaIndex]!) &&
      !PRONOUN_SUBJECT.test(words[copulaIndex - 1]!)
    ) {
      return last;
    }
  }
  if (DANGLING_TRAILING_CLAUSE.test(last)) {
    const tailWords = last
      .slice(last.lastIndexOf(",") + 1)
      .replace(/[.]+$/u, "")
      .split(/\s+/u)
      .filter(Boolean);
    const lastTailWord = tailWords[tailWords.length - 1] ?? "";
    // "with X unchanged / planned / rising" is a valid absolute construction;
    // only a tail that ends on a plain noun reads as a cut-off clause.
    const isAbsoluteConstruction = /(?:ed|ing|en)$/iu.test(lastTailWord);
    if (
      !isAbsoluteConstruction &&
      !tailWords.some((word) => FINITE_VERB_HINT.test(word))
    ) {
      return last;
    }
  }
  // Bare verbless noun phrase ("Some tech outlets.") — only treat it as a
  // fragment when it trails a prior complete sentence, so a deliberately terse
  // standalone line is left alone.
  if (sentences.length < 2) return undefined;
  if (words.length > 3) return undefined;
  if (words.some((word) => FINITE_VERB_HINT.test(word))) return undefined;
  return NOUN_PHRASE_OPENER.test(words[0]!) ? last : undefined;
}

/**
 * Removes only a trailing fragment that `trailingSentenceFragment` has already
 * identified. This is deliberately conservative: complete attribution and
 * complete final sentences remain untouched. It lets the deterministic repair
 * retain the supported sentence instead of asking a model to invent the
 * missing attribution or claim.
 */
export function dropTrailingSentenceFragment(value: string): string {
  const trimmed = value.trim();
  const fragment = trailingSentenceFragment(trimmed);
  if (!fragment) return value;

  return trimmed
    .slice(0, -fragment.length)
    .replace(/[\s,;:]+$/u, "")
    .trim();
}

function isGenericContinuationCue(value: string): boolean {
  const normalized = normalizedVisibleCopy(value);
  if (
    /^(?:(?:desliza|desliza para (?:ver|continuar)|sigue deslizando|siguiente|continua|ver mas)|(?:swipe|swipe (?:left|for more)|keep swiping|next|continue|read more))$/u.test(
      normalized,
    )
  ) {
    return true;
  }
  // A summary-label opener ("La conclusión: …", "La clave: …") is a lazy label,
  // not a concrete promise of what the next slide reveals.
  return isRecapLabelCopy(value);
}

/**
 * Fraction of the shorter copy's meaningful tokens shared with the longer one.
 * Used to detect a closing slide that just restates the cover.
 */
const CLOSING_COVER_OVERLAP_LIMIT = 0.7;

// One source of truth for "this copy is a summary label followed by the real
// clause". The detector below and the repair share it, so every issue the
// detector raises is one the repair can actually clear. The separator is
// required on purpose: "La clave está en los precios" is a sentence, while
// "La clave: …" / "En resumen, …" are labels standing in for the answer.
const RECAP_LABEL_PREFIX =
  /^\s*(?:la conclusi[oó]n|la clave|el punto|lo esencial|lo importante|la moraleja|el resumen|en resumen|en s[ií]ntesis|en pocas palabras|para (?:resumir|cerrar|concluir|terminar)|la lecci[oó]n|el veredicto|el balance|conclusi[oó]n|resumen|the takeaway|the bottom line|the point|in summary|key (?:takeaway|point)|tl ?;?dr)\s*[:,–—-]\s*/iu;

function isRecapLabelCopy(value?: string): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  return stripRecapLabelPrefix(trimmed) !== trimmed;
}

/**
 * Removes a leading summary label ("La conclusión: …", "En resumen, …") so a
 * deterministic repair can keep the real clause instead of surfacing a blocker.
 * Returns the input unchanged when there is no separator-delimited label or
 * nothing meaningful remains after it.
 */
export function stripRecapLabelPrefix(value: string): string {
  const stripped = value.replace(RECAP_LABEL_PREFIX, "").trim();
  if (!stripped || stripped === value.trim()) return value;
  return stripped.charAt(0).toLocaleUpperCase() + stripped.slice(1);
}

// Deliberately strict: second-person address or a noun the reader pays or owns.
// Bare verbs such as "sube"/"baja" are excluded because "la tasa no sube" is a
// policy-status line, not a reader stake.
const READER_STAKE_PATTERN =
  /\b(?:tu|tus|t[uú]|ti|te|usted|ustedes|contigo|your|yours?|you)\b|\b(?:pag(?:o|os|as|ar|ues|ar[aá]s?|ar[aá]n|u[eé])|cuot[ao]s?|mensualidad(?:es)?|factura|facturas|hipoteca|hipotecas|deuda|deudas|cr[eé]dito|cr[eé]ditos|pr[eé]stamo|pr[eé]stamos|renta|alquiler|salario|sueldo|n[oó]mina|ingreso|ingresos|presupuesto|bolsillo|ahorr(?:o|os|as|ar)|gast(?:o|os|as|ar)|mortgage|loans?|payment|installments?|bills?|budget|paycheck|savings|debt|wages?|rent|to\s+pay|you\s+(?:pay|owe|save|spend))\b/iu;

/**
 * True when copy contains second-person address or a concrete thing the reader
 * pays or owns (a payment, a bill, a debt, a budget). Used to tell "resolved for
 * the reader" from "answered with institutional data".
 */
export function hasReaderStakeLanguage(value?: string): boolean {
  return Boolean(value && READER_STAKE_PATTERN.test(value));
}

function firstSentenceOfCopy(value?: string): string {
  return value?.trim().split(/(?<=[.!?])\s+/u)[0]?.trim() ?? "";
}

// Named-institution openers. Case-insensitive: a real headline capitalizes them.
const INSTITUTION_LEAD_PATTERN =
  /^(?:el|la|los|las)\s+(?:banco|reserva|gobierno|ministerio|congreso|senado|parlamento|comisi[oó]n|autoridad|ag(?:e|é)ncia|junta)\b|^(?:banco central|reserva federal|federal reserve|central bank|the fed|white house|casa blanca)\b/iu;

// "Anthropic announced…", "OpenAI unveiled…". This one stays case-sensitive on
// purpose: the leading capital is what marks the proper noun, and matching any
// word here would flag ordinary sentences that happen to use an announce verb.
const ORGANIZATION_LEAD_PATTERN =
  /^[A-Z][\w.-]+(?:\s+(?:Inc|Corp|Co|SA|Ltd|AI))?\s+(?:anunci|mantuv|mantien|dej[oó]|conserv|fij[oó]|report[oó]|present[oó]|lanz[oó]|announ|held|kept|maintain|report|unveil|launch)/u;

const POLICY_STATUS_VERB_PATTERN =
  /\b(?:mantuvo|mantiene|mantendr[aá]|mantien|dej[oó]|deja|conserv[oó]|conserva|fij[oó]|fija|sostuvo|sostiene|permanece|permaneci[oó]|permanecer[aá]|sin cambios|sin cambio|no modific|no cambi|no sub(?:e|i[oó]|ir[aá])|no baj(?:a|[oó]|ar[aá])|queda en|qued[oó] en|sigue en|se ubica en|se mantiene en|held|keeps?|kept|holds?|holding|stays? at|unchanged|maintains?|maintained|announced?|announces?|leaves? rates?)\b/iu;

const POLICY_RATE_NOUN_PATTERN =
  /\b(?:tasa|tasas|tipo de inter[eé]s|tipos de inter[eé]s|tasa de referencia|tasa objetivo|pol[ií]tica monetaria|rate|rates|target rate|benchmark rate)\b/iu;

const WH_QUESTION_OPENER_PATTERN =
  /^¿?\s*(?:qu[eé]|c[oó]mo|cu[aá]nto?s?|cu[aá]ndo|cu[aá]l(?:es)?|por\s+qu[eé]|para\s+qu[eé]|d[oó]nde|qui[eé]n(?:es)?|what|why|how|when|which|where|who)\b/iu;

const YESNO_QUESTION_OPENER_PATTERN =
  /^(?:did|will|has|have|is|are|was|were|does|do|can|could|should|would)\b/iu;

/**
 * True when copy leads with an institution or is a bare policy-status statement
 * and never names a stake the audience feels. Used for the reader-consequence
 * cover check and for the caption's first sentence.
 */
export function isInstitutionFirstCoverCopy(headline?: string): boolean {
  const trimmed = headline?.trim();
  if (!trimmed) return false;
  if (READER_STAKE_PATTERN.test(trimmed)) return false;
  if (
    INSTITUTION_LEAD_PATTERN.test(trimmed) ||
    ORGANIZATION_LEAD_PATTERN.test(trimmed)
  ) {
    return true;
  }
  return (
    POLICY_STATUS_VERB_PATTERN.test(trimmed) &&
    POLICY_RATE_NOUN_PATTERN.test(trimmed)
  );
}

/**
 * True when the cover is a yes/no question ("¿Bajó la tasa hoy?", "Did rates
 * drop?") with no reader stake. Such a cover withholds the answer and defers the
 * central fact to a later slide, which reader-consequence framing forbids.
 */
function isWithheldAnswerCoverCopy(headline?: string): boolean {
  const trimmed = headline?.trim();
  if (!trimmed || !trimmed.endsWith("?")) return false;
  if (READER_STAKE_PATTERN.test(trimmed)) return false;
  if (WH_QUESTION_OPENER_PATTERN.test(trimmed)) return false;
  // A Spanish opener is a yes/no question when the first token after "¿" is a
  // verb rather than an interrogative; English yes/no openers are explicit.
  return (
    /^¿/u.test(trimmed) || YESNO_QUESTION_OPENER_PATTERN.test(trimmed)
  );
}

function meaningfulTokens(...values: (string | undefined)[]): Set<string> {
  return new Set(
    values
      .flatMap((value) => normalizedVisibleCopy(value).split(/\s+/u))
      .filter((token) => token.length >= 3),
  );
}

/**
 * True when the closing slide shares a numeric claim with the cover and
 * introduces no numeric claim the cover lacks — the "different words, same
 * number" restatement that lexical overlap misses (a question vs a statement).
 */
function sharesOnlyNumericThesis(
  a: CarouselNarrativeUnit,
  b: CarouselNarrativeUnit,
): boolean {
  // Same fields as visibleCopyOverlapRatio: a figure the closing adds in its
  // subheadline is still new evidence, so it must not read as a restatement.
  const aNums = new Set([
    ...numericTokens(a.headline),
    ...numericTokens(a.subheadline),
    ...numericTokens(a.body),
  ]);
  if (aNums.size === 0) return false;
  const bNums = new Set([
    ...numericTokens(b.headline),
    ...numericTokens(b.subheadline),
    ...numericTokens(b.body),
  ]);
  const shared = [...aNums].some((token) => bNums.has(token));
  const closingOnly = [...aNums].some((token) => !bNums.has(token));
  return shared && !closingOnly;
}

function visibleCopyOverlapRatio(
  a: CarouselNarrativeUnit,
  b: CarouselNarrativeUnit,
): number {
  const tokensA = meaningfulTokens(a.headline, a.subheadline, a.body);
  const tokensB = meaningfulTokens(b.headline, b.subheadline, b.body);
  const smaller = tokensA.size <= tokensB.size ? tokensA : tokensB;
  if (smaller.size === 0) return 0;
  let shared = 0;
  smaller.forEach((token) => {
    if ((smaller === tokensA ? tokensB : tokensA).has(token)) shared += 1;
  });
  return shared / smaller.size;
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
