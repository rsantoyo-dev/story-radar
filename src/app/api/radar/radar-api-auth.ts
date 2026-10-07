import "server-only";

import { NextResponse } from "next/server";

import {
  authRequired,
  currentWorkspace,
  getSessionUser,
  getWorkspaceRole,
  isPlatformStaff,
  resolveUserWorkspaces,
  type SessionUser,
} from "@/app/modules/auth/access";
import { hasRole, minimumRoleForMethod, type WorkspaceRole } from "@/app/modules/auth/access.core";
import { DEFAULT_WORKSPACE_ID, getTopicById } from "@/app/modules/topics/topic-catalog.repository";
import { TopicContextError } from "@/app/modules/topics/topic-context";
import { SIGNED_IN_CREDENTIAL } from "@/app/modules/auth/session-credential";
import type { Topic } from "@/db/schema";

/**
 * Who an API request acts for. The shared collector secret is the operator
 * of the default workspace (scripts, and the dashboard while sign-in is off);
 * a signed-in member acts in their own workspace with their role.
 */
export type RadarRequestAccess =
  | { kind: "operator"; workspaceId: string; role: "owner"; staff: true }
  | { kind: "member"; user: SessionUser; workspaceId: string; role: WorkspaceRole; staff: boolean };

const accessByRequest = new WeakMap<Request, RadarRequestAccess>();
const TOPIC_IN_PATH = /\/topics\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Authorizes an API request and remembers who it acts for. A topic named in
 * the URL (path or `topicId` query) is checked here, for every route at once:
 * it must belong to a workspace the caller may use, with at least `minimum`
 * (default: viewer to read, editor to change). Returns a response to send
 * when the request is refused.
 */
export async function authorizeRadarCollector(
  request: Request,
  minimum?: WorkspaceRole,
): Promise<NextResponse | undefined> {
  const configuredSecret = process.env.RADAR_COLLECTOR_SECRET?.trim();
  const authorization = request.headers.get("authorization")?.trim();

  let access: RadarRequestAccess | undefined;
  if (configuredSecret && configuredSecret !== SIGNED_IN_CREDENTIAL && authorization === `Bearer ${configuredSecret}`) {
    access = { kind: "operator", workspaceId: DEFAULT_WORKSPACE_ID, role: "owner", staff: true };
  } else {
    const user = await getSessionUser(request.headers).catch(() => undefined);
    if (user) {
      const memberships = await resolveUserWorkspaces(user);
      const staff = await isPlatformStaff(user.id);
      const workspace = currentWorkspace(memberships);
      if (!workspace) return refuse("Your account is not a member of any workspace.", 403);
      access = { kind: "member", user, workspaceId: workspace.workspaceId, role: workspace.role, staff };
    }
  }

  if (!access) {
    if (!configuredSecret && !authRequired()) {
      return NextResponse.json({ error: "RADAR_COLLECTOR_SECRET is not configured" }, { status: 503 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  }
  accessByRequest.set(request, access);

  const topicId = topicIdInUrl(request);
  if (topicId) {
    const denied = await topicRefusal(access, topicId, minimum ?? minimumRoleForMethod(request.method));
    if (denied) return denied;
  } else {
    // Workspace-level routes: reading needs a member, any change an editor.
    const needed = minimum ?? minimumRoleForMethod(request.method);
    if (!hasRole(access.role, needed) && !access.staff) return refuse(`This needs the ${needed} role in your workspace.`, 403);
  }
  return undefined;
}

/** Who this request acts for; throws if the route did not authorize it first. */
export function requestAccess(request: Request): RadarRequestAccess {
  const access = accessByRequest.get(request);
  if (!access) throw new Error("authorizeRadarCollector must run before reading the request's access");
  return access;
}

/** The workspace a workspace-level route (topics, sources, credits) works in. */
export function requestWorkspaceId(request: Request): string {
  return requestAccess(request).workspaceId;
}

/** Platform operator: the shared secret, or platform staff signed in. */
export function requestIsOperator(request: Request): boolean {
  return requestAccess(request).staff;
}

/** A TopicContextError, so every route's existing topic error handling answers it. */
export class TopicAccessDeniedError extends TopicContextError {
  constructor(message: string, readonly status: 403 | 404) {
    super(message);
  }
}

/**
 * The topic this request may use at `minimum`. An unknown topic and a topic in
 * another workspace both read as not found, so ids cannot be probed.
 */
export async function requireTopicForRequest(
  request: Request,
  topicId: string | null | undefined,
  options: { active?: boolean; minimum?: WorkspaceRole } = {},
): Promise<Topic> {
  if (!topicId || !UUID.test(topicId)) throw new TopicAccessDeniedError("topicId must be a valid UUID", 404);
  const access = requestAccess(request);
  const topic = await getTopicById(topicId);
  if (!topic) throw new TopicAccessDeniedError("Topic was not found", 404);
  const role = await roleOnTopic(access, topic);
  if (role === undefined) throw new TopicAccessDeniedError("Topic was not found", 404);
  const minimum = options.minimum ?? minimumRoleForMethod(request.method);
  if (role !== "staff" && !hasRole(role, minimum)) {
    throw new TopicAccessDeniedError(`Your role on this topic cannot do this (needs ${minimum}).`, 403);
  }
  if (options.active && !topic.isActive) throw new TopicAccessDeniedError("Topic is inactive", 404);
  return topic;
}

async function topicRefusal(access: RadarRequestAccess, topicId: string, minimum: WorkspaceRole): Promise<NextResponse | undefined> {
  const topic = await getTopicById(topicId);
  const role = topic ? await roleOnTopic(access, topic) : undefined;
  if (role === undefined) return refuse("Topic was not found", 404);
  if (role !== "staff" && !hasRole(role, minimum)) return refuse(`Your role on this topic cannot do this (needs ${minimum}).`, 403);
  return undefined;
}

/** The caller's role on a topic's workspace; "staff" for platform support; undefined without access. */
async function roleOnTopic(access: RadarRequestAccess, topic: Topic): Promise<WorkspaceRole | "staff" | undefined> {
  if (access.kind === "operator") return topic.workspaceId === access.workspaceId ? "owner" : undefined;
  if (topic.workspaceId === access.workspaceId) return access.role;
  const role = await getWorkspaceRole(access.user.id, topic.workspaceId);
  if (role) return role;
  return access.staff ? "staff" : undefined;
}

function topicIdInUrl(request: Request): string | undefined {
  const url = new URL(request.url);
  const fromPath = TOPIC_IN_PATH.exec(url.pathname)?.[1];
  if (fromPath) return fromPath;
  const fromQuery = url.searchParams.get("topicId")?.trim();
  return fromQuery && UUID.test(fromQuery) ? fromQuery : undefined;
}

function refuse(error: string, status: 403 | 404): NextResponse {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}
