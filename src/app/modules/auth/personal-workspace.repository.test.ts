import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { SQL, desc, eq } from "drizzle-orm";
import ts from "typescript";
import vm from "node:vm";
import { sessions, users, workspaceMembers, workspaces } from "@/db/schema";
import * as ids from "./personal-workspace";
import type * as service from "./personal-workspace.repository";

test("personal workspace creation is idempotent, repairs missing membership and preserves default ownership", async () => {
  const client = new PGlite();
  try {
    const database = drizzle(client);
    const dialect = new PgDialect();
    for (const table of [users, workspaces, workspaceMembers, sessions]) {
      const config = getTableConfig(table);
      const columns = config.columns.map(column => {
        const value = column.default instanceof SQL ? dialect.sqlToQuery(column.default).sql
          : column.default === undefined ? undefined : typeof column.default === "string" ? `'${column.default}'` : String(column.default);
        return `"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}${column.notNull ? " NOT NULL" : ""}${value ? ` DEFAULT ${value}` : ""}`;
      });
      await client.exec(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
      for (const check of config.checks) {
        await client.exec(`ALTER TABLE "${config.name}" ADD CONSTRAINT "${check.name}" CHECK (${dialect.sqlToQuery(check.value).sql})`);
      }
    }
    await client.exec(`CREATE UNIQUE INDEX workspace_slug_key ON workspaces(slug);
      CREATE UNIQUE INDEX member_pair_key ON workspace_members(workspace_id,user_id);
      ALTER TABLE workspace_members ADD CONSTRAINT member_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
      ALTER TABLE workspace_members ADD CONSTRAINT member_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;`);
    await database.insert(users).values({ id: "person-1", name: "Test", email: "TEST+demo@Example.com" });
    await database.insert(workspaces).values({ id: "default", slug: "default", name: "Original workspace" });
    const exports = {};
    const code = ts.transpileModule(readFileSync(new URL("./personal-workspace.repository.ts", import.meta.url), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, require: (path: string) => ({
      "server-only": {}, "drizzle-orm": { desc, eq },
      "@/db/client": { db: database }, "@/db/schema": { sessions, users, workspaces, workspaceMembers },
      "./personal-workspace": ids,
    } as Record<string, unknown>)[path] });
    const repo = exports as typeof service;
    const [first, second] = await Promise.all([
      repo.ensurePersonalWorkspace("person-1", "TEST+demo@Example.com"),
      repo.ensurePersonalWorkspace("person-1", "TEST+demo@Example.com"),
    ]);
    assert.equal(first, second);
    assert.equal((await database.select().from(workspaceMembers)).length, 1);
    assert.match((await database.select().from(workspaces))[1].slug, /^personal-[a-z0-9-]+$/);
    await database.delete(workspaceMembers);
    assert.equal((await repo.ensureMembershipForUser("person-1")).length, 1);
    await database.insert(workspaceMembers).values({ id: ids.membershipIdentity("default", "person-1"),
      workspaceId: "default", userId: "person-1", role: "owner" });
    assert.equal(await repo.chooseActiveWorkspace("person-1"), "default");
    await database.insert(sessions).values({ id: "session-1", userId: "person-1", token: "secret",
      expiresAt: new Date(Date.now() + 86_400_000), activeWorkspaceId: first });
    assert.equal(await repo.lastActiveWorkspace("person-1"), first);
    assert.equal(await repo.chooseActiveWorkspace("person-1", await repo.lastActiveWorkspace("person-1")), first);
    await database.delete(users);
    assert.equal((await database.select().from(workspaceMembers)).length, 0);
  } finally { await client.close(); }
});
