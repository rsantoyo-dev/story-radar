// R2 lifecycle rules for the retention classes in
// src/app/modules/stories/r2-retention.ts. This file is the single source of
// the number of days; `npm run r2:lifecycle` applies it to the bucket.
//
// Each class is one rule on the literal prefix `<prefix>/retention/<class>/`.
// "permanent" has no rule. Rules whose ID does not start with RULE_ID_PREFIX
// (for example R2's default multipart-abort rule) are left untouched.

export const RULE_ID_PREFIX = "press-craftor-retention-";

/** Days an object is kept, per retention class that expires. */
export const RETENTION_DAYS = Object.freeze({ "7d": 7, "180d": 180 });

export function normalizeObjectPrefix(objectPrefix) {
  const normalized = String(objectPrefix ?? "").replace(/^\/+|\/+$/g, "");
  if (!normalized) throw new Error("CLOUDFLARE_R2_OBJECT_PREFIX is required");
  return normalized;
}

export function desiredLifecycleRules(objectPrefix) {
  const prefix = normalizeObjectPrefix(objectPrefix);
  return Object.entries(RETENTION_DAYS).map(([retention, days]) => ({
    ID: `${RULE_ID_PREFIX}${retention}`,
    Status: "Enabled",
    Filter: { Prefix: `${prefix}/retention/${retention}/` },
    Expiration: { Days: days },
  }));
}

/** Existing foreign rules first, then ours; a previous version of ours is replaced. */
export function mergeLifecycleRules(existingRules, objectPrefix) {
  const foreign = (existingRules ?? []).filter((rule) => !String(rule.ID ?? "").startsWith(RULE_ID_PREFIX));
  return [...foreign, ...desiredLifecycleRules(objectPrefix)];
}

/** Human-readable differences between the bucket's managed rules and the desired ones. */
export function describeLifecycleChanges(existingRules, objectPrefix) {
  const managed = new Map(
    (existingRules ?? [])
      .filter((rule) => String(rule.ID ?? "").startsWith(RULE_ID_PREFIX))
      .map((rule) => [rule.ID, rule]),
  );
  const changes = [];
  for (const rule of desiredLifecycleRules(objectPrefix)) {
    const current = managed.get(rule.ID);
    managed.delete(rule.ID);
    const summary = `${rule.Filter.Prefix} → delete after ${rule.Expiration.Days} days`;
    if (!current) changes.push(`add     ${summary}`);
    else if (
      current.Status !== rule.Status ||
      current.Filter?.Prefix !== rule.Filter.Prefix ||
      current.Expiration?.Days !== rule.Expiration.Days
    ) changes.push(`update  ${summary}`);
  }
  for (const id of managed.keys()) changes.push(`remove  ${id}`);
  return changes;
}
