import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sessions, users, workspaceMembers, workspaces } from "@/db/schema";
import { membershipIdentity, personalWorkspaceIdentity } from "./personal-workspace";

/** Safe to repeat after a partial write: Neon HTTP cannot wrap these statements in a transaction. */
export async function ensurePersonalWorkspace(userId: string, email: string) {
  const workspace = personalWorkspaceIdentity(userId, email);
  await db.insert(workspaces).values({ id: workspace.id, slug: workspace.slug,
    name: `${email.split("@")[0] || "Personal"}'s workspace` })
    .onConflictDoNothing({ target: workspaces.id });
  await db.insert(workspaceMembers).values({
    id: membershipIdentity(workspace.id, userId), workspaceId: workspace.id,
    userId, role: "owner",
  }).onConflictDoNothing({ target: [workspaceMembers.workspaceId, workspaceMembers.userId] });
  return workspace.id;
}

export async function ensureMembershipForUser(userId: string) {
  const existing = await db.select().from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId));
  if (existing.length) return existing;
  const [user] = await db.select({ email: users.email }).from(users)
    .where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("Authenticated user does not exist");
  await ensurePersonalWorkspace(userId, user.email);
  return db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, userId));
}

/** Preserve the seed owner's old content even if a personal workspace was created first. */
export async function chooseActiveWorkspace(userId: string, previousId?: string | null) {
  const memberships = await ensureMembershipForUser(userId);
  return memberships.find(member => member.workspaceId === previousId)?.workspaceId ??
    memberships.find(member => member.workspaceId === "default")?.workspaceId ??
    memberships[0]?.workspaceId ?? null;
}

export async function lastActiveWorkspace(userId: string) {
  const [session] = await db.select({ workspaceId: sessions.activeWorkspaceId })
    .from(sessions).where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.updatedAt)).limit(1);
  return session?.workspaceId ?? null;
}
