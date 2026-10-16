import { comparableText } from "./draft2-facts.types";
import { funnelVersions, type FunnelRound } from "./draft2-funnel";
import type { CreativeBrandPaletteColor } from "../stories/creative-content.types";
import type { Draft2VisualCandidate, Draft2VisualIssue } from "./draft2-visual.types";

/**
 * Variety between posts. Every carousel was planned on its own, so a brand
 * whose guide says "the cover on terracotta, with the character" got the same
 * cover every time: Fogón Lab's last five covers were all terracotta with
 * Chispa. The Spine and the visual script now read the publication's last
 * covers (their background, whether the brand's character was on them, their
 * subject), the skills ask for variety, and the program checks two things: the
 * brand's character never on two covers in a row, and the cover's background
 * never the last cover's when the palette offers more than one. Everything
 * here is pure: the step code reads the rows.
 */
export type Draft2RecentCover = {
  /** When the carousel was made (its session's creation). */
  at: string;
  /** The cover's dominant subject, as its script named it. */
  subject: string;
  /** The brand's characters cast on the cover (their names; ids when the roster no longer has them). */
  characters: string[];
  /** The palette color the cover's background is, when its direction names one; absent otherwise. */
  background?: string;
};

/** A stored session as the variety reads it: its story, when it was made, its visual script run. */
export type Draft2CoverRow = { storyId: string; createdAt: string | Date; visual: { rounds: FunnelRound<Draft2VisualCandidate>[]; editorChoiceId?: string; winnerId?: string } | null };

/** How many of the publication's last covers the plan and the script read. */
export const RECENT_COVERS = 5;

const STOP = new Set(["de", "del", "la", "el", "los", "las", "para", "en", "y", "con", "of", "for", "and", "with", "the", "des", "du", "pour", "et", "avec", "le"]);
const NEVER_BACKGROUND = /(nunca|never|jamais|ni)\s+(de\s+|en\s+|as\s+(a\s+)?)?(fondo|background|fond)/iu;
const BACKGROUND_WORD = /(?:fondo|background|fond)\s+((?:[\p{L}]+\s*){1,3})/giu;
const plain = (value: string) => comparableText(value).normalize("NFD").replace(/\p{M}/gu, "");

/** The words that name a background after "fondo", "background" or "fond", up to two, stopping at a linking word: "fondo verde azulado de mecanismos" is "verde azulado". */
function backgroundPhrases(text: string): string[] {
  const phrases: string[] = [];
  for (const match of text.matchAll(BACKGROUND_WORD)) {
    const words: string[] = [];
    for (const word of match[1].trim().split(/\s+/)) {
      const clean = word.replace(/[^\p{L}]/gu, "");
      if (!clean || STOP.has(plain(clean))) break;
      words.push(clean);
      if (words.length === 2 || /[:;,.]$/.test(word)) break;
    }
    if (words.length) phrases.push(plain(words.join(" ")));
  }
  return phrases;
}

/**
 * The palette's background colors, each with the labels a direction may use
 * for it: its name, and what its usage calls it after "fondo" ("fondo crema:
 * páginas neutras" is crema). A color its usage keeps off backgrounds ("nunca
 * de fondo") is none.
 */
export function paletteBackgrounds(palette: readonly Pick<CreativeBrandPaletteColor, "name" | "usage">[]): { name: string; labels: string[] }[] {
  return palette.filter((color) => !NEVER_BACKGROUND.test(color.usage ?? "")).flatMap((color) => {
    const phrases = backgroundPhrases(color.usage ?? "");
    return phrases.length ? [{ name: color.name, labels: [...new Set([plain(color.name), ...phrases])] }] : [];
  });
}

