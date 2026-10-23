import type { Draft2Fact } from "./draft2-facts.types";
import type { Draft2FocusSnapshot, Draft2FocusValues } from "./draft2-focus.types";

/** The v4 draft's fixtures (draft2-draft.types.test.ts, draft2-draft.test.ts): an arc with its spine, two facts and Opus's draft. */
export const FACTS: Draft2Fact[] = [
  { id: "f1", claim: "The program reviews product videos no longer than five minutes.", evidence: "reviews product videos \"no longer than five minutes\"", kind: "event", status: "established", importance: 90 },
  { id: "f2", claim: "A DOD official says awards took less than a week in several instances.", evidence: "A DOD official says awards took less than a week in several instances", kind: "event", status: "attributed", attribution: "A DOD official", importance: 80 },
];
const beat = (slide: string, role: string, factIds: string[], withholds = "What comes next.") => ({ slide, role, scene: "A founder at a laptop.", words: "Say the fact plainly.", image: "One laptop on a desk.", withholds, factIds });
/** An arc decided with its spine: one middle beat, so the deck has one slide, and a penultimate. */
export const FOCUS: Draft2FocusSnapshot = { version: 3, values: {
  line: { id: "55555555-5555-4555-8555-555555555555", revision: 2, name: "Actualidad", objective: "Recent defence AI news for founders who sell to government." },
  audience: "Founders who sell software to the Pentagon", framing: "reader-consequence",
  readerConsequence: { text: "A short product video can now open a Pentagon contract.", factIds: ["f1", "f2"] },
  structure: { kind: "arc", itemFactIds: [] }, goal: "followers",
  voice: { gravity: "ordinary", formality: 30, humor: 40, energy: 70, optimism: 60, provocation: 60 },
  direction: "Lead with the five-minute video; pay it with the award time.",
  spine: { beats: [beat("cover", "hook", ["f1"]), beat("slide2", "setup", ["f2"]), beat("middle", "turning-point", ["f1"]), beat("penultimate", "climax", ["f2"]), beat("last", "payoff", [], "")] },
} as unknown as Draft2FocusValues };

export const cover = (headline: string, lever = "free") => ({ headline, subheadline: "Product demos replace months of paperwork in a new buying program.", factIds: ["f1"], lever });
/** Opus's draft: three covers, slide 2, one middle slide, the penultimate and the last. */
export const answer = (patch: Record<string, unknown> = {}) => JSON.stringify({
  angle: "Speed over paperwork",
  covers: [cover("Pentagon buyers now judge five-minute videos"), cover("Your demo video is now the bid"), cover("Five minutes of video replaces the paperwork")],
  slide2: { headline: "Awards in under a week", body: "A DOD official says awards took less than a week in several instances.", factIds: ["f2"] },
  deck: { slides: [{ headline: "Reviewers watch the demo", body: "The program reviews product videos no longer than five minutes instead of reading binders.", practical: "", factIds: ["f1"] }] },
  closing: {
    penultimate: { headline: "Awards in days, not years", body: "Several awards came in under a week, a DOD official says.", factIds: ["f2"] },
    last: { headline: "Your next pitch is a video", body: "Record five minutes that show the product working.", cta: "Follow for the next defence buying change.", factIds: ["f1"] },
  },
  ...patch,
});

