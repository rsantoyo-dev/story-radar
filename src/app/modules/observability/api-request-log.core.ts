import { redactText, sanitize } from "./log.core";

/** Bodies are kept to this many characters after redaction. */
export const MAX_LOGGED_BODY = 16_000;
/** Request bodies larger than this are not read at all. */
export const MAX_READ_BODY_BYTES = 256_000;

/** Path segments that are themselves credentials (signed delivery links). */
const SECRET_PATHS: [RegExp, string][] = [
  [/^\/api\/deliver\/[^/]+/u, "/api/deliver/[token]"],
];

export function loggablePath(pathname: string): string {
  for (const [pattern, replacement] of SECRET_PATHS) if (pattern.test(pathname)) return pathname.replace(pattern, replacement);
  return redactText(pathname).slice(0, 500);
}

export function loggableQuery(search: string): string | null {
  return search && search !== "?" ? redactText(search).slice(0, 1_000) : null;
}

/** Routes whose bodies are never stored (sign-in links, OAuth codes). */
export function bodiesAllowed(pathname: string): boolean {
  return !pathname.startsWith("/api/auth/") && !pathname.startsWith("/api/deliver/");
}

const TEXTUAL = /^(application\/(json|x-www-form-urlencoded|problem\+json|xml)|text\/)/iu;

export function isTextual(contentType: string | null): boolean {
  return Boolean(contentType && TEXTUAL.test(contentType.trim()));
}

/** Whether to read a request body: changes only, text, not too large. */
export function shouldCaptureRequestBody(method: string, headers: Headers, pathname: string): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()) || !bodiesAllowed(pathname)) return false;
  const length = Number(headers.get("content-length") ?? 0);
  return isTextual(headers.get("content-type")) && (!length || length <= MAX_READ_BODY_BYTES);
}

/** Whether to keep a response body: changes and failures (reads keep only their size). */
export function shouldCaptureResponseBody(method: string, status: number, contentType: string | null, pathname: string): boolean {
  if (!bodiesAllowed(pathname) || !isTextual(contentType)) return false;
  return status >= 400 || !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

/** A body as stored: JSON is parsed and redacted field by field, anything else as text. */
export function loggableBody(raw: string | null | undefined, contentType: string | null): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  let text: string;
  if (contentType?.includes("json")) {
    try {
      text = JSON.stringify(sanitize(JSON.parse(raw)));
    } catch {
      text = redactText(raw);
    }
  } else if (contentType?.includes("x-www-form-urlencoded")) {
    text = JSON.stringify(sanitize(Object.fromEntries(new URLSearchParams(raw))));
  } else {
    text = redactText(raw);
  }
  return text.length > MAX_LOGGED_BODY ? `${text.slice(0, MAX_LOGGED_BODY)}… [${text.length - MAX_LOGGED_BODY} more characters]` : text;
}

export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim();
  return forwarded && /^[0-9a-f:.]{2,64}$/iu.test(forwarded) ? forwarded : null;
}

export function retentionDays(value: string | undefined): number {
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days <= 3650 ? days : 30;
}