/** The palette color a direction puts in the background: the one named right after "fondo" (or "background", "fond"), else the only one it names at all; undefined when it is unclear. */
export function coverBackground(direction: string, backgrounds: readonly { name: string; labels: string[] }[]): string | undefined {
  const text = plain(direction);
  const named = (fragment: string) => backgrounds.filter((color) => color.labels.some((label) => new RegExp(`(?:^|[^\\p{L}])${label}(?:$|[^\\p{L}])`, "u").test(fragment)));
  for (const phrase of backgroundPhrases(direction)) {
    const found = named(phrase);
    if (found.length === 1) return found[0].name;
  }
  const anywhere = named(text);
  return anywhere.length === 1 ? anywhere[0].name : undefined;
}

/** The publication's last covers, newest first: one per story (its latest session's chosen visual script), at most RECENT_COVERS. */
export function recentCovers(rows: readonly Draft2CoverRow[], { palette, roster }: { palette: readonly Pick<CreativeBrandPaletteColor, "name" | "usage">[]; roster: readonly { id: string; name: string }[] }): Draft2RecentCover[] {
  const backgrounds = paletteBackgrounds(palette);
  const seen = new Set<string>();
  const covers: Draft2RecentCover[] = [];
  for (const row of [...rows].sort((a, b) => String(new Date(b.createdAt).toISOString()).localeCompare(new Date(a.createdAt).toISOString()))) {
    if (seen.has(row.storyId) || !row.visual) continue;
    const chosenId = row.visual.editorChoiceId ?? row.visual.winnerId;
    const script = chosenId ? funnelVersions(row.visual.rounds).find((version) => version.candidate.id === chosenId)?.candidate : undefined;
    const cover = script?.slides.find((slide) => slide.slide === "cover");
    if (!cover) continue;
    seen.add(row.storyId);
    const background = coverBackground(cover.direction, backgrounds);
    covers.push({
      at: new Date(row.createdAt).toISOString(), subject: cover.subject ?? "",
      characters: cover.characterIds.map((id) => roster.find((character) => character.id === id)?.name ?? id),
      ...(background ? { background } : {}),
    });
    if (covers.length === RECENT_COVERS) break;
  }
  return covers;
}

/** The covers as the models read them: newest first, the background (or "unknown"), the brand's character on it or none, the subject. */
export const recentCoversForModels = (covers: readonly Draft2RecentCover[]) => covers.map(({ background, characters, subject }) => ({ background: background ?? "unknown", character: characters.length ? characters.join(", ") : "none", subject }));

/**
 * The program's variety findings on a script's cover, against the last
 * cover: the brand's character on two covers in a row (COVER_CHARACTER_STREAK;
 * not when the narrative form's guide is that character, who is on every
 * slide by design), and the last cover's background again when the palette
 * offers another one (COVER_BACKGROUND_REPEAT; only when both backgrounds are
 * clear from the directions).
 */
export function coverVarietyIssues(candidates: readonly Draft2VisualCandidate[], { recent, palette, characterAnchor }: {
  recent: readonly Draft2RecentCover[];
  palette: readonly Pick<CreativeBrandPaletteColor, "name" | "usage">[];
  characterAnchor?: string | null;
}): Draft2VisualIssue[] {
  const last = recent[0];
  if (!last) return [];
  const backgrounds = paletteBackgrounds(palette);
  const issues: Draft2VisualIssue[] = [];
  for (const candidate of candidates) {
    const cover = candidate.slides.find((slide) => slide.slide === "cover");
    if (!cover) continue;
    const cast = cover.characterIds.filter((id) => id !== characterAnchor);
    if (last.characters.length && cast.length) {
      issues.push({ code: "COVER_CHARACTER_STREAK", candidateId: candidate.id, part: "cover", detail: `The last cover had ${last.characters.join(" and ")}; the brand's character is on the cover at most every other post: leave it off this cover (it may react on another slide).` });
    }
    const background = coverBackground(cover.direction, backgrounds);
    if (backgrounds.length > 1 && background && last.background && background === last.background) {
      issues.push({ code: "COVER_BACKGROUND_REPEAT", candidateId: candidate.id, part: "cover", detail: `The last cover was on ${last.background} too; put this cover on another of the identity's backgrounds (${backgrounds.filter((color) => color.name !== background).map((color) => color.name).join(", ")}).` });
    }
  }
  return issues;
}
