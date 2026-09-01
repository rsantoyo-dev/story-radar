import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import {
  appendCreativeBrandContract,
  buildCreativeBrandExclusionZonePrompt,
  compositeCreativeBrandOverlay,
  compositeCreativeBrandOverlaySnapshot,
  computeCreativeBrandOverlayGeometry,
  creativeBrandInputHash,
  creativeImageTextQualityInstruction,
  shouldApplyCreativeBrandOverlay,
} from "./creative-brand-overlay";
import type {
  CreativeAspectRatio,
  CreativeBrandOverlay,
  CreativeBrandOverlaySettings,
  CreativeBrandOverlaySnapshot,
  CreativeBrandPlacement,
} from "./creative-content.types";

test("computes all nine placement anchors", () => {
  const expectedByPlacement = {
    "top-left": { left: 40, top: 40 },
    "top-center": { left: 408, top: 40 },
    "top-right": { left: 776, top: 40 },
    "center-left": { left: 40, top: 368 },
    center: { left: 408, top: 368 },
    "center-right": { left: 776, top: 368 },
    "bottom-left": { left: 40, top: 696 },
    "bottom-center": { left: 408, top: 696 },
    "bottom-right": { left: 776, top: 696 },
  } as const;

  for (const [placement, expected] of Object.entries(expectedByPlacement)) {
    const geometry = computeCreativeBrandOverlayGeometry({
      settings: brandSettings({
        placement: placement as CreativeBrandPlacement,
      }),
      canvasWidth: 1000,
      canvasHeight: 800,
      logoWidth: 400,
      logoHeight: 100,
    });

    assert.deepEqual(geometry.occupied, {
      ...expected,
      width: 184,
      height: 64,
    });
    assert.deepEqual(geometry.logo, {
      left: expected.left + 12,
      top: expected.top + 12,
      width: 160,
      height: 40,
    });
    assert.deepEqual(geometry.backdrop, {
      ...expected,
      width: 184,
      height: 64,
      radius: 10,
    });
  }
});

test("fits both wide and vertical logos inside the configured short-edge size", () => {
  const geometry = computeCreativeBrandOverlayGeometry({
    settings: brandSettings({ placement: "center", backdropMode: "none" }),
    canvasWidth: 1000,
    canvasHeight: 800,
    logoWidth: 100,
    logoHeight: 400,
  });

  assert.deepEqual(
    { width: geometry.logo.width, height: geometry.logo.height },
    { width: 40, height: 160 },
  );
});

test("applies first-unit and all-units scopes deterministically", () => {
  const firstUnit = brandSettings({ scope: "first-unit" });
  const allUnits = brandSettings({ scope: "all-units" });

  assert.equal(shouldApplyCreativeBrandOverlay(firstUnit, 1), true);
  assert.equal(shouldApplyCreativeBrandOverlay(firstUnit, 2), false);
  assert.equal(shouldApplyCreativeBrandOverlay(allUnits, 1), true);
  assert.equal(shouldApplyCreativeBrandOverlay(allUnits, 7), true);
  assert.equal(
    shouldApplyCreativeBrandOverlay({ ...allUnits, enabled: false }, 1),
    false,
  );
  assert.equal(shouldApplyCreativeBrandOverlay(allUnits, 0), false);
});

test("changes the image-batch identity when the asset or placement changes", () => {
  const base = {
    settings: brandSettings(),
    assetId: "brand-asset-1",
    assetSha256: "a".repeat(64),
  };
  const hash = creativeBrandInputHash(base);

  assert.equal(hash.length, 64);
  assert.equal(
    hash,
    "aa82096bfba50841150f73c6f0debf99072c30b86af10a1f985aabb28bae74a7",
  );
  assert.equal(creativeBrandInputHash(base), hash);
  assert.notEqual(
    creativeBrandInputHash({
      ...base,
      settings: brandSettings({ placement: "bottom-right" }),
    }),
    hash,
  );
  assert.notEqual(
    creativeBrandInputHash({ ...base, assetSha256: "b".repeat(64) }),
    hash,
  );
});

