export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installConsoleBridge } = await import("./app/modules/observability/logger");
    // Production (and LOG_CONSOLE_BRIDGE=true locally): every console.* line becomes redacted JSON.
    if (process.env.NODE_ENV === "production" || process.env.VERCEL || process.env.LOG_CONSOLE_BRIDGE === "true") {
      installConsoleBridge();
    }
    const { configureServerFonts } = await import("./server-fonts");
    configureServerFonts();
  }
}

type RequestErrorInfo = { path?: string; method?: string; headers?: Record<string, string | string[] | undefined> };
type RequestErrorContext = { routerKind?: string; routePath?: string; routeType?: string; renderSource?: string; revalidateReason?: string };

/** Every error Next.js catches while handling a request, as one structured entry. */
export async function onRequestError(error: unknown, request: RequestErrorInfo, context: RequestErrorContext) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { createLogger } = await import("./app/modules/observability/logger");
  const header = (name: string) => {
    const value = request.headers?.[name];
    return Array.isArray(value) ? value[0] : value;
  };
  createLogger("next").error("Unhandled request error", {
    error,
    requestId: header("x-request-id") ?? header("x-vercel-id"),
    method: request.method,
    path: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    renderSource: context.renderSource,
  });
}
