/**
 * Pure "same news event" detection. Given a candidate story and a set of prior
 * stories (already published, already selected, or other pending candidates),
 * decide whether the candidate is a duplicate of one of them — using a semantic
 * embedding when both vectors exist (works across languages), and falling back
 * to the existing lexical title similarity when an embedding is missing.
 */

import { calculateTitleSimilarity } from "./deduplicate-similar-stories";

export type DuplicateTier = "published" | "selected" | "pending";

const TIER_RANK: Record<DuplicateTier, number> = {
  published: 3,
  selected: 2,
  pending: 1,
};

export type DuplicatePrior = {
  storyId: string;
  title: string;
  embedding: number[] | null;
  effectiveDate: Date;
  tier: DuplicateTier;
};

export type DuplicateCandidate = {
  storyId: string;
  title: string;
  embedding: number[] | null;
  effectiveDate: Date;
};

export type DuplicateMatch = {
  storyId: string;
  similarity: number;
  method: "embedding" | "lexical";
  tier: DuplicateTier;
};

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function findDuplicateEvent(input: {
  candidate: DuplicateCandidate;
  priors: readonly DuplicatePrior[];
  cosineThreshold: number;
  lexicalThreshold: number;
  windowMs: number;
}): DuplicateMatch | null {
  const { candidate, priors, cosineThreshold, lexicalThreshold, windowMs } = input;

  let best: DuplicateMatch | null = null;
  for (const prior of priors) {
    if (prior.storyId === candidate.storyId) continue;
    if (
      Math.abs(prior.effectiveDate.getTime() - candidate.effectiveDate.getTime()) >
      windowMs
    ) {
      continue;
    }

    let similarity: number;
    let method: "embedding" | "lexical";
    if (candidate.embedding && prior.embedding) {
      similarity = cosineSimilarity(candidate.embedding, prior.embedding);
      method = "embedding";
      if (similarity < cosineThreshold) continue;
    } else {
      similarity = calculateTitleSimilarity(candidate.title, prior.title);
      method = "lexical";
      if (similarity < lexicalThreshold) continue;
    }

    if (!best || isStrongerMatch({ similarity, tier: prior.tier }, best)) {
      best = { storyId: prior.storyId, similarity, method, tier: prior.tier };
    }
  }
  return best;
}

function isStrongerMatch(
  next: { similarity: number; tier: DuplicateTier },
  current: DuplicateMatch,
): boolean {
  const nextRank = TIER_RANK[next.tier];
  const currentRank = TIER_RANK[current.tier];
  if (nextRank !== currentRank) return nextRank > currentRank;
  return next.similarity > current.similarity;
}
