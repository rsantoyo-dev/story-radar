import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAuditRow, isMutatingMethod, topicIdFromUrl } from "./audit.core";

describe("buildAuditRow", () => {
  it("fills actor, workspace, topic and request from the request context", () => {
    const row = buildAuditRow(
      { action: "topic.deleted", entityType: "topic", entityId: "t1", details: { name: "Brand", accessToken: "secret" } },
      { requestId: "req-1", actor: "member", userId: "u1", workspaceId: "w1", topicId: "t1" },
    );
    assert.deepEqual(row, {
      action: "topic.deleted", outcome: "success", actorType: "user", actorId: "u1", workspaceId: "w1", topicId: "t1",
      entityType: "topic", entityId: "t1", requestId: "req-1", details: { name: "Brand", accessToken: "[redacted]" },
    });
  });

  it("lets explicit values win and treats the operator and missing context correctly", () => {
    assert.equal(buildAuditRow({ action: "billing.purchase.paid", actorType: "stripe", workspaceId: "w2" }, { actor: "member", userId: "u1", workspaceId: "w1" }).workspaceId, "w2");
    assert.equal(buildAuditRow({ action: "billing.purchase.paid", actorType: "stripe" }, { userId: "u1" }).actorId, null);
    assert.equal(buildAuditRow({ action: "credits.demo.reset" }, { actor: "operator", workspaceId: "default" }).actorType, "operator");
    const system = buildAuditRow({ action: "workspace.created" });
    assert.equal(system.actorType, "system");
    assert.equal(system.requestId, null);
    assert.deepEqual(system.details, {});
  });

  it("labels a route event with the request's method and path", () => {
    assert.equal(buildAuditRow({ action: "api.request", entityType: "route", outcome: "denied" }, { method: "DELETE", path: "/api/radar/admin" }).entityId, "DELETE /api/radar/admin");
  });

  it("refuses malformed actions", () => {
    for (const action of ["Topic.Deleted", "deleted", "topic..deleted", "topic.deleted!"]) {
      assert.throws(() => buildAuditRow({ action }));
    }
  });
});

describe("helpers", () => {
  it("finds the topic in a path or query", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    assert.equal(topicIdFromUrl(`https://x.test/api/radar/topics/${id}/meta`), id);
    assert.equal(topicIdFromUrl(`https://x.test/api/radar/collect?topicId=${id}`), id);
    assert.equal(topicIdFromUrl("https://x.test/api/radar/credits"), undefined);
    assert.equal(topicIdFromUrl("not a url"), undefined);
  });

  it("tells changes from reads", () => {
    assert.equal(isMutatingMethod("POST"), true);
    assert.equal(isMutatingMethod("delete"), true);
    assert.equal(isMutatingMethod("GET"), false);
    assert.equal(isMutatingMethod("HEAD"), false);
  });
});
