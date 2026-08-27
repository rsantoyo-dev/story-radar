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
  conclude: 1,
  debate: 1,
};

export type CarouselNarrativeUnit = {
  role: string;
  editorialGoal?: CarouselEditorialGoal;
  viewerQuestion?: string;
  ctaQuestion?: string;
  headline?: string;
  body?: string;
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
    | "cta-position"
    | "missing-debate-question"
    | "closing-question-count"
    | "role-goal-mismatch"
    | "evidence-without-facts"
    | "fact-overuse"
    | "headline-too-long"
    | "body-too-long";
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
): readonly CarouselEditorialGoal[] | undefined {
  return slideCount >= 3 && slideCount <= 8
    ? PREFERRED_CAROUSEL_ARCS[slideCount as CarouselSlideCount]
    : undefined;
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

/** Hard plan invariants. Arc deviations remain valid when rationale explains them. */
export function validateCarouselPlan(
  plan: CarouselPlan,
  knownFactIds: ReadonlySet<string>,
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
  });

  return errors;
}

/**
 * Serializable policy sent to the draft model. The same definitions power the
 * editor warnings below, so prompt guidance and review cannot silently drift.
 */
export function carouselNarrativePolicyForPrompt() {
  return {
    flexibility:
      "Use the preferred arc for the selected slide count unless the story clearly benefits from another sequence. If you deviate, explain why in narrativeRationale.",
    roleSemantics:
      "role controls presentation and layout; editorialGoal controls the narrative job of the slide.",
    preferredArcs: Object.entries(PREFERRED_CAROUSEL_ARCS).map(
      ([slideCount, goals]) => ({
        slideCount: Number(slideCount),
        goals,
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
      "A conclude or debate slide should reuse earlier facts and should not introduce unsupported or new information.",
    ],
  };
}

export function evaluateCarouselNarrative(
  units: readonly CarouselNarrativeUnit[],
  narrativeRationale?: string,
): CarouselNarrativeWarning[] {
  const warnings: CarouselNarrativeWarning[] = [];
  const preferredArc = getPreferredCarouselArc(units.length);

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
        message: `Slide ${slide} has a CTA question, but visible CTA copy should normally be reserved for the final slide.`,
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

    if (wordCount(unit.headline) > 14) {
      warnings.push({
        severity: "warning",
        code: "headline-too-long",
        unitIndex,
        message: `Slide ${slide} headline uses ${wordCount(unit.headline)} words; aim for 14 or fewer.`,
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

  const lastIndex = units.length - 1;
  const last = units[lastIndex];
  if (last) {
    if (last.role !== "conclusion" && last.role !== "call-to-action") {
      warnings.push({
        severity: "blocker",
        code: "closing-role",
        unitIndex: lastIndex,
        message:
          "The final carousel slide should normally use the conclusion or call-to-action role.",
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
      last.body,
      last.ctaQuestion,
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

  const factUsage = new Map<string, number>();
  units.forEach((unit) => {
    new Set(unit.factIds).forEach((factId) =>
      factUsage.set(factId, (factUsage.get(factId) ?? 0) + 1),
    );
  });
  factUsage.forEach((count, factId) => {
    if (count > 2) {
      warnings.push({
        severity: "warning",
        code: "fact-overuse",
        message: `${factId} is cited on ${count} slides; repeated evidence can make the carousel feel static.`,
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
): CarouselNarrativeWarning[] {
  return evaluateCarouselNarrative(units, narrativeRationale).filter(
    (issue) => issue.severity === "blocker",
  );
}

function wordCount(value?: string): number {
  return value?.trim() ? value.trim().split(/\s+/u).length : 0;
}
