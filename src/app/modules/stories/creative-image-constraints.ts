import type {
  CreativeKeyFact,
  CreativeUnit,
} from "./creative-content.types";

const CHART_REQUEST_PATTERN =
  /\b(?:bar chart|column chart|line chart|comparison chart|comparative chart|graph|plot|quantitative chart|gr[aá]fic[oa](?: de barras| de columnas| de l[ií]neas| comparativ[oa])?|barras? comparativas?|ejes? num[eé]ricos?)\b/iu;

/**
 * Prevents an image model from turning a qualitative source comparison into
 * precise-looking but fabricated geometry. Years alone do not establish bar
 * heights, quantities, or a scale.
 */
export function buildDataVisualizationConstraint(
  unit: Pick<CreativeUnit, "visualDirection" | "factIds">,
  keyFacts: readonly CreativeKeyFact[],
): string {
  const facts = keyFacts.filter((fact) => unit.factIds.includes(fact.id));
  const exactValues = uniqueSubstantiveNumbers(
    facts.flatMap((fact) =>
      fact.claimGuard?.allowedNumbers?.length
        ? fact.claimGuard.allowedNumbers
        : extractNumbers(fact.sourceExcerpt?.trim() || fact.statement),
    ),
  );

  if (
    CHART_REQUEST_PATTERN.test(unit.visualDirection) &&
    exactValues.length < 2
  ) {
    return "HARD DATA-INTEGRITY LOCK: the selected evidence does not provide enough exact category values for a quantitative chart. Use a clearly qualitative, non-proportional conceptual comparison instead. Do not render axes, tick marks, numeric scales, data labels, measured bar heights, or geometry that implies exact magnitude.";
  }

  return "HARD DATA-INTEGRITY LOCK: never invent chart categories, values, labels, scales, dates, percentages, currency amounts, or proportional relationships. If a chart is used, every depicted magnitude must be explicitly supported by the selected facts and already present in VISIBLE_TEXT; otherwise use symbolic cards, objects, or a non-proportional conceptual comparison.";
}

function extractNumbers(value: string): string[] {
  return value.match(/\b\d[\d,.]*(?:\s*%)?/gu) ?? [];
}

function uniqueSubstantiveNumbers(values: readonly string[]): string[] {
  const normalized = values.flatMap((value) => {
    const compact = value.replace(/[,%\s]/gu, "");
    const numeric = Number(compact);
    if (!Number.isFinite(numeric) || (numeric >= 1900 && numeric <= 2100)) {
      return [];
    }
    return [compact];
  });
  return [...new Set(normalized)];
}
