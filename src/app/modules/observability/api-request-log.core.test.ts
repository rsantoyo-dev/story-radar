import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bodiesAllowed,
  clientIp,
  loggableBody,
  loggablePath,
  loggableQuery,
  retentionDays,
  shouldCaptureRequestBody,
  shouldCaptureResponseBody,
} from "./api-request-log.core";

describe("what a request log keeps", () => {
  it("hides credential paths and secret query parameters", () => {
    assert.equal(loggablePath("/api/deliver/abc.def.ghi"), "/api/deliver/[token]");
    assert.equal(loggablePath("/api/radar/credits"), "/api/radar/credits");
    assert.equal(loggableQuery("?topicId=1&token=secret"), "?topicId=1&token=[redacted]");
    assert.equal(loggableQuery(""), null);
  });

  it("never stores sign-in or delivery bodies", () => {
    assert.equal(bodiesAllowed("/api/auth/sign-in/magic-link"), false);
    assert.equal(bodiesAllowed("/api/deliver/x"), false);
    assert.equal(bodiesAllowed("/api/radar/topics"), true);
  });

  it("reads request bodies of textual changes only", () => {
    const json = new Headers({ "content-type": "application/json", "content-length": "120" });
    assert.equal(shouldCaptureRequestBody("POST", json, "/api/radar/topics"), true);
    assert.equal(shouldCaptureRequestBody("GET", json, "/api/radar/topics"), false);
    assert.equal(shouldCaptureRequestBody("POST", new Headers({ "content-type": "multipart/form-data; boundary=x" }), "/api/radar/x"), false);
    assert.equal(shouldCaptureRequestBody("POST", new Headers({ "content-type": "application/json", "content-length": "999999" }), "/api/radar/x"), false);
  });

  it("keeps response bodies of changes and failures, not of successful reads", () => {
    assert.equal(shouldCaptureResponseBody("POST", 200, "application/json", "/api/radar/x"), true);
    assert.equal(shouldCaptureResponseBody("GET", 200, "application/json", "/api/radar/x"), false);
    assert.equal(shouldCaptureResponseBody("GET", 404, "application/json; charset=utf-8", "/api/radar/x"), true);
    assert.equal(shouldCaptureResponseBody("GET", 500, "image/png", "/api/radar/x"), false);
  });

  it("redacts and limits bodies", () => {
    assert.equal(loggableBody('{"name":"Brand","accessToken":"abc","email":"ana@example.com"}', "application/json"),
      '{"name":"Brand","accessToken":"[redacted]","email":"a***@example.com"}');
    assert.equal(loggableBody("password=x&name=y", "application/x-www-form-urlencoded"), '{"password":"[redacted]","name":"y"}');
    assert.equal(loggableBody("", "application/json"), null);
    assert.match(String(loggableBody(JSON.stringify({ text: "a".repeat(3_000), more: Array.from({ length: 50 }, () => "b".repeat(3_000)) }), "application/json")), /more characters\]$/u);
  });

  it("reads the client address and the retention window", () => {
    assert.equal(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" })), "203.0.113.5");
    assert.equal(clientIp(new Headers({ "x-forwarded-for": "<script>" })), null);
    assert.equal(retentionDays(undefined), 30);
    assert.equal(retentionDays("90"), 90);
    assert.equal(retentionDays("0"), 30);
  });
});
