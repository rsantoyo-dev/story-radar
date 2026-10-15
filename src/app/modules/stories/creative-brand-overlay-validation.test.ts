import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS } from "./creative-content.types";
import {
  CreativeBrandOverlayValidationError,
  parseCreativeBrandOverlayInput,
  parseCreativeBrandOverlaySettings,
} from "./creative-brand-overlay-validation";

const ASSET_ID = "5b7be8b4-bf0f-4d19-99f1-4f34c2672217";

test("brand overlay input defaults to a disabled first-unit overlay", () => {
  assert.deepEqual(
    parseCreativeBrandOverlayInput(undefined),
    DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS,
  );
});

test("brand overlay input keeps only validated settings and the asset ID", () => {
  assert.deepEqual(
    parseCreativeBrandOverlayInput({
      ...DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS,
      enabled: true,
      assetId: ASSET_ID.toUpperCase(),
      asset: { objectKey: "must-not-cross-the-boundary" },
      backdropColor: "#f6f0e4",
    }),
    {
      ...DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS,
      enabled: true,
      assetId: ASSET_ID,
      backdropColor: "#F6F0E4",
    },
  );
});

test("enabled brand overlays require an asset ID", () => {
  assert.throws(
    () =>
      parseCreativeBrandOverlayInput({
        ...DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS,
        enabled: true,
      }),
    CreativeBrandOverlayValidationError,
  );
});

test("brand overlay settings enforce backend geometry limits", () => {
  assert.throws(
    () =>
      parseCreativeBrandOverlaySettings({
        ...DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS,
        sizePercent: 41,
      }),
    /brandOverlay\.sizePercent must be an integer from 5 to 40/,
  );
  assert.throws(
    () =>
      parseCreativeBrandOverlaySettings({
        ...DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS,
        insetPercent: -1,
      }),
    /brandOverlay\.insetPercent must be an integer from 0 to 20/,
  );
});

test("logo versions keep each uploaded PNG once, with its form and the backgrounds it suits", () => {
  const other = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const parsed = parseCreativeBrandOverlayInput({
    ...DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS,
    enabled: true,
    assetId: ASSET_ID,
    innerForm: "symbol",
    mainTone: "positive",
    versions: [
      { assetId: other.toUpperCase(), form: "symbol", tone: "negative", asset: { objectKey: "must-not-cross-the-boundary" } },
      { assetId: other, form: "full", tone: "positive" },
      { assetId: ASSET_ID, form: "full", tone: "positive" },
    ],
  });
  assert.deepEqual(parsed.versions, [
    { assetId: other, form: "symbol", tone: "negative" },
    { assetId: ASSET_ID, form: "full", tone: "positive" },
  ]);
  assert.equal(parsed.innerForm, "symbol");
  assert.equal(parsed.mainTone, "positive");
});

test("a profile without logo versions saves none, as before", () => {
  const parsed = parseCreativeBrandOverlaySettings({ ...DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS, versions: [], innerForm: null, mainTone: null });
  assert.equal("versions" in parsed, false);
  assert.equal("innerForm" in parsed, false);
  assert.equal("mainTone" in parsed, false);
});

test("logo versions refuse an unknown form or tone, a missing PNG and more than eight", () => {
  const settings = { ...DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS };
  assert.throws(() => parseCreativeBrandOverlaySettings({ ...settings, versions: [{ assetId: ASSET_ID, form: "badge", tone: "alpha" }] }), CreativeBrandOverlayValidationError);
  assert.throws(() => parseCreativeBrandOverlaySettings({ ...settings, versions: [{ assetId: ASSET_ID, form: "full", tone: "dark" }] }), CreativeBrandOverlayValidationError);
  assert.throws(() => parseCreativeBrandOverlaySettings({ ...settings, versions: [{ form: "full", tone: "alpha" }] }), CreativeBrandOverlayValidationError);
  assert.throws(() => parseCreativeBrandOverlaySettings({ ...settings, innerForm: "wordmark" }), CreativeBrandOverlayValidationError);
  assert.throws(() => parseCreativeBrandOverlaySettings({ ...settings, mainTone: "dark" }), CreativeBrandOverlayValidationError);
  const many = Array.from({ length: 9 }, (_, index) => ({ assetId: `5b7be8b4-bf0f-4d19-99f1-4f34c267221${index}`, form: "full", tone: "alpha" }));
  assert.throws(() => parseCreativeBrandOverlaySettings({ ...settings, versions: many }), CreativeBrandOverlayValidationError);
});
