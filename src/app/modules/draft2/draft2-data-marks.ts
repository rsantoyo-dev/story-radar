import type { Draft2InventoryEntity } from "./draft2-inventory.types";

/**
 * The data the program marks in a slide's text (2026-10-18, Salut Brossard:
 * "SemiBold for dates, places and important data"): days, dates and times,
 * prices and "free", figures with their unit, and the story's places by the
 * names People and places found. They are marked ** as the editor marks
 * words, so the words' editor shows them and takes any off, and the words
 * themselves never change. French, English and Spanish, the brands' languages.
 * Pure.
 */

const DAYS = [
  "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo",
].join("|");
const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "setiembre", "octubre", "noviembre", "diciembre",
].join("|");
const UNITS = [
  "%", "°\\s?[CF]", "km/h", "km", "m²", "m", "cm", "mm", "kg", "g", "mg", "ml", "l",
  "ans?", "years?", "años?", "mois", "months?", "meses", "mes", "semaines?", "weeks?", "semanas?", "jours?", "days?", "días?",
  "heures?", "hours?", "horas?", "minutes?", "minutos?", "min",
  "mètres?", "metres?", "meters?", "metros?", "kilomètres?", "kilometres?", "kilometers?", "kilómetros?",
  "personnes?", "people", "personas?",
].join("|");

/** Nothing of a word or a number just before or after: a mark never starts or ends inside one. */
const BEFORE = "(?<![\\p{L}\\p{N}])";
const AFTER = "(?![\\p{L}\\p{N}])";
/** A number: thousands spaced ("4 000"), or with decimals ("42,75"). */
const NUMBER = "(?:\\d{1,3}(?:[\\u00a0\\u202f ]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?)";
const DAY_NUMBER = "\\d{1,2}(?:er|st|nd|rd|th)?";
/** Between the two ends of a range: "16 au 18", "15 h à 18 h", "6 to 12". */
const RANGE = "\\s*(?:au|à|a|al|to|et|and|y|-|–|—)\\s*";
const TIME = "(?:\\d{1,2}\\s?h(?:\\s?\\d{2})?|\\d{1,2}:\\d{2}(?:\\s?[ap]\\.?m\\.?)?|\\d{1,2}\\s?[ap]\\.?m\\.?)";

const DATA = new RegExp(`${BEFORE}(?:${[
  // "vendredi 16 octobre 2026", "16 au 18 octobre", "21 de octubre de 2026"
  `(?:(?:${DAYS}),?\\s+)?${DAY_NUMBER}(?:${RANGE}${DAY_NUMBER})?\\s+(?:de\\s+)?(?:${MONTHS})(?:\\s+(?:de\\s+)?\\d{4})?`,
  // "Saturday, October 21, 2026"
  `(?:(?:${DAYS}),?\\s+)?(?:${MONTHS})\\s+${DAY_NUMBER}(?:${RANGE}${DAY_NUMBER})?(?:,?\\s+\\d{4})?`,
  // "octobre 2026"
  `(?:${MONTHS})\\s+(?:de\\s+)?\\d{4}`,
  `(?:${DAYS})`,
  // "15 h à 18 h", "18 h 30", "9:30 a.m."
  `${TIME}(?:${RANGE}${TIME})?`,
  // "64 $", "$64", "42,75 $", "free"
  `(?:[$€£]\\s?${NUMBER}|${NUMBER}\\s?(?:[$€£]|CAD|USD|EUR|MXN|COP))`,
  "gratuite?s?|gratuit[oa]s?|gratis",
  // "91 °C", "40 %", "6 à 12 ans", "9 mètres"
  `${NUMBER}(?:${RANGE}${NUMBER})?\\s?(?:${UNITS})`,
].join("|")})${AFTER}`, "giu");

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/['’]/gu, "['’]");

/** A month's number from its name in any of the three languages (1–12), or undefined. */
export function monthNumber(name: string): number | undefined {
  const key = name.toLowerCase();
  const lists = [
    ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"],
    ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  ];
  if (key === "setiembre") return 9;
  for (const list of lists) { const at = list.indexOf(key); if (at >= 0) return at + 1; }
  return undefined;
}

export type Draft2DayDate = { day: number; month: number };

/**
 * The calendar days a text names, month by month: "du 23 au 25 octobre" is
 * three days, "les 17, 24 et 31 octobre" three, "samedi 24 octobre" one, in
 * the three languages ("October 24", "24 de octubre"). A month without a day
 * ("octobre 2026") names none. (2026-10-22: a list's slide named dates
 * outside the weekend the story announced.)
 */
