/**
 * The schedule field of the publish confirmation, pure: the bounds a
 * datetime-local input offers (the browser's time zone) and how a scheduled
 * time reads. The server checks the same window (schedulePublishAt): at least
 * 5 minutes ahead, at most 6 days after the package was frozen, which is just
 * before the confirmation.
 */
const pad = (value: number) => String(value).padStart(2, "0");
/** A Date as a datetime-local value in the browser's time zone: YYYY-MM-DDTHH:mm. */
export const localInputValue = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** The earliest and latest times offered (10 minutes, to leave room for the confirmation, to 6 days ahead) and a suggestion: the next full hour at least an hour away. */
export function scheduleInputBounds(now: Date): { min: string; max: string; suggested: string } {
  const min = new Date(now.getTime() + 10 * 60_000);
  const max = new Date(now.getTime() + 6 * 24 * 60 * 60_000 - 60 * 60_000);
  const suggested = new Date(now.getTime() + 60 * 60_000);
  suggested.setMinutes(0, 0, 0);
  if (suggested.getTime() < now.getTime() + 60 * 60_000) suggested.setHours(suggested.getHours() + 1);
  return { min: localInputValue(min), max: localInputValue(max), suggested: localInputValue(suggested) };
}

/** A scheduled time as the editor reads it: "Tue, Oct 21, 9:00 AM", in the browser's locale and time zone. */
export const scheduleLabel = (iso: string, timeZone?: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) });
