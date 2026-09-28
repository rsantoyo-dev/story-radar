import type { EditorialPeriod } from "./modules/editorial-lines/editorial-lines";

export function isValidTimeZone(value: string): boolean {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
  catch { return false; }
}

export function periodError(value: EditorialPeriod): string {
  if (value.kind === "relative") return Number.isInteger(value.hours) && value.hours >= 1 && value.hours <= 87600 ? "" : "Enter a whole number of hours between 1 and 87,600.";
  if (value.kind === "any") return "";
  const validOffset = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;
  if (!validOffset.test(value.from) || !validOffset.test(value.to)) return "Enter both dates with a valid UTC offset.";
  const from = Date.parse(value.from), to = Date.parse(value.to);
  return Number.isFinite(from) && Number.isFinite(to) && from < to ? "" : "The end must be after the start.";
}

export function splitPeriodEndpoint(value: string): { dateTime: string; offset: string } {
  // Keep partial offsets intact while an editor enters a custom value.
  const match = value.match(/^(.*?)(Z|[+-][0-9:]*)$/);
  return { dateTime: match?.[1] ?? value, offset: match?.[2] ?? "Z" };
}

export function updatePeriodDateTime(value: string, next: string): string {
  return next ? `${next}:00${splitPeriodEndpoint(value).offset}` : "";
}

export function updatePeriodOffset(value: string, next: string): string {
  return `${splitPeriodEndpoint(value).dateTime}${next}`;
}
