import assert from "node:assert/strict";
import test from "node:test";

import { dashboardViewFromHash } from "./dashboard-navigation";

test("daily and brand destinations resolve to the intended view", () => {
  assert.equal(dashboardViewFromHash("#today"), "today");
  assert.equal(dashboardViewFromHash("#discover"), "discover");
  assert.equal(dashboardViewFromHash("#discover/search"), "discover");
  assert.equal(dashboardViewFromHash("#production"), "production");
  assert.equal(dashboardViewFromHash("#publications/history"), "publications");
  assert.equal(dashboardViewFromHash("#results"), "results");
  assert.equal(dashboardViewFromHash("#identity"), "identity");
  assert.equal(dashboardViewFromHash("#strategy/lines"), "strategy");
  assert.equal(dashboardViewFromHash("#sources/documents"), "sources");
  assert.equal(dashboardViewFromHash("#channels"), "channels");
  assert.equal(dashboardViewFromHash("#admin"), "admin");
});

test("old bookmarks keep their editorial destination", () => {
  assert.equal(dashboardViewFromHash("#overview"), "today");
  assert.equal(dashboardViewFromHash("#configuration"), "topics");
  assert.equal(dashboardViewFromHash("#stories/collected"), "discover");
  assert.equal(dashboardViewFromHash("#collect"), "discover");
  assert.equal(dashboardViewFromHash("#stories/selected/unpublished"), "production");
  assert.equal(dashboardViewFromHash("#editorial-creative"), "identity");
  assert.equal(dashboardViewFromHash("#creative-profile-voice"), "identity");
  assert.equal(dashboardViewFromHash("#editorial-meta"), "channels");
  assert.equal(dashboardViewFromHash("#editorial-instagram"), "publications");
  assert.equal(dashboardViewFromHash("#settings"), "admin");
});
