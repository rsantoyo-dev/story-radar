import { createHash } from "node:crypto";

import { WORKSPACE_ROLES, type WorkspaceRole } from "../../../db/schema/workspace-roles";

export { WORKSPACE_ROLES, type WorkspaceRole };

const ROLE_RANK: Record<WorkspaceRole, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return (WORKSPACE_ROLES as readonly unknown[]).includes(value);
}

/** True when `role` grants at least what `minimum` grants. */
export function hasRole(role: WorkspaceRole | undefined, minimum: WorkspaceRole): boolean {
  return role !== undefined && ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/** The strongest of several roles (a user may reach a topic more than one way). */
export function strongestRole(roles: readonly WorkspaceRole[]): WorkspaceRole | undefined {
  return [...roles].sort((left, right) => ROLE_RANK[right] - ROLE_RANK[left])[0];
}

/**
 * AUTH_REQUIRED turns enforcement on. Off by default so a deployment without
 * Google or email configured does not lock everyone out.
 */
export function isAuthRequired(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

/**
 * AUTH_BOOTSTRAP_OWNER_EMAILS: comma- or space-separated emails that become
 * owner of the default workspace and platform staff on their first verified
 * sign-in. It is how the first account gets in; later members are invited.
 */
export function parseBootstrapEmails(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(/[\s,;]+/u)
      .map((email) => email.trim().toLowerCase())
      .filter((email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(email)),
  );
}

export function isBootstrapOwner(
  user: { email: string; emailVerified: boolean },
  bootstrapEmails: ReadonlySet<string>,
): boolean {
  return user.emailVerified && bootstrapEmails.has(user.email.trim().toLowerCase());
}

/**
 * What an API request needs on a topic when the route does not say: reading
 * is open to every member, any change needs an editor.
 */
export function minimumRoleForMethod(method: string): WorkspaceRole {
  return ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()) ? "viewer" : "editor";
}

/**
 * The workspace a member works in when a request does not name one: the
 * strongest membership, then alphabetical, so the choice is stable.
 */
export function pickCurrentWorkspace<T extends { workspaceId: string; name: string; role: WorkspaceRole }>(memberships: readonly T[]): T | undefined {
  return [...memberships].sort((left, right) =>
    ROLE_RANK[right.role] - ROLE_RANK[left.role] || left.name.localeCompare(right.name) || left.workspaceId.localeCompare(right.workspaceId),
  )[0];
}

/**
 * A new account's own workspace. Derived from the user id, so two first
 * requests racing each other create the same row instead of two workspaces.
 */
export function personalWorkspaceFor(user: { id: string; name?: string | null; email: string }): { id: string; slug: string; name: string } {
  const hash = createHash("sha256").update(`personal-workspace:${user.id}`).digest("hex");
  const owner = user.name?.trim() || user.email.split("@")[0] || "My";
  return { id: `ws_${hash.slice(0, 24)}`, slug: `personal-${hash.slice(0, 12)}`, name: `${owner}'s workspace`.slice(0, 80) };
}

/** Only same-origin paths are accepted as a post-login destination. */
export function safeReturnPath(value: string | string[] | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
  return path;
}
