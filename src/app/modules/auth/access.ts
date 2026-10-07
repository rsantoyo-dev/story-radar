import "server-only";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { platformStaff, topics, workspaceMembers, workspaces } from "@/db/schema";

import { DEFAULT_WORKSPACE_ID } from "../topics/topic-catalog.repository";
import {
  hasRole,
  isAuthRequired,
  isBootstrapOwner,
  isWorkspaceRole,
  parseBootstrapEmails,
  personalWorkspaceFor,
  pickCurrentWorkspace,
  type WorkspaceRole,
} from "./access.core";
import { auth, AuthConfigError } from "./auth";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

export type UserWorkspace = { workspaceId: string; name: string; role: WorkspaceRole };

export class AccessDeniedError extends Error {
  constructor(message = "You do not have access to this.", readonly status: 401 | 403 = 403) {
    super(message);
  }
}

export function authRequired(): boolean {
  return isAuthRequired(process.env.AUTH_REQUIRED);
}

/**
 * For pages: the signed-in user, or undefined; when sign-in is misconfigured
 * on the server, the login page explains it instead of every page failing.
 */
export async function getPageSessionUser(): Promise<SessionUser | undefined> {
  let misconfigured = false;
  try {
    return await getSessionUser(await headers());
  } catch (error) {
    if (!(error instanceof AuthConfigError)) throw error;
    console.error(`Sign-in is not configured: ${error.message}`);
    misconfigured = true;
  }
  // redirect() throws; keep it outside the try.
  if (misconfigured) redirect("/login?error=config");
  return undefined;
}

/** The signed-in user for these request headers, or undefined. */
export async function getSessionUser(requestHeaders: Headers): Promise<SessionUser | undefined> {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) return undefined;
  const { id, email, name, emailVerified } = session.user;
  return { id, email, name, emailVerified: Boolean(emailVerified) };
}

/**
 * First verified sign-in of an email listed in AUTH_BOOTSTRAP_OWNER_EMAILS:
 * owner of the default workspace and platform staff. Idempotent.
 */
export async function ensureBootstrapAccess(user: SessionUser): Promise<void> {
  if (!isBootstrapOwner(user, parseBootstrapEmails(process.env.AUTH_BOOTSTRAP_OWNER_EMAILS))) return;
  await db.insert(workspaceMembers)
    .values({ workspaceId: DEFAULT_WORKSPACE_ID, userId: user.id, role: "owner" })
    .onConflictDoNothing();
  await db.insert(platformStaff).values({ userId: user.id }).onConflictDoNothing();
}

/**
 * A signed-in account with no workspace gets its own, empty one (owner), so a
 * new user starts Press Craftor from zero without seeing anyone else's data.
 * Idempotent: the workspace id is derived from the user id.
 */
export async function ensurePersonalWorkspace(user: SessionUser): Promise<UserWorkspace[]> {
  const memberships = await listUserWorkspaces(user.id);
  if (memberships.length) return memberships;
  const personal = personalWorkspaceFor(user);
  await db.insert(workspaces).values(personal).onConflictDoNothing();
  await db.insert(workspaceMembers).values({ workspaceId: personal.id, userId: user.id, role: "owner" }).onConflictDoNothing();
  return listUserWorkspaces(user.id);
}

/** Bootstrap, then the account's memberships (creating its own workspace when it has none). */
export async function resolveUserWorkspaces(user: SessionUser): Promise<UserWorkspace[]> {
  await ensureBootstrapAccess(user);
  return ensurePersonalWorkspace(user);
}

/** The workspace an account works in when nothing names one. */
export function currentWorkspace(memberships: readonly UserWorkspace[]): UserWorkspace | undefined {
  return pickCurrentWorkspace(memberships);
}

export async function isPlatformStaff(userId: string): Promise<boolean> {
  const [row] = await db.select({ userId: platformStaff.userId }).from(platformStaff)
    .where(eq(platformStaff.userId, userId)).limit(1);
  return Boolean(row);
}

export async function listUserWorkspaces(userId: string): Promise<UserWorkspace[]> {
  const rows = await db
    .select({ workspaceId: workspaceMembers.workspaceId, name: workspaces.name, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(workspaces.name);
  return rows.flatMap((row) => (isWorkspaceRole(row.role) ? [{ ...row, role: row.role }] : []));
}

export async function getWorkspaceRole(userId: string, workspaceId: string): Promise<WorkspaceRole | undefined> {
  const [row] = await db.select({ role: workspaceMembers.role }).from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId))).limit(1);
  return row && isWorkspaceRole(row.role) ? row.role : undefined;
}

/**
 * The user's role on a topic, through its workspace. Platform staff may act on
 * any topic for support. Throws AccessDeniedError below `minimum`; an unknown
 * topic is reported the same way, so ids cannot be probed.
 */
export async function requireTopicRole(
  user: SessionUser,
  topicId: string,
  minimum: WorkspaceRole,
): Promise<WorkspaceRole | "staff"> {
  // A malformed id never reaches the uuid column: it is simply not accessible.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(topicId)) throw new AccessDeniedError();
  const [row] = await db
    .select({ role: workspaceMembers.role })
    .from(topics)
    .innerJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, topics.workspaceId), eq(workspaceMembers.userId, user.id)))
    .where(eq(topics.id, topicId))
    .limit(1);
  const role = row && isWorkspaceRole(row.role) ? row.role : undefined;
  if (hasRole(role, minimum)) return role!;
  if (await isPlatformStaff(user.id)) return "staff";
  throw new AccessDeniedError();
}

/**
 * For server-rendered pages. When AUTH_REQUIRED is on: no session goes to
 * /login; a first sign-in gets its own workspace. When off, returns no user
 * and the page behaves as before.
 */
export async function requirePageAccess(returnPath = "/"): Promise<{ user?: SessionUser; workspaces: UserWorkspace[] }> {
  if (!authRequired()) return { workspaces: [] };
  const user = await getPageSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnPath)}`);
  const memberships = await resolveUserWorkspaces(user);
  if (!memberships.length && !(await isPlatformStaff(user.id))) redirect("/no-access");
  return { user, workspaces: memberships };
}

/**
 * A page scoped to one workspace: requirePageAccess, plus membership of that
 * workspace at `minimum` (platform staff passes for support).
 */
export async function requireWorkspacePageAccess(
  workspaceId: string,
  minimum: WorkspaceRole,
  returnPath = "/",
): Promise<{ user?: SessionUser; role?: WorkspaceRole | "staff" }> {
  const { user, workspaces: memberships } = await requirePageAccess(returnPath);
  if (!user) return {};
  const role = memberships.find((membership) => membership.workspaceId === workspaceId)?.role;
  if (hasRole(role, minimum)) return { user, role };
  if (await isPlatformStaff(user.id)) return { user, role: "staff" };
  redirect("/no-access");
}

/** A page about one topic: requirePageAccess plus a role on that topic. */
export async function requireTopicPageAccess(
  topicId: string,
  minimum: WorkspaceRole,
  returnPath: string,
): Promise<{ user?: SessionUser }> {
  const { user } = await requirePageAccess(returnPath);
  if (!user) return {};
  try {
    await requireTopicRole(user, topicId, minimum);
  } catch (error) {
    if (error instanceof AccessDeniedError) redirect("/no-access");
    throw error;
  }
  return { user };
}
