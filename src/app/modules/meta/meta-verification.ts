/**
 * Classifies a Graph API error from a live insights-verification call so the
 * caller can tell an unusable token (reconnect fixes it) apart from a
 * permission/App-Review gap (reconnecting would not help — Advanced Access
 * or Tester registration is the real fix). No "server-only" import: pure and
 * unit-tested directly.
 */

export type MetaVerificationErrorKind = "auth" | "permission" | "unknown";

// Meta's standard OAuthException code for an invalid/expired/revoked token.
const AUTH_ERROR_CODES = new Set([190]);
// Subcodes distinguishing why the token died: expired, revoked by the user,
// password changed, deauthorized, or otherwise unconfirmed.
const AUTH_ERROR_SUBCODES = new Set([458, 459, 460, 463, 467]);
// 10: application does not have permission for this action (the exact
// signature of an Advanced-Access-gated scope on a Standard-Access app).
// 200: permission error, more generally.
const PERMISSION_ERROR_CODES = new Set([10, 200]);

type ParsedOAuthError = {
  code?: number;
  error_subcode?: number;
  message?: string;
  error_user_title?: string;
  error_user_msg?: string;
};

export function classifyMetaGraphError(
  graphError: unknown,
): MetaVerificationErrorKind {
  const error = extractOAuthError(graphError);
  if (!error) return "unknown";
  if (error.code !== undefined && AUTH_ERROR_CODES.has(error.code)) {
    return "auth";
  }
  if (
    error.error_subcode !== undefined &&
    AUTH_ERROR_SUBCODES.has(error.error_subcode)
  ) {
    return "auth";
  }
  if (error.code !== undefined && PERMISSION_ERROR_CODES.has(error.code)) {
    return "permission";
  }
  if (/permission/iu.test(error.message ?? "")) return "permission";
  return "unknown";
}

/**
 * Meta's own words on a rejected request, for the editor and the job's
 * record: the title and text it shows people when it gives them, its
 * message, and its code and subcode. Addresses and anything token-like are
 * cut out, and the line stays short. Undefined when Meta said nothing usable.
 */
export function metaErrorDetail(graphError: unknown): string | undefined {
  const error = extractOAuthError(graphError);
  if (!error) return undefined;
  const words = [...new Set([error.error_user_title, error.error_user_msg, error.message].map((part) => part?.trim()).filter((part): part is string => Boolean(part)))];
  const text = words.join(" — ")
    .replace(/https?:\/\/\S+/gu, "")
    .replace(/[A-Za-z0-9_-]{40,}/gu, "…")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 240);
  const codes = [error.code !== undefined ? `code ${error.code}` : "", error.error_subcode !== undefined ? `subcode ${error.error_subcode}` : ""].filter(Boolean).join(", ");
  if (!text && !codes) return undefined;
  return `Meta: ${text ? `“${text}”` : "no message"}${codes ? ` (${codes})` : ""}.`;
}

export function describeMetaVerificationError(
  graphError: unknown,
  fallbackMessage: string,
): string {
  const error = extractOAuthError(graphError);
  return error?.message?.trim() || fallbackMessage;
}

function extractOAuthError(graphError: unknown): ParsedOAuthError | undefined {
  if (!graphError || typeof graphError !== "object") return undefined;
  const body = graphError as Record<string, unknown>;
  // Nested {error:{code,error_subcode,message}} is the standard Graph API
  // shape; some callers may already unwrap to a flat {code,...} object, so
  // accept either defensively.
  const nested =
    body.error && typeof body.error === "object"
      ? (body.error as Record<string, unknown>)
      : body;
  return {
    code: typeof nested.code === "number" ? nested.code : undefined,
    error_subcode:
      typeof nested.error_subcode === "number"
        ? nested.error_subcode
        : undefined,
    message:
      typeof nested.message === "string"
        ? nested.message
        : typeof nested.error_message === "string"
          ? nested.error_message
          : undefined,
    error_user_title: typeof nested.error_user_title === "string" ? nested.error_user_title : undefined,
    error_user_msg: typeof nested.error_user_msg === "string" ? nested.error_user_msg : undefined,
  };
}
