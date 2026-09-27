export type RadarAuthDecision =
  | { status: 200; actor: string; workspaceId: string | null; role?: string }
  | { status: 401 | 403 };

/** Cookie requests mutate only from the configured site. Service Bearer requests have no CSRF cookie. */
export function decideRadarAuthorization(input: {
  method: string;
  origin: string | null;
  fetchSite: string | null;
  appOrigin: string | null;
  validBearer: boolean;
  session: { actor: string; workspaceId: string; role: string } | null;
}): RadarAuthDecision {
  if (input.validBearer) return { status: 200, actor: "service:collector", workspaceId: null };
  if (!input.session) return { status: 401 };
  if (!["GET", "HEAD", "OPTIONS"].includes(input.method.toUpperCase())) {
    if (input.origin) {
      if (!input.appOrigin || input.origin !== input.appOrigin) return { status: 403 };
    } else if (input.fetchSite !== "same-origin") {
      return { status: 403 };
    }
  }
  return { status: 200, actor: input.session.actor,
    workspaceId: input.session.workspaceId, role: input.session.role };
}
