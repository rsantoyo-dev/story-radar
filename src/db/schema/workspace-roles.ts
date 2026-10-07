/**
 * Roles inside a workspace (the customer account that owns Topics and pays).
 * owner: billing and members · admin: members and settings · editor: creates
 * and publishes · viewer: read only. Kept free of imports so browser and test
 * code can use it.
 */
export const WORKSPACE_ROLES = ["owner", "admin", "editor", "viewer"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
