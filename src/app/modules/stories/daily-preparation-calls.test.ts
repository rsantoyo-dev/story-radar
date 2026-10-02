import assert from "node:assert/strict";
import test from "node:test";

import { preparationCallLabel, preparationModelLabel, type PreparationTextCall } from "./daily-preparation.types";

const call = (operation: string, model = "gpt-6.1-sol"): PreparationTextCall =>
  ({ id: operation, operation, provider: "openai", model, status: "settled", startedAt: "2026-10-01T19:18:56Z", finishedAt: "2026-10-01T19:20:30Z", creditMicros: 74_825 });

test("the first script is the script; later full drafts are rewrites", () => {
  const brief = call("creative_brief", "gemini-3.8-flash");
  const first = call("creative_draft");
  assert.equal(preparationCallLabel(brief, []), "Brief");
  assert.equal(preparationCallLabel(first, [brief]), "Script");
  assert.equal(preparationCallLabel(call("creative_draft", "gpt-6-luna"), [brief, first]), "Script rewrite");
  assert.equal(preparationCallLabel(call("creative_critic", "gemini-3.8-flash"), [brief, first]), "Critic review");
  assert.equal(preparationCallLabel({ ...call("creative_json", "openai/gpt-oss-20b"), provider: "groq" }, []), "AI step (fallback provider)");
  assert.equal(preparationCallLabel({ ...call("creative_json", "gemini-3.8-flash"), provider: "google" }, []), "Brief or critic review");
});

test("model ids read as product names", () => {
  assert.equal(preparationModelLabel("gpt-6.1-sol"), "GPT-6.1 Sol");
  assert.equal(preparationModelLabel("gpt-6-luna"), "GPT-6 Luna");
  assert.equal(preparationModelLabel("gemini-3.8-flash"), "Gemini 3.8 Flash");
});
