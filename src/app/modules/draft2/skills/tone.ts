/**
 * The five tone dials of a creative profile, in plain words by band, so a
 * model reads "humor 70/100: often" rather than a bare number. Shared by the
 * brand brief and the focus, and kept apart from the skill texts so the
 * canvas can show the words without loading them.
 */
export const TONE_KEYS = ["formality", "humor", "energy", "optimism", "provocation"] as const;
export type ToneKey = (typeof TONE_KEYS)[number];

type ToneBand = readonly [ceiling: number, words: string];

/** Plain words for each tone number, by band; a band covers values up to its ceiling. */
const TONE: Record<ToneKey, readonly ToneBand[]> = {
  formality: [[20, "casual"], [40, "conversational"], [60, "neutral"], [80, "polished"], [100, "formal"]],
  humor: [[10, "never"], [30, "rarely"], [60, "now and then"], [80, "often"], [100, "playful throughout"]],
  energy: [[30, "calm"], [60, "steady"], [80, "lively"], [100, "high-energy"]],
  optimism: [[30, "sober"], [60, "balanced"], [80, "hopeful"], [100, "upbeat"]],
  provocation: [[20, "gentle, never confrontational"], [40, "measured"], [60, "direct, never insulting"], [80, "bold, never insulting"], [100, "provocative, never insulting"]],
};

/** A dial as a whole number from 1 to 100; anything else reads as 1. */
export const toneValue = (value: unknown): number => Math.min(100, Math.max(1, Math.round(Number(value) || 1)));

/** The words for one dial's value. */
export const toneWords = (key: ToneKey, value: number): string => TONE[key].find(([ceiling]) => toneValue(value) <= ceiling)?.[1] ?? "";

/** "humor 70/100: often; …" for every dial, in the order of TONE_KEYS. */
export const toneLine = (dials: Record<ToneKey, unknown>): string =>
  TONE_KEYS.map((key) => `${key} ${toneValue(dials[key])}/100: ${toneWords(key, toneValue(dials[key]))}`).join("; ");
