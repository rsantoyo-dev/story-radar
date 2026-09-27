import assert from "node:assert/strict";
import { test } from "node:test";
import { decideRadarAuthorization } from "./radar-auth-decision";

const base = {
  method: "GET",
  origin: null,
  fetchSite: null,
  appOrigin: "https://radar.example",
  validBearer: false,
  session: null as { actor: string; workspaceId: string; role: string } | null,
};

const session = { actor: "user:editor", workspaceId: "workspace-1", role: "owner" };

test("valid session conveys its workspace, including reads without an Origin header", () => {
  assert.deepEqual(decideRadarAuthorization({ ...base, session }), {
    status: 200, ...session,
  });
});

test("missing or expired session and invalid Bearer cannot authenticate", () => {
  assert.deepEqual(decideRadarAuthorization(base), { status: 401 });
  assert.deepEqual(decideRadarAuthorization({ ...base, validBearer: false, method: "POST" }), { status: 401 });
});

test("cookie mutations reject cross-origin and ambiguous same-site requests", () => {
  for (const input of [
    { origin: "https://other.example", fetchSite: "cross-site" },
    { origin: null, fetchSite: "same-site" },
    { origin: null, fetchSite: null },
  ]) {
    assert.deepEqual(decideRadarAuthorization({ ...base, ...input, method: "POST", session }), { status: 403 });
  }
  assert.deepEqual(decideRadarAuthorization({
    ...base, method: "PATCH", origin: base.appOrigin, session,
  }), { status: 200, ...session });
  assert.deepEqual(decideRadarAuthorization({
    ...base, method: "DELETE", fetchSite: "same-origin", session,
  }), { status: 200, ...session });
});

test("service Bearer can mutate without a browser session or Origin", () => {
  assert.deepEqual(decideRadarAuthorization({ ...base, method: "POST", validBearer: true }), {
    status: 200, actor: "service:collector", workspaceId: null,
  });
});
