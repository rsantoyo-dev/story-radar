import type { CreativeProfile } from "../../stories/creative-content.types";
import { ARCS_SKILL } from "./arcs";
import { CAPTION_ROLES, CAPTIONS_SKILL } from "./captions";
import { CLOSING_ROLES, CLOSINGS_SKILL } from "./closings";
import { DECK_ROLES, DECKS_SKILL } from "./decks";
import { DRAFT_ROLES, DRAFTS_SKILL } from "./drafts";
import { DISCOVERY_ROLES, DISCOVERY_SKILL } from "./discovery";
import { FACTS_ROLES, FACTS_SKILL } from "./facts";
import { FAIRNESS_SKILL } from "./fairness";
import { FOCUS_ROLES, FOCUS_SKILL } from "./focus";
import { HOOKS_SKILL, OPENING_ROLES } from "./hooks";
import { LEVERS_SKILL } from "./levers";
import { IMAGE_ROLES, IMAGES_SKILL } from "./images";
import { NARRATIVE_ROLES, NARRATIVES_SKILL } from "./narratives";
import { REVIEW_ROLES, REVIEW_SKILL } from "./review";
import { SPINE_SKILL } from "./spine";
import { VISUAL_ROLES, VISUALS_SKILL } from "./visuals";
import { toneLine } from "./tone";
import { addressBrief } from "../draft2-address.types";
import { READER_SKILL } from "./reader";

/**
 * Skills: the editorial craft Draft 2's models read, one versioned text per
 * craft, kept in git as TypeScript strings (nothing is read from disk at
 * runtime). A role that writes and the role that judges it read the same
 * skill, so they work from one rubric; every provider call records the
 * skill versions its instructions were composed from.
 */
export type Draft2SkillName = "facts" | "focus" | "narratives" | "discovery" | "arcs" | "spine" | "levers" | "fairness" | "reader" | "hooks" | "closings" | "decks" | "drafts" | "review" | "visuals" | "images" | "captions";
export type Draft2Role = "extractor" | "reviewer" | "focus-editor" | "focus-planner" | "focus-narrative-judge" | "focus-concept-judge" | "opening-writer" | "opening-judge" | "closing-writer" | "closing-judge" | "deck-writer" | "deck-judge" | "draft-writer"
  | "people-finder" | "visual-writer" | "visual-judge" | "image-judge" | "caption-writer" | "caption-judge" | "mention-finder" | "carousel-reader" | "carousel-editor";

export type Draft2Skill = {
  name: Draft2SkillName;
  version: string;
  /** What every role that reads the skill sees. */
  text: string;
  /** What only one role reads, after the shared text. */
  roleText?: Partial<Record<Draft2Role, string>>;
};

export const DRAFT2_SKILLS: Record<Draft2SkillName, Draft2Skill> = { facts: FACTS_SKILL, focus: FOCUS_SKILL, narratives: NARRATIVES_SKILL, discovery: DISCOVERY_SKILL, arcs: ARCS_SKILL, spine: SPINE_SKILL, levers: LEVERS_SKILL, fairness: FAIRNESS_SKILL, reader: READER_SKILL, hooks: HOOKS_SKILL, closings: CLOSINGS_SKILL, decks: DECKS_SKILL, drafts: DRAFTS_SKILL, review: REVIEW_SKILL, visuals: VISUALS_SKILL, images: IMAGES_SKILL, captions: CAPTIONS_SKILL };

/** Each role's own instructions: who it is and what it receives. */
export const DRAFT2_ROLES: Record<Draft2Role, string> = { ...FACTS_ROLES, ...FOCUS_ROLES, ...NARRATIVE_ROLES, ...DISCOVERY_ROLES, ...OPENING_ROLES, ...CLOSING_ROLES, ...DECK_ROLES, ...DRAFT_ROLES, ...REVIEW_ROLES, ...VISUAL_ROLES, ...IMAGE_ROLES, ...CAPTION_ROLES };

