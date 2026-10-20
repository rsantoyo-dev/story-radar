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