test("builds a ratio-aware safe-zone prompt and forbids model-rendered logos", () => {
  const brandOverlay = publicBrandOverlay();
  const prompt = buildCreativeBrandExclusionZonePrompt({
    brandOverlay,
    unitOrder: 1,
    aspectRatio: "4:5",
  });

  assert.ok(prompt);
  assert.match(prompt, /<BRAND_OVERLAY_CONTRACT>/u);
  assert.match(prompt, /<\/BRAND_OVERLAY_CONTRACT>/u);
  assert.match(prompt, /at top-left/iu);
  assert.match(prompt, /x=0-334px and y=0-198px/iu);
  assert.match(prompt, /5% short-edge safety buffer/iu);
  assert.match(prompt, /PROPORTIONAL TOP-LEFT CORNER SLOT/iu);
  assert.match(prompt, /x=0-334px and y=0-198px/iu);
  assert.match(prompt, /adjacent right lane x=334-1080px/iu);
  assert.match(
    prompt,
    /Below y=198px, the normal full-width content region is available/iu,
  );
  assert.doesNotMatch(prompt, /\bRAIL\b/iu);
  assert.match(prompt, /#F6F0E4 backdrop at 95% opacity/iu);
  assert.match(prompt, /Do not render, imitate, spell, approximate, or imply/iu);
  assert.match(prompt, /exact approved alpha PNG will be composited afterward/iu);
});

test("turns all nine logo positions into proportional content slots", () => {
  const cases: Array<{
    placement: CreativeBrandPlacement;
    expected: RegExp;
  }> = [
    {
      placement: "top-left",
      expected: /TOP-LEFT CORNER SLOT.*x=0-334px and y=0-198px.*right lane x=334-1080px/iu,
    },
    {
      placement: "top-center",
      expected: /TOP-CENTER SLOT.*x=373-707px and y=0-198px.*left lane x=0-373px or right lane x=707-1080px/iu,
    },
    {
      placement: "top-right",
      expected: /TOP-RIGHT CORNER SLOT.*x=746-1080px and y=0-198px.*left lane x=0-746px/iu,
    },
    {
      placement: "bottom-left",
      expected: /BOTTOM-LEFT CORNER SLOT.*x=0-334px and y=1152-1350px.*right lane x=334-1080px/iu,
    },
    {
      placement: "bottom-center",
      expected: /BOTTOM-CENTER SLOT.*x=373-707px and y=1152-1350px.*left lane x=0-373px or right lane x=707-1080px/iu,
    },
    {
      placement: "bottom-right",
      expected: /BOTTOM-RIGHT CORNER SLOT.*x=746-1080px and y=1152-1350px.*left lane x=0-746px/iu,
    },
    {
      placement: "center-left",
      expected: /CENTER-LEFT SLOT.*x=0-334px and y=576-774px.*right lane x=334-1080px/iu,
    },
    {
      placement: "center-right",
      expected: /CENTER-RIGHT SLOT.*x=746-1080px and y=576-774px.*left lane x=0-746px/iu,
    },
    {
      placement: "center",
      expected: /CENTER SLOT.*x=373-707px and y=576-774px.*left lane x=0-373px or right lane x=707-1080px/iu,
    },
  ];

  for (const { placement, expected } of cases) {
    const prompt = buildCreativeBrandExclusionZonePrompt({
      brandOverlay: publicBrandOverlay({ placement }),
      unitOrder: 1,
      aspectRatio: "4:5",
    });
    assert.ok(prompt);
    assert.match(prompt, expected);
  }
});

test("keeps a top-right slot proportional across canvas ratios", () => {
  const cases: Array<{
    aspectRatio: CreativeAspectRatio;
    expected: RegExp;
  }> = [
    {
      aspectRatio: "1:1",
      expected: /x=746-1080px and y=0-198px.*left lane x=0-746px/iu,
    },
    {
      aspectRatio: "4:5",
      expected: /x=746-1080px and y=0-198px.*left lane x=0-746px/iu,
    },
    {
      aspectRatio: "16:9",
      expected: /x=1586-1920px and y=0-198px.*left lane x=0-1586px/iu,
    },
  ];

  for (const { aspectRatio, expected } of cases) {
    const prompt = buildCreativeBrandExclusionZonePrompt({
      brandOverlay: publicBrandOverlay({ placement: "top-right" }),
      unitOrder: 1,
      aspectRatio,
    });
    assert.ok(prompt);
    assert.match(prompt, expected);
    assert.match(
      prompt,
      /Below y=198px, the normal full-width content region is available/iu,
    );
  }
});

test("derives a wide or tall top-right slot from the actual logo proportions", () => {
  const wide = publicBrandOverlay({ placement: "top-right" });
  const tall: CreativeBrandOverlay = {
    ...wide,
    asset: { ...wide.asset!, width: 30, height: 100 },
  };
  const widePrompt = buildCreativeBrandExclusionZonePrompt({
    brandOverlay: wide,
    unitOrder: 1,
    aspectRatio: "4:5",
  });
  const tallPrompt = buildCreativeBrandExclusionZonePrompt({
    brandOverlay: tall,
    unitOrder: 1,
    aspectRatio: "4:5",
  });

  assert.ok(widePrompt);
  assert.ok(tallPrompt);
  assert.match(widePrompt, /x=746-1080px and y=0-198px/iu);
  assert.match(tallPrompt, /x=882-1080px and y=0-334px/iu);
});

test("appends exactly one brand contract as the final prompt instruction", () => {
  const contract = buildCreativeBrandExclusionZonePrompt({
    brandOverlay: publicBrandOverlay(),
    unitOrder: 1,
    aspectRatio: "4:5",
  });
  assert.ok(contract);

  const prompt = appendCreativeBrandContract(
    "BASE INSTRUCTION\n\n<BRAND_OVERLAY_CONTRACT>old</BRAND_OVERLAY_CONTRACT>\n\nFINAL COPY RULE",
    contract,
  );
  assert.equal(
    prompt.match(/<BRAND_OVERLAY_CONTRACT>/gu)?.length,
    1,
  );
  assert.ok(prompt.trim().endsWith("</BRAND_OVERLAY_CONTRACT>"));
  assert.match(prompt, /BASE INSTRUCTION[\s\S]*FINAL COPY RULE/u);
  assert.equal(
    appendCreativeBrandContract("  BASE ONLY  ", undefined),
    "BASE ONLY",
  );
});

test("mentions a proportional slot only when branding applies to the unit", () => {
  const contract = buildCreativeBrandExclusionZonePrompt({
    brandOverlay: publicBrandOverlay(),
    unitOrder: 1,
    aspectRatio: "4:5",
  });
  assert.ok(contract);
  assert.match(
    creativeImageTextQualityInstruction(contract),
    /outside the proportional brand slot/iu,
  );
  assert.doesNotMatch(
    creativeImageTextQualityInstruction(undefined),
    /brand|slot|lane/iu,
  );
});

test("omits the safe-zone prompt when the overlay does not apply", () => {
  const firstUnitOnly = publicBrandOverlay();

  assert.equal(
    buildCreativeBrandExclusionZonePrompt({
      brandOverlay: firstUnitOnly,
      unitOrder: 2,
      aspectRatio: "4:5",
    }),
    undefined,
  );
  assert.equal(
    buildCreativeBrandExclusionZonePrompt({
      brandOverlay: { ...firstUnitOnly, asset: undefined },
      unitOrder: 1,
      aspectRatio: "4:5",
    }),
    undefined,
  );

  const allUnits = publicBrandOverlay({ scope: "all-units" });
  assert.ok(
    buildCreativeBrandExclusionZonePrompt({
      brandOverlay: allUnits,
      unitOrder: 2,
      aspectRatio: "4:5",
    }),
  );
});

test("composites alpha PNG pixels over an exact-color rounded backdrop", async () => {
  const image = await sharp({
    create: {
      width: 400,
      height: 200,
      channels: 3,
      background: "#FFFFFF",
    },
  })
    .png()
    .toBuffer();
  const logo = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect x="10" y="5" width="20" height="10" fill="#FF0000"/></svg>',
    ),
  )
    .png()
    .toBuffer();

  const result = await compositeCreativeBrandOverlay({
    image,
    logo,
    settings: brandSettings({
      placement: "top-left",
      backdropColor: "#112233",
      backdropOpacity: 100,
    }),
  });
  const { data, info } = await sharp(result.body)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  assert.equal(result.contentType, "image/png");
  assert.deepEqual(
    { width: result.width, height: result.height },
    { width: 400, height: 200 },
  );
  assert.deepEqual(result.geometry.occupied, {
    left: 10,
    top: 10,
    width: 46,
    height: 26,
  });
  assert.deepEqual(pixelAt(data, info.channels, info.width, 11, 20), [
    17, 34, 51, 255,
  ]);
  assert.deepEqual(pixelAt(data, info.channels, info.width, 33, 23), [
    255, 0, 0, 255,
  ]);
  assert.deepEqual(pixelAt(data, info.channels, info.width, 0, 0), [
    255, 255, 255, 255,
  ]);
});

