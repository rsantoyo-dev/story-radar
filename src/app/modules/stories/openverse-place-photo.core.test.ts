import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { eligiblePhoto, type PhotoEvidence, type PlaceEvidence } from "./creative-documentary";
import { openverseCandidates, openverseSearchUrl, parsePlacePhotoReview, titleNamesPlace } from "./openverse-place-photo.core";

const result = (overrides: Record<string, unknown> = {}) => ({
  id: "ov-1", title: "Austin Zoo", creator: "joejungmann", license: "by", license_version: "2.0",
  license_url: "https://creativecommons.org/licenses/by/2.0/", source: "flickr", provider: "flickr", mature: false, unstable__sensitivity: [],
  width: 1024, height: 683, url: "https://live.staticflickr.com/1/1_b.jpg", foreign_landing_url: "https://www.flickr.com/photos/someone/1",
  ...overrides,
});

describe("Openverse place photos", () => {
  it("searches the exact name as a phrase, only among licenses that allow commercial reuse and changes", () => {
    const url = openverseSearchUrl('Austin "Zoo"');
    assert.equal(url.origin + url.pathname, "https://api.openverse.org/v1/images/");
    assert.equal(url.searchParams.get("q"), '"Austin Zoo"');
    assert.equal(url.searchParams.get("license_type"), "commercial,modification");
  });

  it("matches the place name as whole words of the title", () => {
    assert.equal(titleNamesPlace("Lion at the Austin Zoo", "Austin Zoo"), true);
    assert.equal(titleNamesPlace("Musée d'Art de Joliette, façade", "Musee d'art de Joliette"), true);
    assert.equal(titleNamesPlace("Austin Zookeeper day", "Austin Zoo"), false);
    assert.equal(titleNamesPlace("Brookfield Zoo", "Austin Zoo"), false);
  });

  it("keeps only reusable, safe, large enough photos that name the place, closest title first", () => {
    const response = { results: [
      result({ id: "lion", title: "Lion at the Austin Zoo" }),
      result({ id: "exact", title: "Austin Zoo" }),
      result({ id: "nc", license: "by-nc", license_url: "https://creativecommons.org/licenses/by-nc/2.0/" }),
      result({ id: "other-place", title: "Brookfield Zoo 2013" }),
      result({ id: "mature", mature: true }),
      result({ id: "sensitive", unstable__sensitivity: ["user_reported_sensitive"] }),
      result({ id: "small", width: 640, height: 480 }),
      result({ id: "no-author", creator: "" }),
      result({ id: "other-host", url: "https://example.com/zoo.jpg" }),
      result({ id: "other-source", source: "smithsonian" }),
    ] };
    const candidates = openverseCandidates(response, "Austin Zoo", 5);
    assert.deepEqual(candidates.map((candidate) => candidate.id), ["exact", "lion"]);
    assert.equal(candidates[0]!.license, "CC BY 2.0");
    assert.equal(openverseCandidates(response, "Austin Zoo", 1).length, 1);
    // CC0 and the Public Domain Mark need no author.
    const publicDomain = openverseCandidates({ results: [result({ creator: "", license: "pdm", license_url: "https://creativecommons.org/publicdomain/mark/1.0/" })] }, "Austin Zoo");
    assert.equal(publicDomain[0]?.license, "Public domain");
    assert.deepEqual(openverseCandidates({ detail: "throttled" }, "Austin Zoo"), []);
  });

  it("accepts a photo only when the visual check confirms the place itself, with no people or overlays", () => {
    const verdict = (overrides: Record<string, unknown>) => JSON.stringify({ showsPlace: true, consistentWithPlace: true, peopleAsSubject: false, watermarkOrOverlay: false, summary: "The zoo entrance.", ...overrides });
    assert.deepEqual(parsePlacePhotoReview(verdict({})), { accepted: true, summary: "The zoo entrance." });
    for (const reject of [{ showsPlace: false }, { consistentWithPlace: false }, { peopleAsSubject: true }, { watermarkOrOverlay: true }, { showsPlace: "yes" }]) {
      assert.equal(parsePlacePhotoReview(verdict(reject)).accepted, false, JSON.stringify(reject));
    }
    assert.equal(parsePlacePhotoReview("not json").accepted, false);
  });

  it("an Openverse identity reference may be smaller than a printed Commons photo, but only once reviewed", () => {
    const place = { id: "Q1" } as PlaceEvidence;
    const photo: PhotoEvidence = { placeId: "Q1", provider: "openverse", sourceUrl: "https://www.flickr.com/photos/someone/1", resourceUrl: "https://live.staticflickr.com/1/1_b.jpg",
      author: "joejungmann", license: "CC BY 2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/", attribution: "joejungmann · CC BY 2.0",
      captureDate: null, retrievedAt: new Date().toISOString(), sha256: "a".repeat(64), width: 1024, height: 683, contentType: "image/jpeg",
      review: { model: "gpt-test", version: "place-photo-review-v1", summary: "The zoo entrance." } };
    assert.equal(eligiblePhoto(photo, place), true);
    assert.equal(eligiblePhoto({ ...photo, review: undefined }, place), false, "an unreviewed Openverse photo is never eligible");
    assert.equal(eligiblePhoto({ ...photo, width: 800, height: 600 }, place), false);
    assert.equal(eligiblePhoto({ ...photo, provider: undefined }, place), false, "a Commons photo still needs 1080 × 640");
  });
});
