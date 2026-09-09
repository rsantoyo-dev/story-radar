import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertPublishableImage,
  computePackageHash,
  describeImageTransform,
  getMetaImageLimits,
  newDeliveryToken,
  PublicationPackageValidationError,
  resolvePublicationMediaType,
} from "./instagram-publication-package";

const LIMITS = getMetaImageLimits();

test("assertPublishableImage: exact 1080x1350 jpeg within the byte cap passes", () => {
  assert.doesNotThrow(() =>
    assertPublishableImage({ width: 1080, height: 1350, byteSize: 900_000, format: "jpeg" }),
  );
});

test("assertPublishableImage: rejects wrong ratio, oversize and bad format with a reason", () => {
  assert.throws(
    () => assertPublishableImage({ width: 1080, height: 1080, byteSize: 100, format: "jpeg" }),
    (e: unknown) => e instanceof PublicationPackageValidationError && /1080×1350/.test((e as Error).message),
  );
  assert.throws(
    () => assertPublishableImage({ width: 1080, height: 1350, byteSize: LIMITS.maxBytes + 1, format: "jpeg" }),
    (e: unknown) => e instanceof PublicationPackageValidationError && /Instagram allows up to/.test((e as Error).message),
  );
  assert.throws(
    () => assertPublishableImage({ width: 1080, height: 1350, byteSize: 100, format: "gif" }),
    (e: unknown) => e instanceof PublicationPackageValidationError && /format gif/.test((e as Error).message),
  );
  assert.throws(
    () => assertPublishableImage({ width: 1080, height: 1350, byteSize: 0, format: "jpeg" }),
    PublicationPackageValidationError,
  );
});

test("resolvePublicationMediaType: 1 → image, 2..10 → carousel, else error", () => {
  assert.equal(resolvePublicationMediaType(1), "image");
  assert.equal(resolvePublicationMediaType(2), "carousel");
  assert.equal(resolvePublicationMediaType(10), "carousel");
  assert.throws(() => resolvePublicationMediaType(0), PublicationPackageValidationError);
  assert.throws(
    () => resolvePublicationMediaType(11),
    (e: unknown) => e instanceof PublicationPackageValidationError && /2–10 images/.test((e as Error).message),
  );
});

test("computePackageHash is stable and order- and content-sensitive", () => {
  const base = {
    caption: "Exact caption",
    hashtags: ["#a", "#b"],
    orderedSlideSha256: ["h1", "h2", "h3"],
    igUserId: "1789",
    connectionVersion: "c1",
  };
  assert.equal(computePackageHash(base), computePackageHash({ ...base }));
  assert.notEqual(
    computePackageHash(base),
    computePackageHash({ ...base, orderedSlideSha256: ["h2", "h1", "h3"] }),
  );
  assert.notEqual(computePackageHash(base), computePackageHash({ ...base, caption: "Edited" }));
  assert.notEqual(computePackageHash(base), computePackageHash({ ...base, connectionVersion: "c2" }));
});

test("newDeliveryToken is URL-safe and unguessable-length", () => {
  const token = newDeliveryToken();
  assert.match(token, /^[A-Za-z0-9_-]{32}$/);
  assert.notEqual(newDeliveryToken(), newDeliveryToken());
});

test("describeImageTransform: encoding is a note, a resize is a block", () => {
  assert.match(describeImageTransform({ sourceFormat: "png", resized: false, quality: 90 }), /PNG → JPEG q90/);
  assert.match(describeImageTransform({ sourceFormat: "jpeg", resized: false, quality: 90 }), /JPEG re-encoded at q90/);
  assert.match(describeImageTransform({ sourceFormat: "png", resized: true, quality: 90 }), /^BLOCKED:/);
});
