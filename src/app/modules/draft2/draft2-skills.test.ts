import assert from "node:assert/strict";
import test from "node:test";
import { brandBrief, composeInstructions, DRAFT2_ROLES, DRAFT2_SKILLS, type Draft2Skill } from "./skills/draft2-skills";
import { FACTS_ROLES, FACTS_SKILL } from "./skills/facts";
import { CLOSING_ROLES, CLOSINGS_SKILL } from "./skills/closings";
import { DECK_ROLES, DECKS_SKILL } from "./skills/decks";
import { VISUAL_ROLES, VISUALS_SKILL } from "./skills/visuals";
import { VISUAL_ACCEPT_SCORE, VISUAL_CRITERIA, VISUAL_CRITERION_FLOOR, VISUAL_DIRECTION_MAX_CHARACTERS, VISUAL_MAX_CHARACTERS_PER_SLIDE, VISUAL_NEEDS, VISUAL_SHOTS } from "./draft2-visual.types";
import { IMAGE_ROLES, IMAGES_SKILL } from "./skills/images";
import {
  DECK_ACCEPT_SCORE, DECK_ARC_MAX_SLIDES, DECK_ARC_MIN_SLIDES, DECK_BODY_MAX_WORDS, DECK_CRITERIA, DECK_CRITERION_FLOOR, DECK_HEADLINE_MAX_WORDS, DECK_ITEM_SENTENCE_MAX_WORDS,
  DECK_PRACTICAL_MAX_WORDS,
} from "./draft2-deck.types";
import { FOCUS_ROLES, FOCUS_SKILL } from "./skills/focus";
import { HOOKS_SKILL, OPENING_ROLES } from "./skills/hooks";
import { toneLine } from "./skills/tone";
import { FOCUS_FIELDS, FOCUS_FRAMINGS, FOCUS_GOALS, FOCUS_GRAVITIES, FOCUS_STRUCTURES } from "./draft2-focus.types";
import {
  CLOSING_ACCEPT_SCORE, CLOSING_CANDIDATES, CLOSING_CRITERIA, CLOSING_CRITERION_FLOOR, CTA_MAX_WORDS, LAST_BODY_MAX_WORDS, LAST_HEADLINE_MAX_WORDS, LAST_PLAN_BODY_MAX_WORDS,
  PENULTIMATE_BODY_MAX_WORDS, PENULTIMATE_HEADLINE_MAX_WORDS, callToActionBrief,
} from "./draft2-closing.types";
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
  assert.deepEqual(Object.keys(DRAFT2_ROLES).sort(), ["closing-judge", "closing-writer", "deck-judge", "deck-writer", "extractor", "focus-editor", "image-judge", "opening-judge", "opening-writer", "people-finder", "reviewer", "visual-judge", "visual-writer"]);
  assert.deepEqual(Object.values(DRAFT2_SKILLS).map((entry) => `${entry.name}@${entry.version}`), ["facts@1", "focus@1", "hooks@6", "closings@1", "decks@1", "visuals@2", "images@1"]);
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
  assert.match(OPENING_ROLES["opening-writer"], new RegExp(`ids c1…c${OPENING_CANDIDATES}\\.`));
});

