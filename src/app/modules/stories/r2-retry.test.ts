import assert from "node:assert/strict";
import test from "node:test";

import { isTransientR2Failure, withTransientR2Retry } from "./r2-retry";

const tlsAlert = Object.assign(new Error("80BFF1F501000000:error:0A0003FC:SSL routines:ssl3_read_bytes:sslv3 alert bad record mac"), { code: "ERR_SSL_SSLV3_ALERT_BAD_RECORD_MAC" });
const http = (status: number) => Object.assign(new Error(`HTTP ${status}`), { $metadata: { httpStatusCode: status } });

test("a dropped or corrupted connection, a timeout, throttling or a server error is transient; a 4xx is not", () => {
  assert.equal(isTransientR2Failure(tlsAlert), true);
  for (const status of [408, 429, 500, 503]) assert.equal(isTransientR2Failure(http(status)), true, String(status));
  for (const status of [400, 403, 404]) assert.equal(isTransientR2Failure(http(status)), false, String(status));
  assert.equal(isTransientR2Failure(Object.assign(new Error("aborted"), { name: "AbortError" })), false);
});

test("a TLS blip is retried and the upload succeeds; a refusal or the last failure is thrown", async () => {
  const waits: number[] = [];
  const wait = async (ms: number) => { waits.push(ms); };
  let calls = 0;
  assert.equal(await withTransientR2Retry(async () => { calls += 1; if (calls === 1) throw tlsAlert; return "stored"; }, { wait }), "stored");
  assert.equal(calls, 2);
  assert.deepEqual(waits, [300]);

  calls = 0;
  await assert.rejects(withTransientR2Retry(async () => { calls += 1; throw http(403); }, { wait }), /HTTP 403/);
  assert.equal(calls, 1, "a refused request is not repeated");

  calls = 0;
  await assert.rejects(withTransientR2Retry(async () => { calls += 1; throw tlsAlert; }, { wait }), /bad record mac/);
  assert.equal(calls, 3, "three attempts, then the failure is reported");
});
