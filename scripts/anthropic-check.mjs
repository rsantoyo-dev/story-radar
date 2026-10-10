// Verifies ANTHROPIC_API_KEY with the smallest useful Claude call: one JSON
// answer under a schema, capped at 256 output tokens (the model's thinking
// counts against that cap). Prints the model, stop reason, request id and
// token usage; never the key.
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
    max_tokens: 256,
    system: "Answer with the JSON the schema asks for.",
    messages: [{ role: "user", content: "Confirm the connection works." }],
    output_config: { format: { type: "json_schema", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } } },
  }),
});
const body = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(`Claude ${model} answered HTTP ${response.status}: ${body?.error?.message ?? "unknown error"}`);
  process.exit(1);
}
const text = (body.content ?? []).filter((block) => block.type === "text").map((block) => block.text).join("");
console.log(JSON.stringify({
  model: body.model, stopReason: body.stop_reason, requestId: response.headers.get("request-id"),
  answer: text, usage: body.usage,
}, null, 2));