export function dayDatesIn(text: string): Draft2DayDate[] {
  const dates: Draft2DayDate[] = [];
  const seen = new Set<string>();
  const push = (day: number, month: number) => { const key = `${month}-${day}`; if (day >= 1 && day <= 31 && !seen.has(key)) { seen.add(key); dates.push({ day, month }); } };
  const range = (from: number, to: number, month: number) => { if (to >= from && to - from <= 31) for (let day = from; day <= to; day += 1) push(day, month); else { push(from, month); push(to, month); } };
  // Days before the month: a list and ranges of day numbers ("17, 24 et 31", "23 au 25", "vendredi 16"), then the month.
  // A day is a whole one- or two-digit number: never the "20" of "2026".
  const DAY = `(?<!\\d)${DAY_NUMBER}(?!\\d)`;
  const before = new RegExp(`((?:${DAY}(?:${RANGE}${DAY})?(?:\\s*(?:,|et|and|y|&)\\s*)?)+)\\s+(?:de\\s+)?(${MONTHS})(?![\\p{L}])`, "giu");
  for (const match of text.matchAll(before)) {
    const month = monthNumber(match[2]); if (!month) continue;
    for (const part of match[1].split(/\s*(?:,|et|and|y|&)\s*/u).map((entry) => entry.trim()).filter(Boolean)) {
      const bounds = part.match(/\d{1,2}/gu)?.map(Number) ?? [];
      if (bounds.length >= 2) range(bounds[0], bounds[1], month); else if (bounds.length === 1) push(bounds[0], month);
    }
  }
  // The month before the days: "October 24", "October 24–25", "October 17, 24 and 31".
  const after = new RegExp(`(?<![\\p{L}])(${MONTHS})\\s+((?:${DAY}(?:${RANGE}${DAY})?(?:\\s*(?:,|et|and|y|&)\\s*)?)+)(?!\\s?h\\b|:)`, "giu");
  for (const match of text.matchAll(after)) {
    const month = monthNumber(match[1]); if (!month) continue;
    for (const part of match[2].split(/\s*(?:,|et|and|y|&)\s*/u).map((entry) => entry.trim()).filter(Boolean)) {
      const bounds = part.match(/\d{1,2}/gu)?.map(Number) ?? [];
      if (bounds.length >= 2) range(bounds[0], bounds[1], month); else if (bounds.length === 1) push(bounds[0], month);
    }
  }
  return dates;
}

export type Draft2DayPeriod = { month: number; from: number; to: number };

/**
 * The period a text announces: its days when they fall in one month and span
 * a week at most ("du 23 au 25 octobre 2026"); undefined otherwise, so a
 * check never rests on a period it is not sure of.
 */
export function dayPeriodIn(text: string): Draft2DayPeriod | undefined {
  const dates = dayDatesIn(text);
  if (!dates.length || dates.some((date) => date.month !== dates[0].month)) return undefined;
  const days = dates.map((date) => date.day);
  const from = Math.min(...days), to = Math.max(...days);
  return to - from <= 7 ? { month: dates[0].month, from, to } : undefined;
}

/** The days a text names outside a period, as "17 octobre" in the text's own month name. */
export function daysOutsidePeriod(text: string, period: Draft2DayPeriod): Draft2DayDate[] {
  return dayDatesIn(text).filter((date) => date.month !== period.month || date.day < period.from || date.day > period.to);
}

/** The story's places, by the names People and places found, without the brand's own city (its region's names): it is in every post. */
export function storyPlaces(entities: readonly Pick<Draft2InventoryEntity, "name" | "kind">[], region?: string | null): string[] {
  const home = new Set((region ?? "").split(",").map((part) => part.trim().toLocaleLowerCase()).filter(Boolean));
  const names = entities.filter((entity) => entity.kind === "place").map((entity) => entity.name.trim()).filter((name) => [...name].length >= 3 && !home.has(name.toLocaleLowerCase()));
  return [...new Set(names)];
}

/** The text with its data marked **, the words as they are; the same text when it has none (or already carries a mark). */
export function markData(text: string, places: readonly string[] = []): string {
  if (text.includes("*")) return text;
  const spans: [number, number][] = [];
  for (const match of text.matchAll(DATA)) spans.push([match.index, match.index + match[0].length]);
  for (const place of places) {
    for (const match of text.matchAll(new RegExp(`${BEFORE}${escape(place)}${AFTER}`, "giu"))) spans.push([match.index, match.index + match[0].length]);
  }
  if (!spans.length) return text;
  // Overlapping or touching marks become one, so no "****" between them.
  spans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: [number, number][] = [];
  for (const [start, end] of spans) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  let out = "";
  let at = 0;
  for (const [start, end] of merged) {
    out += `${text.slice(at, start)}**${text.slice(start, end)}**`;
    at = end;
  }
  return out + text.slice(at);
}
