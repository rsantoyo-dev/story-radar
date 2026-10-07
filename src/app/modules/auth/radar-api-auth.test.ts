import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import * as core from "./access.core";

const requireLocal = createRequire(import.meta.url);
const SECRET = "operator-secret";
const DEFAULT_TOPIC = "11111111-1111-4111-8111-111111111111";
const OTHER_TOPIC = "22222222-2222-4222-8222-222222222222";
const SHARED_TOPIC = "33333333-3333-4333-8333-333333333333";

type Member = { id: string; email: string; memberships: { workspaceId: string; name: string; role: core.WorkspaceRole }[]; staff?: boolean };

class TopicContextError extends Error {}

function load(sessionUser?: Member) {
  const code = ts.transpileModule(readFileSync(new URL("../../api/radar/radar-api-auth.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const topics: Record<string, { id: string; workspaceId: string; isActive: boolean }> = {
    [DEFAULT_TOPIC]: { id: DEFAULT_TOPIC, workspaceId: "default", isActive: true },
    [OTHER_TOPIC]: { id: OTHER_TOPIC, workspaceId: "ws_other", isActive: true },
    [SHARED_TOPIC]: { id: SHARED_TOPIC, workspaceId: "ws_team", isActive: true },
  };
  const access = {
    authRequired: () => true,
    getSessionUser: async () => sessionUser ? { id: sessionUser.id, email: sessionUser.email, name: "", emailVerified: true } : undefined,
    resolveUserWorkspaces: async () => sessionUser?.memberships ?? [],
    currentWorkspace: core.pickCurrentWorkspace,
    isPlatformStaff: async () => Boolean(sessionUser?.staff),
    getWorkspaceRole: async (_userId: string, workspaceId: string) => sessionUser?.memberships.find((membership) => membership.workspaceId === workspaceId)?.role,
  };
  const exports: Record<string, unknown> = {};
  runInNewContext(code, {
    exports, URL, Response, Headers, process: { env: { RADAR_COLLECTOR_SECRET: SECRET } },
    require: (name: string) => {
      if (name === "server-only") return {};
      if (name === "next/server") return requireLocal("next/server");
      if (name === "@/app/modules/auth/access") return access;
      if (name === "@/app/modules/auth/access.core") return core;
      if (name === "@/app/modules/topics/topic-catalog.repository") return { DEFAULT_WORKSPACE_ID: "default", getTopicById: async (id: string) => topics[id] };
      if (name === "@/app/modules/topics/topic-context") return { TopicContextError };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return exports as unknown as typeof import("../../api/radar/radar-api-auth");
}

const request = (path: string, method = "GET", bearer?: string) =>
  new Request(`http://localhost${path}`, { method, headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
const status = async (response: Promise<Response | undefined>) => (await response)?.status ?? 200;

const viewer: Member = { id: "u1", email: "viewer@example.com", memberships: [{ workspaceId: "ws_team", name: "Team", role: "viewer" }] };
const owner: Member = { id: "u2", email: "owner@example.com", memberships: [{ workspaceId: "ws_team", name: "Team", role: "owner" }] };
const twoWorkspaces: Member = { id: "u3", email: "both@example.com", memberships: [
  { workspaceId: "ws_mine", name: "Mine", role: "owner" },
  { workspaceId: "ws_team", name: "Team", role: "editor" },
] };
const staff: Member = { id: "u4", email: "support@example.com", memberships: [{ workspaceId: "default", name: "Press Craftor", role: "owner" }], staff: true };

describe("API authorization", () => {
  it("lets the shared secret operate the default workspace only", async () => {
    const api = load();
    const operator = request(`/api/radar?topicId=${DEFAULT_TOPIC}`, "POST", SECRET);
    assert.equal(await status(api.authorizeRadarCollector(operator)), 200);
    assert.equal(api.requestWorkspaceId(operator), "default");
    assert.equal(await status(api.authorizeRadarCollector(request(`/api/radar/topics/${OTHER_TOPIC}/sources`, "GET", SECRET))), 404);
  });

  it("refuses a request with neither the secret nor a session", async () => {
    assert.equal(await status(load().authorizeRadarCollector(request("/api/radar/topics"))), 401);
    assert.equal(await status(load().authorizeRadarCollector(request("/api/radar/topics", "GET", "wrong"))), 401);
  });

  it("lets a viewer read its topic but not change it, and hides other workspaces' topics", async () => {
    const api = load(viewer);
    assert.equal(await status(api.authorizeRadarCollector(request(`/api/radar/topics/${SHARED_TOPIC}/sources`))), 200);
    assert.equal(await status(api.authorizeRadarCollector(request(`/api/radar/topics/${SHARED_TOPIC}/sources`, "POST"))), 403);
    assert.equal(await status(api.authorizeRadarCollector(request(`/api/radar?topicId=${OTHER_TOPIC}`))), 404);
    assert.equal(await status(api.authorizeRadarCollector(request("/api/radar/topics", "POST"))), 403, "workspace-level changes need an editor");
  });

  it("uses the session when a stale or wrong secret is sent", async () => {
    const api = load(owner);
    const signedIn = request(`/api/radar?topicId=${SHARED_TOPIC}`, "POST", "stale-secret");
    assert.equal(await status(api.authorizeRadarCollector(signedIn)), 200);
    assert.equal(api.requestWorkspaceId(signedIn), "ws_team");
  });

  it("works in the strongest workspace and keeps roles per workspace", async () => {
    const api = load(twoWorkspaces);
    const listing = request("/api/radar/topics");
    assert.equal(await status(api.authorizeRadarCollector(listing)), 200);
    assert.equal(api.requestWorkspaceId(listing), "ws_mine");
    assert.equal(await status(api.authorizeRadarCollector(request(`/api/radar/topics/${SHARED_TOPIC}/sources`, "PATCH"))), 200, "editor on the team workspace");
    assert.equal(await status(api.authorizeRadarCollector(request(`/api/radar?topicId=${SHARED_TOPIC}`, "DELETE"), "admin")), 403, "not an admin there");
  });

  it("requires the named role on workspace routes", async () => {
    assert.equal(await status(load(owner).authorizeRadarCollector(request("/api/radar/topics", "POST"), "admin")), 200);
    assert.equal(await status(load(viewer).authorizeRadarCollector(request("/api/radar/credits/reset", "POST"), "admin")), 403);
  });

  it("lets platform staff support any topic", async () => {
    const api = load(staff);
    assert.equal(await status(api.authorizeRadarCollector(request(`/api/radar/topics/${OTHER_TOPIC}/sources`, "POST"))), 200);
    const signedIn = request("/api/radar/credits/reset", "POST");
    await api.authorizeRadarCollector(signedIn);
    assert.equal(api.requestIsOperator(signedIn), true);
  });

  it("resolves a topic from the body with the same rules", async () => {
    const api = load(viewer);
    const post = request("/api/radar/sources/rss", "POST");
    await api.authorizeRadarCollector(post);
    await assert.rejects(api.requireTopicForRequest(post, SHARED_TOPIC), (error: { status?: number }) => error.status === 403);
    await assert.rejects(api.requireTopicForRequest(post, OTHER_TOPIC), (error: { status?: number }) => error.status === 404);
    await assert.rejects(api.requireTopicForRequest(post, "not-a-uuid"), (error: { status?: number }) => error.status === 404);
    const read = request("/api/radar/sources");
    await api.authorizeRadarCollector(read);
    assert.equal((await api.requireTopicForRequest(read, SHARED_TOPIC)).id, SHARED_TOPIC);
    assert.equal(api.requestIsOperator(read), false);
  });
});
