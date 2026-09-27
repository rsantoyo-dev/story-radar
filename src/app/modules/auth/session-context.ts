import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";

import { db } from "@/db/client";
import { sessions } from "@/db/schema";
import { getAuth, type AuthSessionSnapshot } from "./auth";
import { chooseActiveWorkspace, ensureMembershipForUser } from "./personal-workspace.repository";

export class WorkspaceAccessError extends Error {
  constructor(public readonly status: 401 | 403) {
    super(status === 401 ? "Authentication required" : "Workspace access denied");
  }
}

export const getSession = cache(async () => getAuth().api.getSession({ headers: await headers() }));

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export type WorkspaceContext = {
  userId: string;
  workspaceId: string;
  role: "owner" | "admin" | "member";
  actor: string;
};

/** Always rechecks DB session and membership; a signed cookie alone is not tenancy authority. */
export async function workspaceContextForSession(snapshot: AuthSessionSnapshot | null): Promise<WorkspaceContext> {
  if (!snapshot) throw new WorkspaceAccessError(401);
  const userId = snapshot.user.id;
  const [active] = await db.select({ workspaceId: sessions.activeWorkspaceId })
    .from(sessions).where(and(eq(sessions.id, snapshot.session.id),
      eq(sessions.userId, userId), gt(sessions.expiresAt, new Date()))).limit(1);
  if (!active) throw new WorkspaceAccessError(401);
  const memberships = await ensureMembershipForUser(userId);
  let member = memberships.find(row => row.workspaceId === active.workspaceId);
  if (!member) {
    const workspaceId = await chooseActiveWorkspace(userId, active.workspaceId);
    member = memberships.find(row => row.workspaceId === workspaceId);
    if (!member) throw new WorkspaceAccessError(403);
    await db.update(sessions).set({ activeWorkspaceId: member.workspaceId })
      .where(and(eq(sessions.id, snapshot.session.id), eq(sessions.userId, userId)));
  }
  return { userId, workspaceId: member.workspaceId,
    role: member.role as WorkspaceContext["role"], actor: `user:${userId}` };
}

export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
  return workspaceContextForSession(await requireSession());
}
