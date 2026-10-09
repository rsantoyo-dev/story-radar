import type { CreativeKeyFact, GeneratedCreativeBrief } from "./creative-content.types";

import { LIST_CLOSING_MAX_FACTS, maximumFactsForGoal } from "./carousel-narrative";
import { withCreativeFactClaimGuard } from "./creative-fact-guard";

/**
 * A list item's practical details (day, time, price, ages, place) often sit in
 * their own labelled block ("Date : …", "Heure : …", "Coût : …") a few
 * paragraphs below the sentence that names the item. A fact cites one
 * contiguous excerpt, so a brief built on the naming sentence loses them and
 * the slide can only say "Sunday morning". This was seen in October 2026, on a
 * Saint-Jean weekend list where every time, price and age range was dropped.
 *
 * This module finds that block, copies it verbatim, and gives it to the item's
 * slide as a fact of its own. The list's closing gets the same facts, so it can
 * lay out the plan for the period.
 *
 * Only one layout is handled: each block follows its item's sentence. When a
 * labelled block precedes the first item, blocks may precede their items, and
 * attributing them could give one item another item's times. In that case
 * nothing is added, and the brief rules ask the model to extract the blocks
 * itself.
 */

const LABELLED_LINE = /^[ \t]*([\p{L}][\p{L}\p{M}'’ .()-]{0,40}?)[ \t]*:[ \t]*(?!\/\/)(\S.*)$/u;
const PRACTICAL_LABEL = /\b(?:dates?|jours?|heures?|horaires?|duree|lieux?|adresse|couts?|tarifs?|prix|billet(?:s|terie)?|acces|public|ages?|inscriptions?|reservations?|days?|times?|hours|when|where|location|venue|address|costs?|prices?|admission|tickets?|registration|duration|fechas?|dias?|horas?|horarios?|lugar|direccion|costos?|precios?|entrada|boletos|edad(?:es)?|inscripcion|duracion)\b/u;
const PRACTICAL_VALUE = /\d|\b(?:gratuit|gratuite|free|gratis)\b/iu;
/** A fact statement holds at most 500 characters. */
const MAX_BLOCK_CHARACTERS = 500;

type Block = { start: number; end: number };

const normalizedLabel = (label: string) =>
  label.normalize("NFKD").replace(/[̀-ͯ]/gu, "").toLowerCase();

/** Runs of labelled lines (at most one blank line apart) that carry practical details. */
export function practicalBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let run: { start: number; end: number; label: string; value: string }[] = [];
  let blanks = 0;
  const flush = () => {
    const practical = run.some((line) => PRACTICAL_LABEL.test(normalizedLabel(line.label)));
    if (practical && (run.length >= 2 || PRACTICAL_VALUE.test(run[0]!.value))) {
      // Whole lines only, within the statement limit.
      const kept = run.filter((line) => line.end - run[0]!.start <= MAX_BLOCK_CHARACTERS);
      if (kept.length) blocks.push({ start: kept[0]!.start, end: kept.at(-1)!.end });
    }
    run = [];
  };
  let offset = 0;
  for (const text of source.split("\n")) {
    const start = offset;
    offset += text.length + 1;
    if (!text.trim()) {
      blanks += 1;
      if (blanks > 1 && run.length) flush();
      continue;
    }
    const match = LABELLED_LINE.exec(text);
    if (match) {
      run.push({ start: start + (text.length - text.trimStart().length), end: start + text.trimEnd().length, label: match[1]!, value: match[2]! });
    } else if (run.length) {
      flush();
    }
    blanks = 0;
  }
  if (run.length) flush();
  return blocks;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** Where an excerpt starts in the source, tolerating line breaks and apostrophe styles. */
function excerptPosition(source: string, excerpt: string): number {
  const exact = source.indexOf(excerpt);
  if (exact >= 0) return exact;
  const words = excerpt.trim().split(/\s+/u).filter(Boolean);
  if (!words.length) return -1;
  const pattern = words.map((word) => escapeRegExp(word).replace(/['’]/gu, "['’]")).join("\\s+");
  return new RegExp(pattern, "u").exec(source)?.index ?? -1;
}

const comparable = (value: string) => value.replace(/\s+/gu, " ").trim();

/**
 * Gives each item slide of a list its labelled practical block as a fact, and
 * the closing those facts. Idempotent: a block already extracted, by the model
 * or by an earlier pass, is reused, never duplicated.
 */
export function attachListPracticalFacts(
  brief: GeneratedCreativeBrief,
  sourceText: string,
  maxFacts: number,
): GeneratedCreativeBrief {
  const plan = brief.carouselPlan;
  if (plan?.structure !== "list" || plan.slides.length < 4) return brief;
  const blocks = practicalBlocks(sourceText);
  if (!blocks.length) return brief;
  const facts: CreativeKeyFact[] = [...brief.keyFacts];
  const factsById = new Map(facts.map((fact) => [fact.id, fact] as const));
  const last = plan.slides.length - 1;
  const slides = plan.slides.map((slide) => ({ ...slide, allowedFactIds: [...slide.allowedFactIds] }));
  // Items follow the source order, so each one is anchored at its first fact
  // after the previous item's anchor: a fact about the whole period (a
  // forecast stated before the list) never pulls an item back to the top.
  const items: { index: number; anchor: number }[] = [];
  slides.forEach((slide, index) => {
    if (index === 0 || index === last) return;
    const previous = items.at(-1)?.anchor ?? -1;
    const anchor = slide.allowedFactIds
      .map((id) => factsById.get(id)?.sourceExcerpt?.trim())
      .filter((excerpt): excerpt is string => Boolean(excerpt))
      .map((excerpt) => excerptPosition(sourceText, excerpt))
      .filter((position) => position > previous)
      .sort((left, right) => left - right)[0];
    if (anchor !== undefined) items.push({ index, anchor });
  });
  if (items.length < 2) return brief;
  // A block before the first item: blocks may precede their items. Never guess.
  if (blocks.some((block) => block.end <= items[0]!.anchor)) return brief;

  // The last item has no next item to bound it: a block much further away than
  // the others' belongs to something else (a footer, a source note).
  const gaps: number[] = [];
  const found = items.map((item, position) => {
    const next = items[position + 1]?.anchor;
    const block = blocks.find((candidate) => candidate.start >= item.anchor && (next === undefined || candidate.end <= next));
    if (block && next !== undefined) gaps.push(block.start - item.anchor);
    return block;
  });
  const lastGapLimit = Math.max(1_500, 2 * Math.max(0, ...gaps));

  const practicalIds: string[] = [];
  items.forEach((item, position) => {
    const block = found[position];
    if (!block || (position === items.length - 1 && block.start - item.anchor > lastGapLimit)) return;
    const excerpt = sourceText.slice(block.start, block.end);
    const slide = slides[item.index]!;
    const existing = facts.find((fact) => fact.sourceExcerpt && comparable(fact.sourceExcerpt) === comparable(excerpt));
    if (!existing || !slide.allowedFactIds.includes(existing.id)) {
      // An item worth a time and a price is one the reader can do.
      const room = (goal: typeof slide.editorialGoal) => slide.allowedFactIds.length < maximumFactsForGoal(goal);
      if (!room(slide.editorialGoal)) {
        if (slide.editorialGoal !== "explain" || !room("opportunity")) return;
        slide.editorialGoal = "opportunity";
      }
    }
    let id = existing?.id;
    if (!id) {
      if (facts.length >= maxFacts) return;
      id = `fact-${facts.length + 1}`;
      if (factsById.has(id)) return;
      const fact = withCreativeFactClaimGuard({ id, statement: comparable(excerpt), sourceExcerpt: excerpt });
      facts.push(fact);
      factsById.set(id, fact);
    }
    if (!slide.allowedFactIds.includes(id)) slide.allowedFactIds.push(id);
    practicalIds.push(id);
  });
  if (!practicalIds.length) return brief;

  const closing = slides[last]!;
  if (closing.editorialGoal === "conclude" && practicalIds.length >= 2) {
    // A fact appears on at most two slides: one already on the cover and its
    // item stays off the closing.
    const usage = new Map<string, number>();
    slides.slice(0, last).forEach((slide) => new Set(slide.allowedFactIds).forEach((id) => usage.set(id, (usage.get(id) ?? 0) + 1)));
    const eligible = practicalIds.filter((id) => (usage.get(id) ?? 0) < 2);
    closing.allowedFactIds = [...new Set([...eligible, ...closing.allowedFactIds])].slice(0, LIST_CLOSING_MAX_FACTS);
  }
  return { ...brief, keyFacts: facts, carouselPlan: { ...plan, slides } };
}