/** The narratives skill when the focus names a form other than classic; a classic story's instructions stay as they were. */
export const narrativeSkills = (narrative: { form: string } | undefined): Draft2Skill[] => narrative && narrative.form !== "classic" ? [NARRATIVES_SKILL] : [];
/** The discovery skill when the focus's concept is discovery, the arcs skill for another arc; a classic story's instructions stay as they were. */
export const discoverySkills = (concept: { arc: string } | undefined): Draft2Skill[] =>
  !concept || concept.arc === "classic" ? [] : concept.arc === "discovery" ? [DISCOVERY_SKILL] : [ARCS_SKILL];
/** The spine skill when the focus has a spine; a focus decided before spines changes nothing. */
export const spineSkills = (spine: unknown): Draft2Skill[] => spine ? [SPINE_SKILL] : [];
/** All of them, in the order the instructions read them: the concept (how the reader meets the news), the narrative form, then the spine both follow. */
export const creativeSkills = (values: { concept?: { arc: string }; narrative?: { form: string }; spine?: unknown }): Draft2Skill[] => [...discoverySkills(values.concept), ...narrativeSkills(values.narrative), ...spineSkills(values.spine)];

/**
 * What every writer reads after its role: the editor's standard. The writer
 * checks its own candidates against the hard rules before it answers (the
 * program's findings cost a round each; real first rounds lost nine openings
 * of fifteen to them), and hands in nothing it would not defend at 95/100.
 */
export const WRITER_STANDARD = `## Your standard
You are the best carousel writer this publication has, and you hand in only what you would defend at 95/100. Before you answer, check every candidate yourself: count the words of each headline, subheadline, body and call to action and keep each at least one word under its limit (the request's wordLimits, else the skill's): the program counts every word, numbers included, and a text written right at its limit often comes out one over; make sure every number and every claim rests on a fact the candidate cites, with that fact's qualifier and attribution kept; keep each guard the focus names; cite no fact id inside a text; and ask the image for no logo, page number, swipe cue or other words. Write for the reader, not about the source: name a study or a source once ("a Penn State study") and then tell the facts in the reader's words, keeping each claim's attribution as "the study" or "the researcher"; a researcher's or a spokesperson's name never in the cover or a headline, and at most once in the carousel; every headline says what the reader learns, gains or can do, never the study's procedure ("the burn was measured every 10 seconds") or what the study "highlighted". One strong candidate beats two safe ones, and a predictable candidate is a weak one: within the facts, take the angle, the device or the image the reader has not met. The judge is independent and never lenient; your own check saves the round a flaw would cost.`;

/**
 * What the judges who score originality read after their role: originality
 * is scored against the predictable telling, never as a licence to leave the
 * facts. The editor's ask (2026-10-15): the publication rewards creativity,
 * always inside the facts.
 */
export const JUDGE_STANDARD = `## Originality
Score originality against the predictable telling of this subject for this audience: the angle, the device, the image or the structure a reader has not met in stories like this one. 95 and above only for a telling the reader has not seen on this subject; 85 to 94 for a fresh angle, device or image inside a familiar frame; 70 to 84 for competent but predictable work; below 70 for a formula (a title-formula headline, a stock scene, a recap ending, "N things you need to know"). Originality never excuses a claim the facts do not carry, a dropped qualifier, sensationalism or a joke on a grave story: those fall under grounding, truth and voice, and a candidate that fails them is not original, it is wrong. Within the facts, reward the surprising true angle, the earned unexpected image and the voice that sounds like a person; never reward loudness.`;

/**
 * What the visual writer reads after its role instead of the text writers'
 * standard, which counts headline words and cited facts it does not write:
 * the checks a script loses rounds on (the program's findings, and the
 * judge's most frequent).
 */
