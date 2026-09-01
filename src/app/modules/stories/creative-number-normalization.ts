const CREATIVE_NUMERIC_LITERAL_PATTERN =
  /(?:[$€£]\s*)?~?\d(?:[\d.,'’]|(?<![.,])[ \t\u00a0\u202f](?=\d{3}(?:[ \t\u00a0\u202f]\d{3})*(?!\d)))*(?:\s*(?:%|(?:percent|por ciento|mil millones|thousand|million|billion|millones?|millón|mil|k|m|b)\b))?/giu;

/**
 * Extracts numeric evidence using one locale-neutral representation.
 *
 * Creative evidence is often written with English punctuation while the
 * publishing copy uses Spanish punctuation. These pairs must compare as the
 * same factual value:
 *
 * - 21.8% and 21,8%
 * - 726,820 and 726.820
 * - 1,344.50 and 1.344,50
 */
export function extractCreativeNumericLiterals(value: string): string[] {
  return [...value.matchAll(CREATIVE_NUMERIC_LITERAL_PATTERN)].map((match) =>
    normalizeCreativeNumericLiteral(match[0]),
  );
}

export function normalizeCreativeNumericLiteral(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[$€£]/gu, "")
    .replace(/^~/u, "")
    .replace(/[ \t\u00a0\u202f'’](?=\d)/gu, "")
    .replace(/\s*(?:percent|por ciento|%)$/u, "%")
    .trim()
    .replace(/[.,]+$/u, "");
  const scaled = normalized.match(
    /^(\d[\d.,]*)\s*(k|m|b|thousand|million|billion|mil millones|mil|millones?|millón)$/iu,
  );
  if (scaled?.[1] && scaled[2]) {
    const amount = normalizeNumericSeparators(scaled[1], true);
    const scale = scaled[2].toLowerCase();
    const multiplier =
      scale === "k" || scale === "thousand" || scale === "mil"
        ? 1_000
        : scale === "b" || scale === "billion" || scale === "mil millones"
          ? 1_000_000_000
          : 1_000_000;
    return String(Number(amount) * multiplier);
  }

  const percentage = normalized.endsWith("%");
  const numericToken = percentage ? normalized.slice(0, -1) : normalized;
  if (/^\d[\d.,]*$/u.test(numericToken)) {
    const number = normalizeNumericSeparators(numericToken, percentage);
    return `${number}${percentage ? "%" : ""}`;
  }
  return normalized.replace(/\s+/gu, "");
}

export function substantiveCreativeNumericLiterals(
  values: string | readonly string[],
): string[] {
  const candidates = typeof values === "string" ? [values] : values;
  const normalized = candidates.flatMap((candidate) =>
    [...candidate.matchAll(CREATIVE_NUMERIC_LITERAL_PATTERN)].flatMap(
      (match) => {
        if (isLikelyBareCalendarYear(match[0])) return [];
        const value = normalizeCreativeNumericLiteral(match[0]);
        return Number.isFinite(Number(value.replace(/%$/u, "")))
          ? [value]
          : [];
      },
    ),
  );
  return [...new Set(normalized)];
}

function isLikelyBareCalendarYear(rawValue: string): boolean {
  const bare = rawValue.trim().replace(/[.,]+$/u, "");
  if (!/^\d{4}$/u.test(bare)) return false;
  const numeric = Number(bare);
  return numeric >= 1900 && numeric <= 2100;
}

function normalizeNumericSeparators(
  value: string,
  preferDecimal: boolean,
): string {
  const token = value.replace(/[.,]+$/u, "");
  const dots = [...token.matchAll(/\./gu)].map((match) => match.index ?? -1);
  const commas = [...token.matchAll(/,/gu)].map((match) => match.index ?? -1);
  let canonical: string;

  if (dots.length > 0 && commas.length > 0) {
    const decimalSeparator = dots.at(-1)! > commas.at(-1)! ? "." : ",";
    const groupingSeparator = decimalSeparator === "." ? "," : ".";
    canonical = token
      .replaceAll(groupingSeparator, "")
      .replace(decimalSeparator, ".");
  } else {
    const separator = dots.length > 0 ? "." : commas.length > 0 ? "," : "";
    if (!separator) return canonicalNumericString(token);

    const parts = token.split(separator);
    const grouped =
      parts.length > 2 &&
      parts.slice(1).every((part) => part.length === 3);
    if (grouped) {
      canonical = parts.join("");
    } else if (parts.length > 2) {
      canonical = `${parts.slice(0, -1).join("")}.${parts.at(-1)}`;
    } else {
      const [integer = "", fraction = ""] = parts;
      // A lone separator followed by three digits is inherently ambiguous
      // without a locale. News copy overwhelmingly uses that shape for a
      // grouped count, while percentages and scaled values prefer decimals.
      const isThousandsSeparator =
        !preferDecimal &&
        integer !== "0" &&
        fraction.length === 3;
      canonical = isThousandsSeparator
        ? `${integer}${fraction}`
        : `${integer}.${fraction}`;
    }
  }

  return canonicalNumericString(canonical);
}

function canonicalNumericString(value: string): string {
  const [rawInteger = "0", rawFraction] = value.split(".");
  const integer = rawInteger.replace(/^0+(?=\d)/u, "") || "0";
  const fraction = rawFraction?.replace(/0+$/u, "");
  return fraction ? `${integer}.${fraction}` : integer;
}
