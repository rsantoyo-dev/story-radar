import type { CreativeProfile } from "../../stories/creative-content.types";
import { ARCS_SKILL } from "./arcs";
import { CAPTION_ROLES, CAPTIONS_SKILL } from "./captions";
import { CLOSING_ROLES, CLOSINGS_SKILL } from "./closings";
import { DECK_ROLES, DECKS_SKILL } from "./decks";
import { DISCOVERY_ROLES, DISCOVERY_SKILL } from "./discovery";
import { FACTS_ROLES, FACTS_SKILL } from "./facts";
import { FOCUS_ROLES, FOCUS_SKILL } from "./focus";
import { HOOKS_SKILL, OPENING_ROLES } from "./hooks";
import { IMAGE_ROLES, IMAGES_SKILL } from "./images";
import { NARRATIVE_ROLES, NARRATIVES_SKILL } from "./narratives";
import { VISUAL_ROLES, VISUALS_SKILL } from "./visuals";
import { toneLine } from "./tone";

/**
 * Skills: the editorial craft Draft 2's models read, one versioned text per
 * craft, kept in git as TypeScript strings (nothing is read from disk at
 * runtime). A role that writes and the role that judges it read the same
 * skill, so they work from one rubric; every provider call records the
 * skill versions its instructions were composed from.
 */
export type Draft2SkillName = "facts" | "focus" | "narratives" | "discovery" | "arcs" | "hooks" | "closings" | "decks" | "visuals" | "images" | "captions";
export type Draft2Role = "extractor" | "reviewer" | "focus-editor" | "focus-narrative-judge" | "focus-concept-judge" | "opening-writer" | "opening-judge" | "closing-writer" | "closing-judge" | "deck-writer" | "deck-judge"
  | "people-finder" | "visual-writer" | "visual-judge" | "image-judge" | "caption-writer" | "caption-judge" | "mention-finder";

export type Draft2Skill = {
  name: Draft2SkillName;
  version: string;
  /** What every role that reads the skill sees. */
  text: string;
  /** What only one role reads, after the shared text. */
  roleText?: Partial<Record<Draft2Role, string>>;
};

export const DRAFT2_SKILLS: Record<Draft2SkillName, Draft2Skill> = { facts: FACTS_SKILL, focus: FOCUS_SKILL, narratives: NARRATIVES_SKILL, discovery: DISCOVERY_SKILL, arcs: ARCS_SKILL, hooks: HOOKS_SKILL, closings: CLOSINGS_SKILL, decks: DECKS_SKILL, visuals: VISUALS_SKILL, images: IMAGES_SKILL, captions: CAPTIONS_SKILL };

/** Each role's own instructions: who it is and what it receives. */
export const DRAFT2_ROLES: Record<Draft2Role, string> = { ...FACTS_ROLES, ...FOCUS_ROLES, ...NARRATIVE_ROLES, ...DISCOVERY_ROLES, ...OPENING_ROLES, ...CLOSING_ROLES, ...DECK_ROLES, ...VISUAL_ROLES, ...IMAGE_ROLES, ...CAPTION_ROLES };

/** The narratives skill when the focus names a form other than classic; a classic story's instructions stay as they were. */
export const narrativeSkills = (narrative: { form: string } | undefined): Draft2Skill[] => narrative && narrative.form !== "classic" ? [NARRATIVES_SKILL] : [];
/** The discovery skill when the focus's concept is discovery, the arcs skill for another arc; a classic story's instructions stay as they were. */
export const discoverySkills = (concept: { arc: string } | undefined): Draft2Skill[] =>
  !concept || concept.arc === "classic" ? [] : concept.arc === "discovery" ? [DISCOVERY_SKILL] : [ARCS_SKILL];
/** Both, in the order the instructions read them: the concept (how the reader meets the news), then the narrative form. */
export const creativeSkills = (values: { concept?: { arc: string }; narrative?: { form: string } }): Draft2Skill[] => [...discoverySkills(values.concept), ...narrativeSkills(values.narrative)];

/** Role instructions + the skills the role reads + the Topic's brand brief, in that order. */
export function composeInstructions(role: Draft2Role, skills: readonly Draft2Skill[], brandBrief?: string): { instructions: string; skillVersions: Record<string, string> } {
  const parts = [DRAFT2_ROLES[role], ...skills.flatMap((skill) => [skill.text, skill.roleText?.[role] ?? ""]), brandBrief ?? ""];
  return {
    instructions: parts.map((part) => part.trim()).filter((part) => part.length > 0).join("\n\n"),
    skillVersions: Object.fromEntries(skills.map((skill) => [skill.name, skill.version])),
  };
}

const oneLine = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
/** One line without its closing period, so the brief adds exactly one. */
const clause = (value: string | undefined) => oneLine(value).replace(/[.\s]+$/, "");

/**
 * The Topic's voice, from the creative profile, as a short brief both models
 * read. Visual guidance, call-to-action style and conversion goal stay out:
 * the opening has no call to action and no image yet.
 */
export function brandBrief(profile: Pick<CreativeProfile, "name" | "language" | "region" | "platform" | "audience" | "brandPersonality" | "formality" | "humor" | "energy" | "optimism" | "provocation">): string {
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
    `- Tone, the publication's defaults for an ordinary story (the story's gravity sets the ceiling): ${toneLine(profile)}.`,
  ].filter((entry) => entry !== undefined).join("\n");
}
