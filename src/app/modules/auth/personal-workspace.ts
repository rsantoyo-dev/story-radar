import { createHash } from "node:crypto";

export function personalWorkspaceIdentity(userId: string, email: string) {
  const hash = createHash("sha256").update(userId).digest("hex").slice(0, 24);
  const localName = email.split("@")[0]?.normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 30) || "user";
  return { id: `personal-${hash}`, slug: `personal-${localName}-${hash.slice(0, 10)}` };
}

export function membershipIdentity(workspaceId: string, userId: string) {
  return `member-${createHash("sha256").update(`${workspaceId}:${userId}`).digest("hex").slice(0, 32)}`;
}
