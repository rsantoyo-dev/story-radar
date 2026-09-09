import type {CreativeAiUsage} from "./creative-content.types";

type Response = {
  text?: string;
  modelVersion?: string;
  candidates?: {finishReason?: string}[];
  usageMetadata?: {promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number};
};
const emptyUsage = (): CreativeAiUsage => ({promptTokens: 0, outputTokens: 0, thoughtsTokens: 0, totalTokens: 0});
export class GeminiOutputLimitError extends Error {
  constructor(readonly usage: CreativeAiUsage) {super("Gemini output truncated after bounded retry");}
}
export class GeminiDeadlineError extends Error {
  constructor(readonly usage: CreativeAiUsage) {super("Gemini request deadline exceeded");}
}

export function geminiOutputBudget(model: string, requested: number) {
  // Current text models support this ceiling; preserve conservative limits for
  // older / custom models rather than assuming every endpoint supports 24k.
  const ceiling = /^(?:models\/)?gemini-(?:2\.5|3(?:\.|-))/u.test(model) ? 24_576 : 8_192;
  return {initial: Math.min(requested * 2, ceiling), ceiling};
}

/** Two attempts total, sharing a deadline. Never consume a truncated JSON.
 * request is injected so retries, cancellation and accounting can be tested
 * without credentials or paid calls. */
export async function requestCreativeGemini({model, requestedTokens, request, isTransient, log, timeoutMs = 60_000}: {
  model: string;
  requestedTokens: number;
  request: (maxOutputTokens: number, signal: AbortSignal) => Promise<Response>;
  isTransient: (error: unknown) => boolean;
  log: (event: {model: string; attempt: number; maxOutputTokens: number; finishReason: string; usage: CreativeAiUsage}) => void;
  timeoutMs?: number;
}): Promise<{response: Response; usage: CreativeAiUsage}> {
  const usage = emptyUsage();
  const controller = new AbortController();
  const {initial, ceiling} = geminiOutputBudget(model, requestedTokens);
  let budget = initial;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new GeminiDeadlineError({...usage}));
    }, timeoutMs);
  });
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      let response: Response;
      try {
        response = await Promise.race([request(budget, controller.signal), deadline]);
      } catch (error) {
        if (controller.signal.aborted) throw new GeminiDeadlineError({...usage});
        log({model, attempt, maxOutputTokens: budget, finishReason: "REQUEST_ERROR", usage: {...usage}});
        if (attempt === 1 && isTransient(error)) {
          await Promise.race([new Promise(resolve => setTimeout(resolve, 750)), deadline]);
          continue;
        }
        // Preserve known usage when a truncation was followed by an HTTP error.
        if (error instanceof Error) Object.assign(error, {creativeGeminiUsage: {...usage}});
        throw error;
      }
      const metadata = response.usageMetadata;
      const count = (value?: number) => Number.isFinite(value) && value! > 0 ? value! : 0;
      usage.promptTokens += count(metadata?.promptTokenCount);
      usage.outputTokens += count(metadata?.candidatesTokenCount);
      usage.thoughtsTokens += count(metadata?.thoughtsTokenCount);
      usage.totalTokens += count(metadata?.totalTokenCount);
      const truncated = response.candidates?.some(candidate => candidate.finishReason === "MAX_TOKENS");
      log({model, attempt, maxOutputTokens: budget, finishReason: truncated ? "MAX_TOKENS" : response.candidates?.[0]?.finishReason ?? "UNKNOWN", usage: {...usage}});
      if (!truncated) return {response, usage};
      const nextBudget = Math.min(budget * 2, ceiling);
      if (attempt === 2 || nextBudget === budget) throw new GeminiOutputLimitError({...usage});
      budget = nextBudget;
    }
    throw new Error("Gemini attempt budget exhausted");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function failedGeminiUsage(error: unknown): CreativeAiUsage {
  if (error instanceof GeminiOutputLimitError || error instanceof GeminiDeadlineError) return error.usage;
  if (error instanceof Error && "creativeGeminiUsage" in error) return error.creativeGeminiUsage as CreativeAiUsage;
  return emptyUsage();
}
