import assert from "node:assert/strict";
import test from "node:test";

import {
  appendCreativeImageSpatialContracts,
  creativeImageModelVisibleText,
} from "./creative-image-prompt-contracts";
import { buildCreativeBrandExclusionZonePrompt } from "./creative-brand-overlay";
import { buildCreativeCarouselChrome } from "./creative-carousel-chrome";

test("sends the optional subheadline to the image model but not carousel chrome copy", () => {
  const unit = {
    headline: "The headline",
    subheadline: "Distinct supporting context",
    body: "The evidence.",
    ctaQuestion: "What changed?",
    continuationCue: "The detail on the next slide",
  };
  const visibleText = creativeImageModelVisibleText(unit);

  assert.equal(
    visibleText,
    [
      "The headline",
      "Distinct supporting context",
      "The evidence.",
      "What changed?",
    ].join("\n"),
  );
  assert.doesNotMatch(
    visibleText,
    /swipe|desliza|continuation|detail on the next slide/iu,
  );
});

test("keeps the logo contract before the final carousel reservation", () => {
  const brandContract = buildCreativeBrandExclusionZonePrompt({
    brandOverlay: {
      enabled: true,
      scope: "all-units",
      placement: "bottom-right",
      sizePercent: 18,
      insetPercent: 5,
      backdropMode: "solid",
      backdropColor: "#F6F0E4",
      backdropOpacity: 95,
      assetId: "logo",
      asset: {
        id: "logo",
        fileName: "logo.png",
        contentType: "image/png",
        fileSize: 1_024,
        width: 400,
        height: 100,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    },
    unitOrder: 1,
    aspectRatio: "4:5",
  });
  const carouselContract = buildCreativeCarouselChrome({
    aspectRatio: "4:5",
    unitOrder: 1,
    totalSlides: 5,
    logoExclusionZone: { left: 778, top: 1194, width: 302, height: 156 },
  }).promptReservation;
  const prompt = appendCreativeImageSpatialContracts({
    prompt: "BASE",
    brandContract,
    carouselContract,
  });

  assert.match(
    brandContract ?? "",
    /only outside any separately reserved pagination badge/iu,
  );
  assert.ok(
    prompt.indexOf("<BRAND_OVERLAY_CONTRACT>") <
      prompt.indexOf("<CAROUSEL_CHROME_CONTRACT>"),
  );
  assert.ok(prompt.endsWith("</CAROUSEL_CHROME_CONTRACT>"));
});
