import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import type { CreativeDraft, CreativeAssetBatch } from "../stories/creative-content.types";
import { DOCUMENTARY_PROVIDER, DOCUMENTARY_VERSION } from "../stories/creative-documentary";
import { destinationBlockers, editorialCandidateBlockers, publicationSnapshotHash } from "./instagram-publication-candidate";
import { validatePublicationCandidate, type CandidateInputs } from "./validate-publication-candidate";

function fixture(): CandidateInputs {
  const unit = { order: 1, type: "meme-frame", role: "cover", headline: "Approved headline", body: "Source copy", factIds: [], visualDirection: "Typography", aspectRatio: "4:5" };
  const approvedAt = new Date("2026-09-01T12:00:00Z");
  return {
    topicId: "topic", sourceToken: "source",
    draft: { id: "draft", storyId: "story", version: 1, status: "approved", approvedAt, caption: "Exact caption\nwith whitespace ", hashtags: ["#approved"], format: "meme", outputAspectRatio: "4:5", units: [unit] } as unknown as CreativeDraft,
    batch: { id: "batch", draftId: "draft", draftVersion: 1, status: "completed", totalAssets: 1, outputAspectRatio: "4:5", assets: [{ id: "asset", unitOrder: 1, version: 2, status: "approved", approvedAt, imageUrl: "https://private.example/signed?token=SECRET", unitSnapshot: unit }] } as unknown as CreativeAssetBatch,
    destination: { igUserId: "account", igUsername: "editor", connectionVersion: "connection-1", connected: true, expired: false, hasBasicPermission: true, hasPublishingPermission: true },
  };
}
async function imageFile() {
  const bytes = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "white" } }).png().toBuffer();
  return new File([new Uint8Array(bytes)], "approved.png", { type: "image/png" });
}

test("approved set is a candidate, not ready from a recorded scope alone; exact copy and file hashes are retained", async () => {
  const input = fixture();
  const result = await validatePublicationCandidate({ load: async () => input, readApprovedImage: imageFile });
  assert.equal(result.state, "candidate");
  assert.equal(result.caption, input.draft.caption);
  assert.deepEqual(result.hashtags, input.draft.hashtags);
  assert.match(result.assets[0].sha256!, /^[a-f0-9]{64}$/);
  assert.equal(result.blockers[0].code, "publishing-capability-unverified");
  assert.doesNotMatch(JSON.stringify(result), /SECRET|private.example|connection-1/);
});

test("PUB-02: a live enabled publishing check clears the last blocker; anything else keeps it a candidate with a reason", async () => {
  const checkedAt = "2026-09-09T12:00:00Z";
  const enabled = await validatePublicationCandidate({
    load: async () => fixture(),
    readApprovedImage: imageFile,
    verifyPublishingAccess: async () => ({
      state: "enabled", message: "ok", identity: { topicId: "topic", igUserId: "account", connectionVersion: "connection-1" },
      apiVersion: "v21.0", checkedAt, expiresAt: checkedAt,
      quota: { used: 2, total: 25, remaining: 23, durationSeconds: 86400 },
    }),
  });
  assert.equal(enabled.state, "ready");
  assert.deepEqual(enabled.blockers, []);
  assert.equal(enabled.publishingAccess?.quota?.remaining, 23);

  const missing = await validatePublicationCandidate({
    load: async () => fixture(),
    readApprovedImage: imageFile,
    verifyPublishingAccess: async () => ({
      state: "missing-permission", message: "Publishing access is missing or denied.",
      identity: { topicId: "topic", igUserId: "account", connectionVersion: "connection-1" },
      apiVersion: "v21.0", checkedAt, expiresAt: checkedAt,
    }),
  });
  assert.equal(missing.state, "candidate");
  assert.equal(missing.blockers[0].code, "publishing-access-missing-permission");

  const errored = await validatePublicationCandidate({
    load: async () => fixture(),
    readApprovedImage: imageFile,
    verifyPublishingAccess: async () => { throw new Error("meta 503"); },
  });
  assert.equal(errored.state, "candidate");
  assert.equal(errored.blockers[0].code, "publishing-access-unavailable");
  assert.doesNotMatch(JSON.stringify(errored), /meta 503/);
});

test("partial approval, changed revision, incomplete selection and changed text block candidacy", () => {
  for (const [change, code] of [
    [(i: CandidateInputs) => { i.draft.status = "draft"; }, "draft-approval"],
    [(i: CandidateInputs) => { i.batch.assets[0].status = "generated"; }, "image-approval"],
    [(i: CandidateInputs) => { i.draft.version++; }, "stale-batch"],
    [(i: CandidateInputs) => { i.draft.inputIsCurrent = false; }, "stale-input"],
    [(i: CandidateInputs) => { i.batch.assets = []; }, "incomplete-selection"],
    [(i: CandidateInputs) => { i.draft.units = [{ ...i.draft.units[0], headline: "Changed" }]; }, "image-text-changed"],
  ] as const) {
    const input = fixture(); change(input);
    assert.ok(editorialCandidateBlockers(input.draft, input.batch, input.sourceToken).some(b => b.code === code), code);
  }
});

