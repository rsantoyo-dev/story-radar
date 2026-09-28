import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeReceipt, parseConfig, planSync } from "./vercel-env.mjs";

const key = "CREATIVE_SINGLE_SHOT_REPAIR_MODEL";
const values = { [key]: "gpt-6-luna" };
const link = { projectId: "project", orgId: "team" };
const hidden = {
  key, id: "repair", target: ["production"], type: "sensitive",
  value: "[SENSITIVE]", decrypted: false, updatedAt: 100,
};

test("the production example has only supported configuration and keeps Luna repair", async () => {
  const example = await readFile(new URL("../.env.vercel.example", import.meta.url), "utf8");
  const parsed = parseConfig(example);
  assert.equal(parsed[key], "gpt-6-luna");
  assert.equal(parsed.CREATIVE_SINGLE_SHOT_ENABLED, "true");
});

test("credentials, local URLs and Vercel system tokens cannot be synced", () => {
  for (const forbidden of ["OPENAI_API_KEY", "DATABASE_URL", "META_TOKEN_ENCRYPTION_KEY", "RADAR_APP_URL", "VERCEL_OIDC_TOKEN"]) {
    assert.throws(() => parseConfig(`${forbidden}="do-not-print-this"`), (error) => {
      assert.match(error.message, /Unmanaged variable/u);
      assert.ok(!error.message.includes("do-not-print-this"));
      return true;
    });
  }
});

test("bad assignments, duplicate keys, placeholders and expansions fail before API access", () => {
  for (const input of [
    `${key}="[SENSITIVE]"`, `${key}="$OPENAI_API_KEY"`,
    `${key}="gpt-6-luna"\n${key}="gpt-6-sol"`,
    "CREATIVE_SINGLE_SHOT_ENABLED=yes", "CREATIVE_TEXT_PROVIDER=unknown",
    "CREATIVE_MAX_RUNS_PER_DAY=-1", "AI_MIN_LOCAL_SCORE=101", "not an assignment",
  ]) assert.throws(() => parseConfig(input));
});

test("missing and unreadable entries are never claimed to match without a receipt", () => {
  assert.equal(planSync(values, [])[0].status, "missing");
  assert.equal(planSync(values, [hidden])[0].status, "unverified");
});

test("only the default Production entry is selected; Preview and branch overrides are preserved", () => {
  const preview = { ...hidden, id: "preview", target: ["preview"], updatedAt: 200 };
  const branch = { ...preview, id: "branch", gitBranch: "experiment" };
  const plan = planSync(values, [preview, branch, hidden]);
  assert.equal(plan[0].entry.id, hidden.id);
  assert.equal(planSync(values, [preview, branch])[0].status, "missing");
});

test("shared or ambiguous Production entries block the entire plan", () => {
  assert.throws(() => planSync(values, [{ ...hidden, target: ["production", "preview"] }]), /shared/u);
  assert.throws(() => planSync(values, [{ ...hidden, customEnvironmentIds: ["staging"] }]), /shared/u);
  assert.throws(() => planSync(values, [hidden, { ...hidden, id: "duplicate" }]), /Multiple/u);
});

test("receipt detects local changes, remote changes, replacement and missing metadata", () => {
  const receipt = makeReceipt(link, values, [hidden]);
  assert.equal(planSync(values, [hidden], receipt)[0].status, "paired");
  assert.equal(planSync({ [key]: "gpt-6-sol" }, [hidden], receipt)[0].status, "unverified");
  for (const change of [{ updatedAt: 101 }, { id: "replacement" }, { type: "encrypted" }, { updatedAt: undefined }]) {
    assert.equal(planSync(values, [{ ...hidden, ...change }], receipt)[0].status, "unverified");
  }
  assert.ok(!JSON.stringify(receipt).includes("gpt-6-luna"));
  assert.ok(!JSON.stringify(receipt).includes("[SENSITIVE]"));
});

test("readable config is compared with its actual value instead of a stale receipt", () => {
  const plain = { ...hidden, type: "plain", value: "gpt-6-luna" };
  const receipt = makeReceipt(link, values, [plain]);
  assert.equal(planSync(values, [plain])[0].status, "paired");
  assert.equal(planSync(values, [{ ...plain, value: "gpt-6-sol" }], receipt)[0].status, "different");
  assert.throws(() => makeReceipt(link, values, []), /missing/u);
  assert.throws(() => makeReceipt(link, values, [{ ...plain, value: "gpt-6-sol" }]), /differs/u);
});
