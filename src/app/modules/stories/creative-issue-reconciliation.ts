import type { CreativeQualityIssue } from "./creative-content.types";

const MECHANICALLY_DECIDABLE_CRITIC_CODES = new Set([
  "UNSUPPORTED_NUMBER",
]);

function issueLocationKey(issue: CreativeQualityIssue): string {
  return `${issue.code}:${issue.unitOrder ?? 0}`;
}

/**
 * Reconciles factual claims that the local validator can decide mechanically.
 * A model-reported unsupported number is blocking only when the deterministic
 * validator independently finds the same problem in the same draft location.
 */
export function reconcileCriticIssuesWithDeterministicValidation(
  criticIssues: readonly CreativeQualityIssue[],
  deterministicIssues: readonly CreativeQualityIssue[],
): CreativeQualityIssue[] {
  const confirmedBlockerKeys = new Set(
    deterministicIssues
      .filter(
        (issue) =>
          issue.severity === "blocker" &&
          MECHANICALLY_DECIDABLE_CRITIC_CODES.has(issue.code),
      )
      .map(issueLocationKey),
  );

  return criticIssues.map((issue) => {
    if (
      !MECHANICALLY_DECIDABLE_CRITIC_CODES.has(issue.code) ||
      confirmedBlockerKeys.has(issueLocationKey(issue))
    ) {
      return issue;
    }

    const location = issue.unitOrder
      ? ` on slide ${issue.unitOrder}`
      : " in the publishing copy";
    return {
      code: "CRITIC_VALIDATOR_DISAGREEMENT",
      severity: "warning",
      message: `The critic reported an unsupported number${location}, but deterministic validation did not confirm it in the same location. Critic detail: ${issue.message}`,
      ...(issue.unitOrder ? { unitOrder: issue.unitOrder } : {}),
    };
  });
}