test("documentary script approval never substitutes for final joint review, and source changes invalidate it", () => {
  const input = fixture(); input.batch.provider = DOCUMENTARY_PROVIDER;
  const snapshot = { version: DOCUMENTARY_VERSION, inputHash: "input", sourceToken: "source", reasons: [], representation: "typography" };
  Object.assign(input.batch.assets[0].unitSnapshot, { documentary: snapshot });
  assert.ok(editorialCandidateBlockers(input.draft, input.batch, "source").some(b => b.code === "documentary-final-approval"));
  Object.assign(snapshot, { review: { decision: "approved", actor: "Editor", at: "2026-09-01T12:00:00Z" } });
  assert.deepEqual(editorialCandidateBlockers(input.draft, input.batch, "source"), []);
  assert.ok(editorialCandidateBlockers(input.draft, input.batch, "changed-source").some(b => b.code === "documentary-stale"));
});

test("destination distinguishes disconnected, expired and permission absent without assuming insights implies publishing", () => {
  const { destination } = fixture();
  assert.equal(destinationBlockers({ ...destination, connected: false })[0].code, "destination-disconnected");
  assert.equal(destinationBlockers({ ...destination, expired: true })[0].code, "destination-reconnect");
  assert.equal(destinationBlockers({ ...destination, hasPublishingPermission: false })[0].code, "publishing-permission");
});

test("unapproved files are never read and private read errors are sanitized", async () => {
  const input = fixture(); input.draft.status = "draft";
  let reads = 0;
  const deps = { load: async () => input, readApprovedImage: async () => { reads++; throw new Error("SECRET signed URL"); } };
  assert.equal((await validatePublicationCandidate(deps)).state, "not-candidate"); assert.equal(reads, 0);
  input.draft.status = "approved";
  const result = await validatePublicationCandidate(deps);
  assert.equal(result.state, "not-candidate"); assert.equal(reads, 1);
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
  assert.ok(result.blockers.some(b => b.code === "image-validation"));
});

test("changes to approval, account, policy or asset during file reads invalidate the result", async () => {
  for (const mutate of [
    (i: CandidateInputs) => { i.draft.status = "draft"; },
    (i: CandidateInputs) => { i.destination.igUserId = "replacement"; },
    (i: CandidateInputs) => { i.destination.connectionVersion = "reconnected"; },
    (i: CandidateInputs) => { i.sourceToken = "new-policy"; },
    (i: CandidateInputs) => { i.batch.assets[0].version++; },
  ]) {
    const input = fixture();
    const result = await validatePublicationCandidate({ load: async () => structuredClone(input), readApprovedImage: async () => { mutate(input); return imageFile(); } });
    assert.equal(result.state, "not-candidate");
    assert.ok(result.blockers.some(b => b.code === "snapshot-changed"));
  }
});

test("identities are stable across object key order and change with copy or destination", () => {
  assert.equal(publicationSnapshotHash({ a: 1, b: 2 }), publicationSnapshotHash({ b: 2, a: 1 }));
  const input = fixture(); const before = publicationSnapshotHash(input);
  input.draft.caption += " "; assert.notEqual(publicationSnapshotHash(input), before);
});

test("file metadata is verified rather than trusting stored dimensions", async () => {
  const result = await validatePublicationCandidate({ load: async () => fixture(), readApprovedImage: async () => {
    const bytes = await sharp({ create: { width: 100, height: 100, channels: 3, background: "white" } }).png().toBuffer();
    return new File([new Uint8Array(bytes)], "wrong.png");
  } });
  assert.equal(result.state, "not-candidate");
  assert.ok(result.blockers.some(b => b.code === "image-format"));
});

test("documentary photograph with expired usage evidence blocks candidacy", () => {
  const input = fixture(); input.batch.provider = DOCUMENTARY_PROVIDER;
  Object.assign(input.batch.assets[0].unitSnapshot, { documentary: {
    version: DOCUMENTARY_VERSION, inputHash: "input", sourceToken: "source", reasons: [], representation: "photo",
    review: { decision: "approved", actor: "Editor", at: "2026-09-01T12:00:00Z" },
    places: [], photo: { retrievedAt: "2020-01-01T00:00:00Z" },
  } });
  assert.ok(editorialCandidateBlockers(input.draft, input.batch, "source").some(b => b.code === "usage-rights"));
});

test("repeated validation preserves identity and original approval state", async () => {
  const input = fixture(); const original = structuredClone(input);
  const deps = { load: async () => structuredClone(input), readApprovedImage: imageFile };
  assert.equal((await validatePublicationCandidate(deps)).snapshotHash, (await validatePublicationCandidate(deps)).snapshotHash);
  assert.deepEqual(input, original);
});
