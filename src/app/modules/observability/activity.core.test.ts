import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nextBefore, parseAuditQuery, parseChangeQuery } from "./activity.core";

const params = (query: string) => new URLSearchParams(query);

describe("activity queries", () => {
  it("reads the audit filters an editor can set", () => {
    const query = parseAuditQuery(params("action=billing.&excludeAction=api.request&outcome=denied&topicId=0f8fad5b-d9cb-469f-a165-70867728950e&before=2026-10-07T12:00:00Z&limit=25"), false);
    assert.equal(query.action, "billing.");
    assert.equal(query.excludeAction, "api.request");
    assert.equal(query.outcome, "denied");
    assert.equal(query.topicId, "0f8fad5b-d9cb-469f-a165-70867728950e");
    assert.equal(query.before?.toISOString(), "2026-10-07T12:00:00.000Z");
    assert.equal(query.limit, 25);
  });

  it("drops malformed audit filters instead of refusing the list", () => {
    const query = parseAuditQuery(params("action=Billing%20%25&outcome=maybe&topicId=not-a-uuid&before=yesterday&limit=9999"), false);
    assert.equal(query.action, undefined);
    assert.equal(query.outcome, undefined);
    assert.equal(query.topicId, undefined);
    assert.equal(query.before, undefined);
    assert.equal(query.limit, 200);
    assert.equal(parseAuditQuery(params(""), false).limit, 50);
  });

  it("keeps a member's audit trail inside their workspace", () => {
    assert.equal(parseAuditQuery(params("scope=all"), false).scope, "workspace");
    assert.equal(parseAuditQuery(params("scope=all"), true).scope, "all");
  });

  it("keeps a member's change history inside their workspace", () => {
    assert.equal(parseChangeQuery(params("scope=all"), false).scope, "workspace");
    assert.equal(parseChangeQuery(params("scope=all"), true).scope, "all");
    assert.equal(parseChangeQuery(params(""), true).scope, "workspace");
  });

  it("reads the change filters", () => {
    const query = parseChangeQuery(params("table=workspace_members&operation=update&rowKey=ws_1:user_1&transactionId=42"), false);
    assert.equal(query.table, "workspace_members");
    assert.equal(query.operation, "UPDATE");
    assert.equal(query.rowKey, "ws_1:user_1");
    assert.equal(query.transactionId, 42);
    assert.equal(parseChangeQuery(params("table=Users;drop&operation=TRUNCATE&transactionId=-1"), false).table, undefined);
    assert.equal(parseChangeQuery(params("operation=TRUNCATE"), false).operation, undefined);
    assert.equal(parseChangeQuery(params("transactionId=-1"), false).transactionId, undefined);
  });

  it("offers an older page only after a full one", () => {
    const rows = [{ occurredAt: new Date("2026-10-07T10:00:00Z") }, { occurredAt: new Date("2026-10-07T09:00:00Z") }];
    assert.equal(nextBefore(rows, 2), "2026-10-07T09:00:00.000Z");
    assert.equal(nextBefore(rows, 3), null);
  });
});
