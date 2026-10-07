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

/** Only same-origin paths are accepted as a post-login destination. */
export function safeReturnPath(value: string | string[] | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
  return path;
}
