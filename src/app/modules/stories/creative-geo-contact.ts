/** Operational provider identity; never part of editorial policy or image prompts. */
export function parseGeoContact(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new Error("Geographic contact must be an email address");
  const email = value.trim();
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    throw new Error("Geographic contact must be a valid email address");
  }
  return email;
}

export function resolveGeoContact(profileContact?: string, fallback?: string): string {
  // A configured profile wins; never insert arbitrary header characters.
  const value = profileContact?.trim() || fallback?.trim();
  if (!value || /[\r\n]/.test(value)) return "";
  return value;
}
