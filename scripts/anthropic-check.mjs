// Verifies ANTHROPIC_API_KEY with the smallest useful Claude call: one forced
// tool call capped at 64 output tokens. Prints the model, stop reason, request
// id and token usage; never the key.
//   npm run ai:anthropic:check        (reads .env.local)
const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
const model = process.env.CREATIVE_ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5";
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY is not set. Add it to .env.local, then run this check again.");
  process.exit(1);
}

const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
  body: JSON.stringify({
    model,
    max_tokens: 64,
    system: "Answer only by calling the tool.",
    messages: [{ role: "user", content: "Confirm the connection works." }],
    tools: [{
      name: "connection_check",
      description: "Report that the connection works.",
      input_schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
    }],
    tool_choice: { type: "tool", name: "connection_check" },
  }),
});
const body = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(`Claude ${model} answered HTTP ${response.status}: ${body?.error?.message ?? "unknown error"}`);
  process.exit(1);
}
const tool = (body.content ?? []).find((block) => block.type === "tool_use");
console.log(JSON.stringify({
  model: body.model, stopReason: body.stop_reason, requestId: response.headers.get("request-id"),
  toolInput: tool?.input ?? null, usage: body.usage,
}, null, 2));