test("dispatches the compositor version captured by the immutable snapshot", async () => {
  const image = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: "#FFFFFF",
    },
  })
    .png()
    .toBuffer();
  const logo = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="10" height="10" fill="#FF0000"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  const snapshot: CreativeBrandOverlaySnapshot = {
    ...brandSettings({ backdropMode: "none" }),
    compositorVersion: 1,
    asset: {
      id: "brand-asset-1",
      fileName: "logo.png",
      contentType: "image/png",
      fileSize: logo.byteLength,
      width: 20,
      height: 10,
      createdAt: new Date("2026-08-31T00:00:00.000Z"),
      objectKey: "private/logo.png",
      sha256: "0".repeat(64),
    },
  };

  const result = await compositeCreativeBrandOverlaySnapshot({
    image,
    logo,
    snapshot,
  });

  assert.equal(result.width, 100);
  assert.equal(result.height, 100);
  assert.equal(result.geometry.logo.left, 5);
  assert.equal(result.geometry.logo.top, 5);
});

function brandSettings(
  overrides: Partial<CreativeBrandOverlaySettings> = {},
): CreativeBrandOverlaySettings {
  return {
    enabled: true,
    scope: "first-unit",
    placement: "top-left",
    sizePercent: 20,
    insetPercent: 5,
    backdropMode: "solid",
    backdropColor: "#F6F0E4",
    backdropOpacity: 95,
    ...overrides,
  };
}

function publicBrandOverlay(
  overrides: Partial<CreativeBrandOverlaySettings> = {},
): CreativeBrandOverlay {
  return {
    ...brandSettings({ sizePercent: 18, ...overrides }),
    assetId: "brand-asset-1",
    asset: {
      id: "brand-asset-1",
      fileName: "canada-en-claro.png",
      contentType: "image/png",
      fileSize: 12_345,
      width: 100,
      height: 30,
      createdAt: new Date("2026-08-31T00:00:00.000Z"),
    },
  };
}

function pixelAt(
  data: Buffer,
  channels: number,
  width: number,
  x: number,
  y: number,
): number[] {
  const offset = (y * width + x) * channels;
  return [...data.subarray(offset, offset + channels)];
}
