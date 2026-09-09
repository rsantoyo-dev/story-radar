import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizePublicationWorker } from "./publication-worker-auth";

test("worker authorization rejects missing configuration and browser credentials", () => {
  const request = (value: string) => new Request("https://example.com", { headers: { authorization: value } });
  assert.equal(authorizePublicationWorker(request("Bearer worker"), undefined), 503);
  assert.equal(authorizePublicationWorker(request("Bearer editor"), "worker"), 401);
  assert.equal(authorizePublicationWorker(request(""), "worker"), 401);
  assert.equal(authorizePublicationWorker(request("Bearer worker"), "worker"), 200);
});
