import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const requireLocal = createRequire(import.meta.url);
const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 4, 5, 0xff, 0xd9]);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** The delivery route with its database, R2 and logger stood in: `stored` is what R2 returns, `frozen` what the package recorded. */
function route(stored: Uint8Array, frozen: { byteSize: number; sha256: string }) {
  const errors: string[] = [];
  const mocks: Record<string, unknown> = {
    "@/app/modules/meta/freeze-publication-package": { resolveDeliveryFile: async () => ({ objectKey: "k", contentType: "image/jpeg", disposition: "ok", ...frozen }) },
    "@/app/modules/observability/logger": { createLogger: () => ({ error: (message: string) => errors.push(message) }) },
    "@/app/modules/stories/r2-storage": { readPrivateR2ImageFile: async () => new Blob([Buffer.from(stored)], { type: "image/jpeg" }) },
  };
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL("../../api/deliver/[token]/route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, Response, Uint8Array, Buffer, require: (id: string) => id in mocks ? mocks[id] : requireLocal(id) });
  const context = { params: Promise.resolve({ token: "abcdefghijklmnop1234" }) };
  return { GET: () => (exports.GET as (request: Request, context: unknown) => Promise<Response>)(new Request("https://app.example/api/deliver/x"), context), HEAD: () => (exports.HEAD as (request: Request, context: unknown) => Promise<Response>)(new Request("https://app.example/api/deliver/x"), context), errors };
}

test("the delivery serves exactly the frozen bytes with their Content-Length, and refuses a read that does not match them (Instagram once published a slide cut to grey)", async () => {
  const whole = route(jpeg, { byteSize: jpeg.byteLength, sha256: sha(jpeg) });
  const served = await whole.GET();
  assert.deepEqual([served.status, served.headers.get("Content-Length"), served.headers.get("Content-Type")], [200, String(jpeg.byteLength), "image/jpeg"]);
  assert.deepEqual(new Uint8Array(await served.arrayBuffer()), jpeg);
  assert.equal((await whole.HEAD()).headers.get("Content-Length"), String(jpeg.byteLength));
  const cut = route(jpeg.slice(0, 5), { byteSize: jpeg.byteLength, sha256: sha(jpeg) });
  assert.equal((await cut.GET()).status, 502, "fewer bytes than were frozen: never served");
  assert.match(cut.errors[0], /did not match what was frozen/);
  const changed = route(new Uint8Array([0xff, 0xd8, 9, 9, 9, 9, 9, 0xff, 0xd9]), { byteSize: jpeg.byteLength, sha256: sha(jpeg) });
  assert.equal((await changed.GET()).status, 502, "the same size, other bytes");
});
