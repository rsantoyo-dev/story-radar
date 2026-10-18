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

/**
 * The contact a workspace's brands use for Wikidata and Wikimedia Commons:
 * the one most of them saved (the newest-saved first on a tie), a valid email
 * only. Undefined when none has one.
 */
export function workspaceGeoContact(contacts: readonly string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const value of contacts) {
    try {
      const contact = parseGeoContact(value);
      if (contact) counts.set(contact, (counts.get(contact) ?? 0) + 1);
    } catch { /* an invalid contact is no one's */ }
  }
  let best: string | undefined;
  for (const [contact, count] of counts) if (!best || count > counts.get(best)!) best = contact;
  return best;
}

export function resolveGeoContact(profileContact?: string, fallback?: string): string {
  // A configured profile wins; never insert arbitrary header characters.
  const value = profileContact?.trim() || fallback?.trim();
  if (!value || /[\r\n]/.test(value)) return "";
  return value;
}
