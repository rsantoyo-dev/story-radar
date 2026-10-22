import { classifyMetaGraphError, metaErrorDetail } from "./meta-verification";
import { MetaGraphApiError } from "./meta-token-response";
import type { PublicationChannel } from "./publication-channel";

/**
 * The first comment (2026-10-22): once a post is published, the account
 * posts the package's first comment under it, the first interaction (a
 * light recap, the publication's take and one short question). It is a
 * second, separate side effect: it never touches the post, and a post is
 * published whatever happens to its comment.
 *
 * A send is recorded (`posting`) before it is made. When its answer is lost
 * (a timeout, a server error), the next attempt first looks for the
 * account's comment with this exact text on the post, and only sends again
 * when it is not there: a comment is never posted twice. Sends are bounded;
 * after the last one, or when Meta refuses the permission, the comment is
 * `failed` with a sanitized reason and waits for the editor's retry.
 * Everything here is pure.
 */
export const COMMENT_STATUSES = ["pending", "posting", "posted", "failed"] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];
/** Sends of one comment before it is left to the editor's retry. */
export const COMMENT_MAX_ATTEMPTS = 3;

export type FirstCommentJob = { commentStatus: CommentStatus | null; commentAttempts: number; publishedMediaId: string | null };
export type FirstCommentPatch = { commentStatus: CommentStatus; commentAttempts?: number; commentId?: string | null; commentError?: string | null; commentedAt?: Date | null };

export type FirstCommentDependencies = {
  loadJob: () => Promise<FirstCommentJob>;
  /** The comment frozen in the package. */
  comment: string | undefined;
  channel: PublicationChannel;
  platformLabel: string;
  /** The id of the account's comment with this text already on the post, if any: an earlier send whose answer was lost. */
  findPosted: (mediaId: string, text: string) => Promise<string | undefined>;
  /** Posts the comment; returns its id. */
  post: (mediaId: string, text: string) => Promise<string>;
  /** Moves the comment from `from` while the job's lease is held; false when another worker changed it. */
  transition: (from: CommentStatus, patch: FirstCommentPatch) => Promise<boolean>;
  now: () => Date;
};

export type CommentErrorVerdict = { kind: "permission" | "uncertain" | "retryable"; message: string };

/** The account connected now is not the one the post went to: the comment is never redirected. */
export class CommentAccountChangedError extends Error {
  constructor() { super("The account connected now is not the one this post went to; reconnect that account in Channels to post its first comment."); }
}

/** What the editor does when Meta refuses the comment: the permission each channel needs, and where to grant it. */
export function commentPermissionMessage(channel: PublicationChannel): string {
  if (channel === "facebook-page") return "Facebook did not let the Page comment: add pages_manage_engagement to the app's Facebook Login configuration, then reconnect the Page in Channels.";
  if (channel === "instagram-page") return "Instagram did not let the account comment: add instagram_manage_comments to the app's Facebook Login configuration, then reconnect the Page in Channels.";
  return "Instagram did not let the account comment: reconnect Instagram with the instagram_business_manage_comments permission.";
}

/** Why a comment's request failed: refused for permission, answered with a refusal (it was not posted), or unanswered (it may be up). */
export function classifyCommentError(error: unknown, channel: PublicationChannel, platform: string): CommentErrorVerdict {
  if (error instanceof CommentAccountChangedError) return { kind: "permission", message: error.message };
  if (error instanceof MetaGraphApiError) {
    const kind = classifyMetaGraphError(error.graphError);
    const detail = metaErrorDetail(error.graphError);
    const said = (message: string) => detail ? `${message} ${detail}` : message;
    if (kind === "auth" || kind === "permission" || error.status === 403) return { kind: "permission", message: said(commentPermissionMessage(channel)) };
    if (error.status >= 500) return { kind: "uncertain", message: said(`${platform} did not confirm the comment (HTTP ${error.status}); the next attempt looks for it on the post first.`) };
    if (error.status === 429) return { kind: "retryable", message: said(`${platform} rate-limited this account; the comment is tried again later.`) };
    return { kind: "retryable", message: said(`${platform} refused the comment (HTTP ${error.status}).`) };
  }
  return { kind: "uncertain", message: "The comment's answer was lost; the next attempt looks for it on the post before sending again." };
}

/** Whether a job's comment still has to be posted: published, with a media id, its comment pending or its send unconfirmed. */
export const commentDue = (job: { status: string; publishedMediaId: string | null; commentStatus: string | null }) =>
  job.status === "published" && Boolean(job.publishedMediaId) && (job.commentStatus === "pending" || job.commentStatus === "posting");

/** One bounded step: look for an unconfirmed send, else send once, recorded first. */
export async function runFirstComment(deps: FirstCommentDependencies): Promise<void> {
  const job = await deps.loadJob();
  if ((job.commentStatus !== "pending" && job.commentStatus !== "posting") || !job.publishedMediaId) return;
  const mediaId = job.publishedMediaId;
  const text = deps.comment?.trim();
  if (!text) {
    await deps.transition(job.commentStatus, { commentStatus: "failed", commentError: "The package has no first comment to post." });
    return;
  }
  if (job.commentStatus === "posting") {
    let found: string | undefined;
    try {
      found = await deps.findPosted(mediaId, text);
    } catch (error) {
      const verdict = classifyCommentError(error, deps.channel, deps.platformLabel);
      if (verdict.kind === "permission") await deps.transition("posting", { commentStatus: "failed", commentError: verdict.message });
      else if (job.commentAttempts >= COMMENT_MAX_ATTEMPTS) {
        await deps.transition("posting", { commentStatus: "failed", commentError: `${verdict.message} Look at the post: the comment may already be there.` });
      }
      return;
    }
    if (found) {
      await deps.transition("posting", { commentStatus: "posted", commentId: found, commentError: null, commentedAt: deps.now() });
      return;
    }
    if (job.commentAttempts >= COMMENT_MAX_ATTEMPTS) {
      await deps.transition("posting", { commentStatus: "failed", commentError: `The first comment was not posted after ${COMMENT_MAX_ATTEMPTS} attempts.` });
      return;
    }
  }
  // Recorded before the send: a lost answer is looked for next time, never sent blind.
  const attempts = job.commentAttempts + 1;
  if (!(await deps.transition(job.commentStatus, { commentStatus: "posting", commentAttempts: attempts }))) return;
  try {
    const id = await deps.post(mediaId, text);
    await deps.transition("posting", { commentStatus: "posted", commentId: id, commentError: null, commentedAt: deps.now() });
  } catch (error) {
    const verdict = classifyCommentError(error, deps.channel, deps.platformLabel);
    if (verdict.kind === "uncertain") await deps.transition("posting", { commentStatus: "posting", commentError: verdict.message });
    else if (verdict.kind === "permission" || attempts >= COMMENT_MAX_ATTEMPTS) await deps.transition("posting", { commentStatus: "failed", commentError: verdict.message });
    else await deps.transition("posting", { commentStatus: "pending", commentError: verdict.message });
  }
}

/** A comment's state as the editor sees it under the post. */
export type FirstCommentView = { status: CommentStatus; error: string | null; postedAt: string | null };
export const firstCommentView = (row: { commentStatus?: string | null; commentError?: string | null; commentedAt?: Date | null }): FirstCommentView | null =>
  row.commentStatus && (COMMENT_STATUSES as readonly string[]).includes(row.commentStatus)
    ? { status: row.commentStatus as CommentStatus, error: row.commentError ?? null, postedAt: row.commentedAt ? row.commentedAt.toISOString() : null }
    : null;