test("hooks never trades a qualifier for a cleaner headline, lets gravity bound the voice, protects what a revision must keep, and tries new angles", () => {
  assert.match(HOOKS_SKILL.text, /Avoid\n  hedge words there too, but never by dropping a qualifier/);
  assert.match(HOOKS_SKILL.text, /When a claim\n  cannot stand without its qualifier or its source, do not headline it/);
  assert.doesNotMatch(HOOKS_SKILL.text, /never a hedge word\n  on the cover/, "the v1 rule that invited dropping \"could\" is gone");
  assert.match(HOOKS_SKILL.text, /- voice: the voice the focus sets \(its gravity and tone\)[^]*A grave story[^]*told straight/);
  assert.match(HOOKS_SKILL.text, /## Revisions\n[^]*A version that comes\s+out flatter, more bureaucratic or less clear is worse/);
  assert.match(HOOKS_SKILL.text, /the judge's own\s+proposals compete beside them, as the judge wrote them and as the writer\s+edited them/);
  assert.match(HOOKS_SKILL.text, /is a material error: it keeps an opening from winning,\s+however strong its hook/);
  assert.match(OPENING_ROLES["opening-judge"], /Mark an issue "material" when the opening states something the facts do not/);
  assert.match(HOOKS_SKILL.text, /Attribution lives here when a fact is attributed[^]*in the headline too when the headline states the attributed claim/);
  assert.match(HOOKS_SKILL.text, /A contrast between two facts is told as the two facts side by side[^]*never as a change \("shifted\s+from A to B"[^]*unless a\s+fact states the change/);
  assert.doesNotMatch(OPENING_ROLES["opening-judge"], /judge every candidate again/, "a revision round judges the revisions beside what they revise");
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
    "- Tone, the publication's defaults for an ordinary story (the story's gravity sets the ceiling): formality 30/100: conversational; humor 20/100: rarely; energy 70/100: lively; optimism 65/100: hopeful; provocation 60/100: direct, never insulting.",
  ].join("\n"));
  const sparse = brandBrief({ ...profile, region: "  ", brandPersonality: [], formality: 0, provocation: 100 });
  assert.ok(!sparse.includes("Region") && !sparse.includes("Brand personality"), "empty fields are left out");
  assert.match(sparse, /formality 1\/100: casual;.*provocation 100\/100: provocative, never insulting\./);
});

test("the openings follow the focus: framing, structure, goal and voice, scored as a criterion, guidance never evidence", () => {
  assert.match(HOOKS_SKILL.text, /## Focus\nEvery story arrives with its focus/);
  assert.match(HOOKS_SKILL.text, /framing "reader-consequence": the cover opens with the reader consequence/);
  assert.match(HOOKS_SKILL.text, /structure "list": the cover headline promises the list, with its count\n  \(the number of items the focus names, which counts as stated\)/);
  assert.match(HOOKS_SKILL.text, /It shapes the\n  promise, never the facts\./);
  assert.match(HOOKS_SKILL.text, /The reader consequence and the direction are guidance, not facts/);
  assert.match(OPENING_ROLES["opening-writer"], /following the story's focus/);
  assert.match(OPENING_ROLES["opening-judge"], /Judge against the verified facts and the story's focus you receive only; name an opening that departs from the focus in an OFF_FOCUS issue\./);
});

test("the focus skill names every field and value the contract accepts, and the editor's choices win", () => {
  for (const field of FOCUS_FIELDS) assert.match(FOCUS_SKILL.text, new RegExp(`\\n- ${field}: `), field);
  for (const value of [...FOCUS_FRAMINGS, ...FOCUS_STRUCTURES, ...FOCUS_GOALS, ...FOCUS_GRAVITIES]) assert.ok(FOCUS_SKILL.text.includes(`"${value}"`), value);
  assert.match(FOCUS_SKILL.text, /editorChoices are the editor's decisions\. Return each exactly as given/);
  assert.match(FOCUS_SKILL.text, /A famous name is not a reason/);
  const { instructions, skillVersions } = composeInstructions("focus-editor", [FOCUS_SKILL], brandBrief(profile));
  assert.ok(instructions.startsWith(FOCUS_ROLES["focus-editor"]));
  assert.ok(instructions.endsWith(`${toneLine(profile)}.`), "the brand brief, with the tone defaults, comes last");
  assert.deepEqual(skillVersions, { focus: "1" });
});

test("the closings rubric states the thresholds and limits the program enforces", () => {
  assert.match(CLOSINGS_SKILL.text, new RegExp(`## Penultimate slide\\n- Headline at most ${PENULTIMATE_HEADLINE_MAX_WORDS} words; body at most ${PENULTIMATE_BODY_MAX_WORDS} words\\.`));
  assert.match(CLOSINGS_SKILL.text, new RegExp(`## Last slide\\n- Headline at most ${LAST_HEADLINE_MAX_WORDS} words; body at most ${LAST_BODY_MAX_WORDS} words \\(${LAST_PLAN_BODY_MAX_WORDS} for the plan`));
  assert.match(CLOSINGS_SKILL.text, new RegExp(`cta: the one call to action, at most ${CTA_MAX_WORDS} words`));
  assert.match(CLOSINGS_SKILL.text, new RegExp(`overall ≥ ${CLOSING_ACCEPT_SCORE} and no criterion is below ${CLOSING_CRITERION_FLOOR}`));
  for (const criterion of CLOSING_CRITERIA) assert.match(CLOSINGS_SKILL.text, new RegExp(`\\n- ${criterion}: `), criterion);
  assert.match(CLOSING_ROLES["closing-writer"], new RegExp(`ids c1…c${CLOSING_CANDIDATES}\\.`));
});

test("closings: one action the goal decides and the publication words, a grave story may end without one, never a recap", () => {
  for (const goal of FOCUS_GOALS) assert.match(CLOSINGS_SKILL.text, new RegExp(`\\n- "${goal}": `), goal);
  assert.match(CLOSINGS_SKILL.text, /The focus's goal decides the action; the publication's call-to-action\s+style decides its voice and wording\. One action, never two\./);
  assert.match(CLOSINGS_SKILL.text, /A grave story \(the focus's gravity "grave"\) may end without one/);
  assert.match(CLOSINGS_SKILL.text, /Never a recap, a summary label/);
  assert.match(CLOSINGS_SKILL.text, /"two-slides", for an arc[^]*"one-slide", for a list or steps/);
  assert.match(CLOSING_ROLES["closing-judge"], /against the opening it ends, the story's focus and the verified facts you receive only/);
  assert.match(CLOSING_ROLES["closing-judge"], /OFF_GOAL issue/);
  const { instructions, skillVersions } = composeInstructions("closing-writer", [CLOSINGS_SKILL], `${brandBrief(profile)}\n\n${callToActionBrief({ style: "Warm.", emojis: 0 })}`);
  assert.ok(instructions.startsWith(CLOSING_ROLES["closing-writer"]));
  assert.ok(instructions.endsWith("# Calls to action\n- The publication's style (its voice and wording; the focus's goal decides the action): Warm.\n- Emojis: none."));
  assert.deepEqual(skillVersions, { closings: "1" });
});

test("the decks rubric states the shapes, limits and thresholds the program enforces", () => {
  assert.match(DECKS_SKILL.text, new RegExp(`"arc": the development of one story, in ${DECK_ARC_MIN_SLIDES} to ${DECK_ARC_MAX_SLIDES} slides`));
  assert.match(DECKS_SKILL.text, new RegExp(`- Headline at most ${DECK_HEADLINE_MAX_WORDS} words; body at most ${DECK_BODY_MAX_WORDS} words \\(${DECK_ITEM_SENTENCE_MAX_WORDS} for a list's item,\\s+whose practical line has at most ${DECK_PRACTICAL_MAX_WORDS} words of its own\\)`));
  assert.match(DECKS_SKILL.text, new RegExp(`overall ≥ ${DECK_ACCEPT_SCORE} and no criterion is below ${DECK_CRITERION_FLOOR}`));
  for (const criterion of DECK_CRITERIA) assert.match(DECKS_SKILL.text, new RegExp(`\\n- ${criterion}: `), criterion);
  assert.match(DECKS_SKILL.text, /"list": one slide per item in "items", in that order/);
  assert.match(DECKS_SKILL.text, /never\s+a recap or a summary label/);
  assert.match(DECK_ROLES["deck-writer"], /each a different path from slide 2 to the closing/);
  assert.match(DECK_ROLES["deck-judge"], /"part": "s1" for the first deck slide/);
  assert.deepEqual(composeInstructions("deck-judge", [DECKS_SKILL], brandBrief(profile)).skillVersions, { decks: "1" });
});

test("the visual scripts rubric states the limits and thresholds the program enforces, and v1's rules on people, places and characters", () => {
  assert.match(VISUALS_SKILL.text, new RegExp(`direction: one reproducible art-direction paragraph, at most ${VISUAL_DIRECTION_MAX_CHARACTERS}\\s+characters`));
  assert.match(VISUALS_SKILL.text, new RegExp(`at most\\s+${VISUAL_MAX_CHARACTERS_PER_SLIDE}\\)`));
  assert.match(VISUALS_SKILL.text, new RegExp(`overall ≥ ${VISUAL_ACCEPT_SCORE} and no criterion is below ${VISUAL_CRITERION_FLOOR}`));
  for (const criterion of VISUAL_CRITERIA) assert.match(VISUALS_SKILL.text, new RegExp(`\\n- ${criterion}: `), criterion);
  for (const need of VISUAL_NEEDS) assert.ok(VISUALS_SKILL.text.includes(`"${need}"`), need);
  assert.match(VISUALS_SKILL.text, /Real people are never drawn or generated/);
  assert.match(VISUALS_SKILL.text, /Never as a witness, a\s+source, an expert, a victim, a patient or a child/);
  assert.match(VISUALS_SKILL.text, /An image\s+never just repeats its slide's words/);
  assert.match(VISUAL_ROLES["people-finder"], /Use only names the facts state/);
  assert.match(VISUAL_ROLES["visual-judge"], /"part": the carousel's name for it/);
  for (const shot of VISUAL_SHOTS) assert.ok(VISUALS_SKILL.text.includes(`"${shot}"`), shot);
  assert.match(VISUALS_SKILL.text, /No two slides in a row share a shot/);
  assert.match(VISUALS_SKILL.text, /Never tell\s+it by resizing, recropping or moving the same subject/);
  assert.match(VISUALS_SKILL.text, /The image model letters each slide's words inside the image/);
  assert.match(VISUALS_SKILL.text, /is not a\s+reconstruction/);
  assert.match(VISUAL_ROLES["visual-judge"], /"REPETITIVE"/);
  assert.deepEqual(composeInstructions("visual-writer", [VISUALS_SKILL], brandBrief(profile)).skillVersions, { visuals: "2" });
  assert.deepEqual(composeInstructions("people-finder", [], brandBrief(profile)).skillVersions, {}, "the finder reads its role and the brand brief, no skill");
});

test("the image review rubric asks for the words as drawn, what covers them, the lettering and the story, beside v1's checks", () => {
  for (const field of ["transcription", "textCovered", "textNote", "storyNote"]) assert.match(IMAGES_SKILL.text, new RegExp(`\\n- ${field}: `), field);
  assert.match(IMAGES_SKILL.text, /Leave out the page\s+number and the publication's own logo/);
  assert.match(IMAGES_SKILL.text, /never blocks the image/);
  assert.match(IMAGE_ROLES["image-judge"], /from what is visible in the image only/);
  assert.deepEqual(composeInstructions("image-judge", [IMAGES_SKILL], brandBrief(profile)).skillVersions, { images: "1" });
});
