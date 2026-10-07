import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { identityMissing, topicSetupStatus, type TopicSetupSignals } from "./topic-setup.core";

const fresh: TopicSetupSignals = {
  identityConfirmedAt: null, completedAt: null, hasLogo: false, audience: "General readers", language: "English", paletteColors: 5,
  rssSources: 0, aiResearchEnabled: false, documents: 0, facebookPage: false, instagramDirect: false,
};

describe("guided brand setup", () => {
  it("starts a new brand at identity, even with a filled default profile", () => {
    const status = topicSetupStatus(fresh);
    assert.equal(status.nextStep, "identity");
    assert.deepEqual(status.identity.missing, ["Upload the brand logo."]);
    assert.equal(status.readyToComplete, false);
  });

  it("names everything an identity still lacks", () => {
    assert.deepEqual(identityMissing({ hasLogo: false, audience: " ", language: "", paletteColors: 1 }), [
      "Choose the publication language.", "Describe the audience.", "Choose at least two brand colors.", "Upload the brand logo.",
    ]);
  });

  it("walks identity, then sources, then channels, then the final confirmation", () => {
    const identity = { ...fresh, hasLogo: true, identityConfirmedAt: "2026-10-07T12:00:00Z" };
    assert.equal(topicSetupStatus(identity).nextStep, "sources");
    const sources = { ...identity, aiResearchEnabled: true };
    assert.equal(topicSetupStatus(sources).sources.count, 1);
    assert.equal(topicSetupStatus(sources).nextStep, "channels");
    const channels = { ...sources, instagramDirect: true };
    assert.equal(topicSetupStatus(channels).channels.via, "instagram");
    assert.equal(topicSetupStatus(channels).nextStep, "finish");
    assert.equal(topicSetupStatus(channels).readyToComplete, true);
    assert.equal(topicSetupStatus({ ...channels, completedAt: "2026-10-07T13:00:00Z" }).nextStep, "done");
  });

  it("does not count a confirmed identity that lost its logo", () => {
    const status = topicSetupStatus({ ...fresh, identityConfirmedAt: "2026-10-07T12:00:00Z" });
    assert.equal(status.identity.confirmed, true);
    assert.equal(status.identity.done, false);
    assert.equal(status.nextStep, "identity");
  });

  it("counts feeds, documents and AI research as sources, and prefers the Facebook Page channel", () => {
    const status = topicSetupStatus({ ...fresh, rssSources: 2, documents: 1, aiResearchEnabled: true, facebookPage: true, instagramDirect: true });
    assert.equal(status.sources.count, 4);
    assert.equal(status.channels.via, "facebook");
  });
});
