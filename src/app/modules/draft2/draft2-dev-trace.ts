/**
 * The exact Draft 2 provider traffic on the development console: every
 * request's instructions and contents, every answer, usage and timing. It
 * writes straight to stdout so long prompts are not cut by the log bridge.
 * Never on in production, and it never receives a credential: the adapters
 * keep the API key out of what the orchestrator hands over.
 *   DRAFT2_DEBUG_LOG=false   silences it in development.
 */
export function draft2DevTraceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && env.DRAFT2_DEBUG_LOG !== "false";
}

export type Draft2DevTraceEvent = {
  step: string;
  round: number;
  provider: string;
  model: string;
  operation: string;
  phase: "request" | "response" | "error";
  detail: unknown;
  durationMs?: number;
};

export function draft2DevTrace(event: Draft2DevTraceEvent, write: (line: string) => void = (line) => process.stdout.write(line)): void {
  if (!draft2DevTraceEnabled()) return;
  const header = `\n[draft2] ${event.step} · round ${event.round} · ${event.provider}/${event.model} · ${event.operation} · ${event.phase}${event.durationMs !== undefined ? ` · ${event.durationMs} ms` : ""}\n`;
  let body: string;
  try { body = JSON.stringify(event.detail, null, 2); } catch { body = String(event.detail); }
  write(`${header}${body}\n`);
}
