import type { CreativeProfile } from "../../stories/creative-content.types";
import { FACTS_ROLES, FACTS_SKILL } from "./facts";
import { HOOKS_SKILL, OPENING_ROLES } from "./hooks";

/**
 * Skills: the editorial craft Draft 2's models read, one versioned text per
 * craft, kept in git as TypeScript strings (nothing is read from disk at
 * runtime). A role that writes and the role that judges it read the same
 * skill, so they work from one rubric; every provider call records the
 * skill versions its instructions were composed from.
 */
export type Draft2SkillName = "facts" | "hooks";
export type Draft2Role = "extractor" | "reviewer" | "opening-writer" | "opening-judge";

export type Draft2Skill = {
  name: Draft2SkillName;
  version: string;
  /** What every role that reads the skill sees. */
  text: string;
  /** What only one role reads, after the shared text. */
  roleText?: Partial<Record<Draft2Role, string>>;
};

export const DRAFT2_SKILLS: Record<Draft2SkillName, Draft2Skill> = { facts: FACTS_SKILL, hooks: HOOKS_SKILL };

/** Each role's own instructions: who it is and what it receives. */
export const DRAFT2_ROLES: Record<Draft2Role, string> = { ...FACTS_ROLES, ...OPENING_ROLES };

/** Role instructions + the skills the role reads + the Topic's brand brief, in that order. */
export function composeInstructions(role: Draft2Role, skills: readonly Draft2Skill[], brandBrief?: string): { instructions: string; skillVersions: Record<string, string> } {
  const parts = [DRAFT2_ROLES[role], ...skills.flatMap((skill) => [skill.text, skill.roleText?.[role] ?? ""]), brandBrief ?? ""];
  return {
    instructions: parts.map((part) => part.trim()).filter((part) => part.length > 0).join("\n\n"),
    skillVersions: Object.fromEntries(skills.map((skill) => [skill.name, skill.version])),
  };
}

type ToneBand = readonly [ceiling: number, words: string];

/** Plain words for each tone number, by band; a band covers values up to its ceiling. */
const TONE: Record<"formality" | "humor" | "energy" | "optimism" | "provocation", readonly ToneBand[]> = {
  formality: [[20, "casual"], [40, "conversational"], [60, "neutral"], [80, "polished"], [100, "formal"]],
  humor: [[10, "never"], [30, "rarely"], [60, "now and then"], [80, "often"], [100, "playful throughout"]],
  energy: [[30, "calm"], [60, "steady"], [80, "lively"], [100, "high-energy"]],
  optimism: [[30, "sober"], [60, "balanced"], [80, "hopeful"], [100, "upbeat"]],
  provocation: [[20, "gentle, never confrontational"], [40, "measured"], [60, "direct, never insulting"], [80, "bold, never insulting"], [100, "provocative, never insulting"]],
};

const oneLine = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
/** One line without its closing period, so the brief adds exactly one. */
const clause = (value: string | undefined) => oneLine(value).replace(/[.\s]+$/, "");

/**
 * The Topic's voice, from the creative profile, as a short brief both models
 * read. Visual guidance, call-to-action style and conversion goal stay out:
 * the opening has no call to action and no image yet.
 */
export function brandBrief(profile: Pick<CreativeProfile, "name" | "language" | "region" | "platform" | "audience" | "brandPersonality" | "formality" | "humor" | "energy" | "optimism" | "provocation">): string {
  const tone = (Object.keys(TONE) as (keyof typeof TONE)[]).map((key) => {
    const value = Math.min(100, Math.max(1, Math.round(Number(profile[key]) || 1)));
    const words = TONE[key].find(([ceiling]) => value <= ceiling)?.[1];
    return `${key} ${value}/100: ${words}`;
  });
  const personality = (profile.brandPersonality ?? []).map(clause).filter((word) => word.length > 0);
  const line = (label: string, value: string | undefined) => clause(value) ? `- ${label}: ${clause(value)}.` : undefined;
  return [
    "# The publication",
    line("Name", profile.name),
    clause(profile.language) ? `- Language: write every reader-facing word in ${clause(profile.language)}; the article may be in another language.` : undefined,
    line("Region", profile.region),
    line("Platform", profile.platform),
    line("Audience", profile.audience),
    personality.length ? `- Brand personality: ${personality.join(", ")}.` : undefined,
    `- Tone, the publication's defaults for an ordinary story (the story's gravity sets the ceiling): ${tone.join("; ")}.`,
  ].filter((entry) => entry !== undefined).join("\n");
}
