import type { Metadata } from "next";

import { currentWorkspace, requirePageAccess, requireWorkspacePageAccess } from "@/app/modules/auth/access";

import { ActivityConsole } from "./activity-console";

export const metadata: Metadata = { title: "Activity · Press Craftor" };

/** Owners and admins: every request, action and data change in the workspace. Data loads client-side. */
export default async function ActivityPage() {
  const { user, workspaces } = await requirePageAccess("/activity");
  if (user) {
    const workspace = currentWorkspace(workspaces);
    if (workspace) await requireWorkspacePageAccess(workspace.workspaceId, "admin", "/activity");
    else await requireWorkspacePageAccess("", "admin", "/activity");
  }
  return <ActivityConsole signedIn={Boolean(user)} />;
}
