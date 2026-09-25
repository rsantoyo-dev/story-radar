import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveMetaIntegrationHealth,
  requestOriginFromHeaders,
  type MetaIntegrationHealthInput,
} from "./meta-integration-health";

const PROD = "https://story-radar.example.app";
const TUNNEL = "https://tunnel.example.dev";

function input(
  overrides: Partial<MetaIntegrationHealthInput> = {},
): MetaIntegrationHealthInput {
  return {
    configuredAppUrl: PROD,
    requestOrigin: PROD,
    sharedAppConfigured: true,
    stateSecretConfigured: true,
    tokenEncryptionKeyConfigured: true,
    publicationWorkerSecretConfigured: true,
    ...overrides,
  };
}

function codes(health: ReturnType<typeof deriveMetaIntegrationHealth>) {
  return health.problems.map((problem) => problem.code);
}

test("a matching production setup is healthy and exposes the redirect URI", () => {
  const health = deriveMetaIntegrationHealth(input());
  assert.equal(health.ok, true);
  assert.deepEqual(codes(health), []);
  assert.equal(health.redirectUri, `${PROD}/api/radar/meta/callback`);
  assert.equal(health.appUrlMatchesRequest, true);
});

test("a stale tunnel URL in a hosted deployment is an actionable error", () => {
  const health = deriveMetaIntegrationHealth(
    input({ configuredAppUrl: `${TUNNEL}/`, requestOrigin: PROD }),
  );
  assert.equal(health.ok, false);
  assert.deepEqual(codes(health), ["app-url-mismatch"]);
  const [problem] = health.problems;
  assert.match(problem.message, new RegExp(`RADAR_APP_URL=${PROD}`));
  assert.match(problem.message, /api\/radar\/meta\/callback/);
  assert.equal(health.appUrlMatchesRequest, false);
});

test("browsing on localhost against a tunnel URL is the documented dev setup", () => {
  const health = deriveMetaIntegrationHealth(
    input({ configuredAppUrl: TUNNEL, requestOrigin: "http://localhost:3000" }),
  );
  assert.equal(health.ok, true);
  assert.deepEqual(codes(health), ["app-url-tunnel"]);
  assert.equal(health.problems[0].severity, "info");
});

test("missing or non-https app URL blocks the integration", () => {
  assert.deepEqual(
    codes(deriveMetaIntegrationHealth(input({ configuredAppUrl: undefined }))),
    ["app-url-missing"],
  );
  assert.deepEqual(
    codes(deriveMetaIntegrationHealth(input({ configuredAppUrl: "not a url" }))),
    ["app-url-invalid"],
  );
  const http = deriveMetaIntegrationHealth(
    input({ configuredAppUrl: "http://example.com", requestOrigin: "http://example.com" }),
  );
  assert.deepEqual(codes(http), ["app-url-not-https"]);
  assert.equal(http.ok, false);
});

test("missing secrets are reported with the right severity", () => {
  const health = deriveMetaIntegrationHealth(
    input({
      sharedAppConfigured: false,
      stateSecretConfigured: false,
      tokenEncryptionKeyConfigured: false,
      publicationWorkerSecretConfigured: false,
    }),
  );
  assert.equal(health.ok, false);
  assert.deepEqual(codes(health), [
    "shared-app-missing",
    "state-secret-missing",
    "token-key-missing",
    "worker-secret-missing",
  ]);
  assert.deepEqual(
    health.problems.map((problem) => problem.severity),
    ["warning", "error", "error", "warning"],
  );
});

test("request origin prefers forwarded headers and ignores extra hops", () => {
  const headers = new Headers({
    host: "internal:3000",
    "x-forwarded-host": "story-radar.example.app, proxy.internal",
    "x-forwarded-proto": "https,http",
  });
  assert.equal(
    requestOriginFromHeaders(headers, "http://internal:3000/api/x"),
    "https://story-radar.example.app",
  );
  assert.equal(
    requestOriginFromHeaders(new Headers(), "http://localhost:3000/api/x"),
    "http://localhost:3000",
  );
  assert.equal(
    requestOriginFromHeaders(new Headers({ "x-forwarded-proto": "ftp" }), "http://localhost:3000/"),
    undefined,
  );
});
