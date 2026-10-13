import assert from "node:assert/strict";
import test from "node:test";

import { commonsPhotoRights, commonsPortraitTerms, documentaryPhotoLicense, eligiblePhoto, photoNeedsAuthor, portraitPhotoLicense } from "./creative-documentary";

test("portrait photos accept the reusable CC licenses Commons portraits actually use", () => {
  assert.deepEqual(portraitPhotoLicense("https://creativecommons.org/licenses/by/2.0"), { license: "CC BY 2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/" });
  assert.equal(portraitPhotoLicense("https://creativecommons.org/licenses/by-sa/3.0/")?.license, "CC BY-SA 3.0");
  assert.equal(portraitPhotoLicense("https://creativecommons.org/licenses/by/4.0/deed.fr")?.license, "CC BY 4.0");
  assert.equal(portraitPhotoLicense("https://creativecommons.org/publicdomain/zero/1.0/")?.license, "CC0");
  assert.equal(portraitPhotoLicense("https://creativecommons.org/publicdomain/mark/1.0/")?.license, "Public domain");
});

test("portrait photos reject licenses that forbid reuse or modification-free credit terms", () => {
  for (const url of [
    "https://creativecommons.org/licenses/by-nc/4.0/",
    "https://creativecommons.org/licenses/by-nd/2.0/",
    "https://creativecommons.org/licenses/by-nc-sa/3.0/",
    "https://example.com/licenses/by/4.0/",
    "",
  ]) assert.equal(portraitPhotoLicense(url), undefined, url);
});

test("the place-photo license rule is unchanged (4.0 and CC0 only)", () => {
  assert.equal(documentaryPhotoLicense("https://creativecommons.org/licenses/by/2.0"), undefined);
  assert.equal(documentaryPhotoLicense("https://creativecommons.org/licenses/by/4.0")?.license, "CC BY 4.0");
});

test("Commons rights accept public-domain files and older CC versions, for people and places alike", () => {
  assert.deepEqual(commonsPhotoRights({ licenseUrl: "", license: "pd", licenseShortName: "Public domain" }),
    { license: "Public domain", licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/" });
  assert.equal(commonsPhotoRights({ licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0", license: "cc-by-sa-3.0", licenseShortName: "CC BY-SA 3.0" })?.license, "CC BY-SA 3.0");
  assert.equal(commonsPhotoRights({ licenseUrl: "https://creativecommons.org/licenses/by-nc/2.0/", license: "cc-by-nc-2.0", licenseShortName: "CC BY-NC 2.0" }), undefined);
  assert.equal(commonsPhotoRights({ licenseUrl: "", license: "", licenseShortName: "" }), undefined, "no license at all is never assumed public domain");
  assert.equal(photoNeedsAuthor("Public domain"), false);
  assert.equal(photoNeedsAuthor("CC BY 2.0"), true);
});

test("a verified place photo may be public domain without an author, but a CC BY photo still needs one", () => {
  const place = { id: "Q2219226" } as Parameters<typeof eligiblePhoto>[1];
  const base = { placeId: "Q2219226", sourceUrl: "https://commons.wikimedia.org/wiki/File:M.jpg", resourceUrl: "https://upload.wikimedia.org/wikipedia/commons/m.jpg",
    width: 2240, height: 1680, sha256: "a".repeat(64), retrievedAt: new Date().toISOString(), attribution: "credit", contentType: "image/jpeg",
    creditUrl: "https://commons.wikimedia.org/?curid=1", captureDate: null } as unknown as Parameters<typeof eligiblePhoto>[0];
  assert.ok(eligiblePhoto({ ...base, license: "Public domain", licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/", author: "Unknown author" }, place));
  assert.ok(eligiblePhoto({ ...base, license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/", author: "Pierre Bona" }, place));
  assert.ok(!eligiblePhoto({ ...base, license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/", author: " " }, place));
  assert.ok(!eligiblePhoto({ ...base, license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by-nc/4.0/", author: "X" }, place), "the stored license must match its URL");
});

test("a Commons portrait: the Permission field never keeps it out, a personality-rights warning travels to the editor, other restrictions and small files do", () => {
  const meta = (overrides: Partial<Parameters<typeof commonsPortraitTerms>[0]> = {}) => ({
    licenseUrl: "https://creativecommons.org/licenses/by/2.0", license: "cc-by-2.0", licenseShortName: "CC BY 2.0", restrictions: "", artist: "abdallahh", ...overrides,
  });
  // Patrice Bernier.jpg: CC BY 2.0 from Flickr, its Permission field the Flickr review, 494 px wide.
  assert.deepEqual(commonsPortraitTerms(meta(), { width: 494, height: 901, bytes: 395_359 }), { license: "CC BY 2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/", author: "abdallahh" });
  // Anthony Kavanagh 2012.jpg: CC BY-SA 3.0 with Commons' personality-rights warning.
  assert.deepEqual(commonsPortraitTerms(meta({ licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0", license: "cc-by-sa-3.0", licenseShortName: "CC BY-SA 3.0", restrictions: "personality", artist: "<a href=\"x\">Georges Biard</a>" }), { width: 720, height: 619, bytes: 82_442 }),
    { license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/", author: "Georges Biard", personalityRights: true });
  assert.equal(commonsPortraitTerms(meta({ restrictions: "personality|trademarked" }), { width: 800, height: 1000, bytes: 1 }), undefined, "any other restriction keeps it out");
  assert.equal(commonsPortraitTerms(meta(), { width: 479, height: 900, bytes: 1 }), undefined, "below the narrowest portrait frame");
  assert.equal(commonsPortraitTerms(meta(), { width: Number.NaN, height: 900, bytes: 1 }), undefined, "a file without its size cannot be judged");
  assert.equal(commonsPortraitTerms(meta({ artist: "No machine-readable author provided." }), { width: 800, height: 1000, bytes: 1 }), undefined, "CC BY needs its author");
  assert.equal(commonsPortraitTerms(meta({ licenseUrl: "", license: "pd", licenseShortName: "Public domain", artist: "" }), { width: 800, height: 1000, bytes: 1 })?.author, "Unknown author", "the public domain needs none");
  assert.equal(commonsPortraitTerms(meta({ licenseUrl: "https://creativecommons.org/licenses/by-nc/2.0", licenseShortName: "CC BY-NC 2.0" }), { width: 800, height: 1000, bytes: 1 }), undefined);
});