export const VISUAL_WRITER_STANDARD = `## Your standard
You are the best art director this publication has, and you hand in only what you would defend at 95/100. Before you answer, check every script yourself: one slide per carousel slide, in the carousel's order, each beat copied from spineBeats where it has one; every direction under 700 characters, concrete enough to be made from alone, and nothing in it the beat does not ask for; no real person or named place in a direction without its verified material in references, no organization's name, none of the brand's avoid terms, and no words, numbers, captions, logos or page numbers asked of the image (a corner or a band kept free for the logo is fine); shots that alternate, outside a panorama; the characters from the roster, on the plan and the editor's choice, at most two a slide and none on a verified photo; the cover on another background than the last cover's, and without the brand's character when the last cover had it. The judge is independent and never lenient; your own check saves the round a flaw would cost.`;

/** The judges whose skill scores originality. */
const ORIGINALITY_JUDGES: readonly Draft2Role[] = ["opening-judge", "closing-judge", "deck-judge", "visual-judge", "carousel-editor"];

/** The standard a role reads after its own instructions: the writers' check, the judges' originality; nothing for the other roles. */
export const roleStandard = (role: Draft2Role): string => role === "visual-writer" ? VISUAL_WRITER_STANDARD : role.endsWith("-writer") ? WRITER_STANDARD : ORIGINALITY_JUDGES.includes(role) ? JUDGE_STANDARD : "";

/**
 * What a skill tells a role beside its text. The v4 draft writer replaces the
 * three writers of the words: it reads what each skill tells them (the spine,
 * the arc, the levers, the narrative form); their own output contracts live in
 * DRAFT2_ROLES and stay theirs.
 */
const DRAFT_WRITER_PARTS: readonly Draft2Role[] = ["opening-writer", "deck-writer", "closing-writer"];
const roleTextsOf = (skill: Draft2Skill, role: Draft2Role): string[] => role !== "draft-writer" ? [skill.roleText?.[role] ?? ""]
  : [...new Set(DRAFT_WRITER_PARTS.map((part) => skill.roleText?.[part] ?? ""))];

/** Role instructions + the role's standard + the skills the role reads + the Topic's brand brief, in that order. */
export function composeInstructions(role: Draft2Role, skills: readonly Draft2Skill[], brandBrief?: string): { instructions: string; skillVersions: Record<string, string> } {
  const parts = [DRAFT2_ROLES[role], roleStandard(role), ...skills.flatMap((skill) => [skill.text, ...roleTextsOf(skill, role)]), brandBrief ?? ""];
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
export function brandBrief(profile: Pick<CreativeProfile, "name" | "language" | "region" | "platform" | "audience" | "brandPersonality" | "formality" | "humor" | "energy" | "optimism" | "provocation" | "readerAddress" | "writingGuidance">): string {
  const personality = (profile.brandPersonality ?? []).map(clause).filter((word) => word.length > 0);
  const line = (label: string, value: string | undefined) => clause(value) ? `- ${label}: ${clause(value)}.` : undefined;
  return [
    "# The publication",
    line("Name", profile.name),
    clause(profile.language) ? `- Language: write every reader-facing word in ${clause(profile.language)}; the article may be in another language.` : undefined,
    addressBrief({ address: profile.readerAddress, language: profile.language ?? "" }),
    line("Region", profile.region),
    line("Platform", profile.platform),
    line("Audience", profile.audience),
    personality.length ? `- Brand personality: ${personality.join(", ")}.` : undefined,
    `- Tone, the publication's defaults for an ordinary story (the story's gravity sets the ceiling): ${toneLine(profile)}.`,
    writingRules(profile.writingGuidance),
  ].filter((entry) => entry !== undefined).join("\n");
}

/** The brand's own writing rules, as it wrote them, under the brief: they win over a general habit of the skills. */
function writingRules(guidance: string | undefined): string | undefined {
  const lines = (guidance ?? "").split("\n").map((entry) => entry.trim()).filter(Boolean);
  if (!lines.length) return undefined;
  return ["- Writing rules, the publication's own (they win over a general habit):", ...lines.map((entry) => `  ${entry}`)].join("\n");
}
