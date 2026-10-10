import assert from "node:assert/strict";
import test from "node:test";
import { brandBrief, composeInstructions, DRAFT2_ROLES, DRAFT2_SKILLS, type Draft2Skill } from "./skills/draft2-skills";
import { FACTS_ROLES, FACTS_SKILL } from "./skills/facts";
import { HOOKS_SKILL, OPENING_ROLES } from "./skills/hooks";
import {
  COVER_HEADLINE_MAX_WORDS, COVER_SUBHEADLINE_MAX_WORDS, OPENING_ACCEPT_SCORE, OPENING_CANDIDATES, OPENING_CRITERIA, OPENING_CRITERION_FLOOR,
  SLIDE2_BODY_MAX_WORDS, SLIDE2_HEADLINE_MAX_WORDS,
} from "./draft2-opening.types";

const profile = {
  name: "Example Daily", language: "French", region: "Montréal, Québec", platform: "Instagram", audience: "Parents who plan their weekend on Thursday.",
  brandPersonality: ["warm", " practical ", ""], formality: 30, humor: 20, energy: 70, optimism: 65, provocation: 60,
};

test("instructions are the role, then each skill, then the brand brief, and record the skill versions", () => {
  const skill: Draft2Skill = { name: "hooks", version: "7", text: "## Shared craft", roleText: { "opening-judge": "## Judge only" } };
  const writer = composeInstructions("opening-writer", [skill], "# Brand");
  assert.equal(writer.instructions, `${OPENING_ROLES["opening-writer"]}\n\n## Shared craft\n\n# Brand`);
  assert.deepEqual(writer.skillVersions, { hooks: "7" });
  assert.equal(composeInstructions("opening-judge", [skill]).instructions, `${OPENING_ROLES["opening-judge"]}\n\n## Shared craft\n\n## Judge only`, "a role reads its own part after the shared text");
  assert.deepEqual(Object.keys(DRAFT2_ROLES).sort(), ["extractor", "opening-judge", "opening-writer", "reviewer"]);
  assert.deepEqual(Object.values(DRAFT2_SKILLS).map((entry) => `${entry.name}@${entry.version}`), ["facts@1", "hooks@1"]);
});

test("the Facts prompts keep their words: the extractor reads its rules, the reviewer its checklist", () => {
  const extractor = composeInstructions("extractor", [FACTS_SKILL]).instructions;
  const reviewer = composeInstructions("reviewer", [FACTS_SKILL]).instructions;
  assert.ok(extractor.startsWith(`${FACTS_ROLES.extractor}\n\nRules:\n- A fact is one checkable claim`));
  assert.ok(extractor.endsWith("add the missing ones with new ids."));
  assert.match(extractor, /never more than 40\./);
  assert.ok(reviewer.startsWith(`${FACTS_ROLES.reviewer}\n\nCheck every fact:\n1. Grounding`));
  assert.ok(reviewer.endsWith("On a revised list, re-check everything, not only your previous issues."));
  assert.ok(!reviewer.includes("Rules:") && !extractor.includes("Check every fact:"));
});

test("the openings rubric states the thresholds the program enforces", () => {
  assert.match(HOOKS_SKILL.text, new RegExp(`## Cover headline\\n- At most ${COVER_HEADLINE_MAX_WORDS} words`));
  assert.match(HOOKS_SKILL.text, new RegExp(`- At most ${COVER_SUBHEADLINE_MAX_WORDS} words\\. The concrete draw`));
  assert.match(HOOKS_SKILL.text, new RegExp(`- Headline at most ${SLIDE2_HEADLINE_MAX_WORDS} words; body at most ${SLIDE2_BODY_MAX_WORDS} words\\.`));
  assert.match(HOOKS_SKILL.text, new RegExp(`overall ≥ ${OPENING_ACCEPT_SCORE} and no criterion is below ${OPENING_CRITERION_FLOOR}`));
  for (const criterion of OPENING_CRITERIA) assert.match(HOOKS_SKILL.text, new RegExp(`\\n- ${criterion}: `));
  assert.match(OPENING_ROLES["opening-writer"], new RegExp(`Ids c1…c${OPENING_CANDIDATES};`));
});

test("the brand brief gives the publication's voice in plain words and nothing about visuals or calls to action", () => {
  const brief = brandBrief({ ...profile, visualGuidance: "Screen-print look", callToActionStyle: "Follow us", conversionGoal: "follow" } as Parameters<typeof brandBrief>[0]);
  assert.equal(brief, [
    "# The publication",
    "- Name: Example Daily.",
    "- Language: write every reader-facing word in French; the article may be in another language.",
    "- Region: Montréal, Québec.",
    "- Platform: Instagram.",
    "- Audience: Parents who plan their weekend on Thursday.",
    "- Brand personality: warm, practical.",
    "- Tone: formality 30/100: conversational; humor 20/100: rarely; energy 70/100: lively; optimism 65/100: hopeful; provocation 60/100: direct, never insulting.",
  ].join("\n"));
  const sparse = brandBrief({ ...profile, region: "  ", brandPersonality: [], formality: 0, provocation: 100 });
  assert.ok(!sparse.includes("Region") && !sparse.includes("Brand personality"), "empty fields are left out");
  assert.match(sparse, /formality 1\/100: casual;.*provocation 100\/100: provocative, never insulting\./);
});
