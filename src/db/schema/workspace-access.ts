import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { workspaces } from "./workspaces";

export { WORKSPACE_ROLES, type WorkspaceRole } from "./workspace-roles";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
};

/** A user's role in one workspace. */
export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index("workspace_members_user_idx").on(table.userId),
    check(
      "workspace_members_role_check",
      sql`${table.role} IN ('owner', 'admin', 'editor', 'viewer')`,
    ),
  ],
);

/**
 * An emailed invitation to join a workspace with a role. Only a hash of the
 * token is stored; emails are stored lowercase. Accepted and revoked
 * invitations are kept as history.
 */
export const workspaceInvitations = pgTable(
  "workspace_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedByUserId: text("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" }),
    acceptedByUserId: text("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("workspace_invitations_token_hash_unique").on(table.tokenHash),
    index("workspace_invitations_workspace_email_idx").on(table.workspaceId, table.email),
    check(
      "workspace_invitations_role_check",
      sql`${table.role} IN ('admin', 'editor', 'viewer')`,
    ),
    check(
      "workspace_invitations_email_lowercase_check",
      sql`${table.email} = lower(${table.email})`,
    ),
  ],
);

/** Press Craftor staff: internal admin, support and refunds across workspaces. */
export const platformStaff = pgTable("platform_staff", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type WorkspaceInvitation = typeof workspaceInvitations.$inferSelect;
