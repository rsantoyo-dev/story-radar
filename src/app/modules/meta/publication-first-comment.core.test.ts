import assert from "node:assert/strict";
import test from "node:test";
import { MetaGraphApiError } from "./meta-token-response";
import {
  COMMENT_MAX_ATTEMPTS, CommentAccountChangedError, classifyCommentError, commentDue, firstCommentView, runFirstComment,
  type CommentStatus, type FirstCommentDependencies, type FirstCommentJob, type FirstCommentPatch,
} from "./publication-first-comment.core";

/** A job in memory, the Graph calls scripted, every transition recorded. */
function harness(start: Partial<FirstCommentJob> = {}, { post, findPosted }: { post?: () => Promise<string>; findPosted?: () => Promise<string | undefined> } = {}) {
  const job: FirstCommentJob & { commentId?: string | null; commentError?: string | null } = { commentStatus: "pending", commentAttempts: 0, publishedMediaId: "5001", ...start };
  const calls = { post: 0, find: 0 };
  const deps: FirstCommentDependencies = {
    loadJob: async () => ({ ...job }),
    comment: "Back on Saturday. Which book first?",
    channel: "instagram-page",
    platformLabel: "Instagram",
    findPosted: async () => { calls.find++; return findPosted ? findPosted() : undefined; },
    post: async () => { calls.post++; return post ? post() : "c-1"; },
    transition: async (from: CommentStatus, patch: FirstCommentPatch) => {
      if (job.commentStatus !== from) return false;
      Object.assign(job, patch);
      return true;
    },
    now: () => new Date("2026-10-22T12:00:00Z"),
  };
  return { job, calls, deps };
}

test("a pending comment is recorded as being sent, then posted once with its id", async () => {
  const h = harness();
  await runFirstComment(h.deps);
  assert.deepEqual([h.job.commentStatus, h.job.commentId, h.job.commentAttempts, h.calls.post, h.calls.find], ["posted", "c-1", 1, 1, 0]);
  await runFirstComment(h.deps);
  assert.equal(h.calls.post, 1, "a posted comment is never sent again");
});

test("a lost answer stays unconfirmed; the next step finds the comment on the post instead of sending it again", async () => {
  const h = harness({}, { post: async () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); } });
  await runFirstComment(h.deps);
  assert.deepEqual([h.job.commentStatus, h.calls.post], ["posting", 1]);
  const found = harness({ commentStatus: "posting", commentAttempts: 1 }, { findPosted: async () => "c-9" });
  await runFirstComment(found.deps);
  assert.deepEqual([found.job.commentStatus, found.job.commentId, found.calls.post], ["posted", "c-9", 0]);
  const absent = harness({ commentStatus: "posting", commentAttempts: 1 });
  await runFirstComment(absent.deps);
  assert.deepEqual([absent.job.commentStatus, absent.job.commentAttempts, absent.calls.find, absent.calls.post], ["posted", 2, 1, 1], "not there: sent once more");
});

test("a refusal goes back to pending until the last attempt; a permission refusal fails at once with what to grant", async () => {
  const refused = () => { throw new MetaGraphApiError("bad", 400, { error: { message: "Invalid parameter", code: 100 } }); };
  const h = harness({}, { post: async () => refused() });
  await runFirstComment(h.deps);
  assert.equal(h.job.commentStatus, "pending");
  assert.match(h.job.commentError ?? "", /Instagram refused the comment \(HTTP 400\)/u);
  const last = harness({ commentAttempts: COMMENT_MAX_ATTEMPTS - 1 }, { post: async () => refused() });
  await runFirstComment(last.deps);
  assert.equal(last.job.commentStatus, "failed");
  const denied = harness({}, { post: async () => { throw new MetaGraphApiError("denied", 403, { error: { message: "(#10) Application does not have permission for this action", code: 10 } }); } });
  await runFirstComment(denied.deps);
  assert.equal(denied.job.commentStatus, "failed");
  assert.match(denied.job.commentError ?? "", /add instagram_manage_comments to the app's Facebook Login configuration/u);
  assert.match(classifyCommentError(new MetaGraphApiError("denied", 403), "facebook-page", "Facebook").message, /pages_manage_engagement/u);
  assert.equal(classifyCommentError(new CommentAccountChangedError(), "facebook-page", "Facebook").kind, "permission", "never redirected to another account");
  assert.equal(classifyCommentError(new MetaGraphApiError("down", 503), "instagram-page", "Instagram").kind, "uncertain");
});

test("an unconfirmed send gives up after its attempts, telling the editor to look at the post", async () => {
  const h = harness({ commentStatus: "posting", commentAttempts: COMMENT_MAX_ATTEMPTS }, { findPosted: async () => { throw new MetaGraphApiError("down", 503); } });
  await runFirstComment(h.deps);
  assert.equal(h.job.commentStatus, "failed");
  assert.match(h.job.commentError ?? "", /Look at the post: the comment may already be there/u);
  assert.equal(h.calls.post, 0);
});

test("only a published post with a media id and a comment still due is commented; the view says where it stands", async () => {
  assert.equal(commentDue({ status: "published", publishedMediaId: "5001", commentStatus: "pending" }), true);
  assert.equal(commentDue({ status: "publishing", publishedMediaId: null, commentStatus: "pending" }), false);
  assert.equal(commentDue({ status: "published", publishedMediaId: "5001", commentStatus: null }), false, "a package without a comment");
  const h = harness({ publishedMediaId: null });
  await runFirstComment(h.deps);
  assert.equal(h.calls.post, 0);
  assert.deepEqual(firstCommentView({ commentStatus: "posted", commentError: null, commentedAt: new Date("2026-10-22T12:00:00Z") }), { status: "posted", error: null, postedAt: "2026-10-22T12:00:00.000Z" });
  assert.equal(firstCommentView({ commentStatus: null }), null);
});
