import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import {
  appendCreativeCarouselChromeContract,
  buildCreativeCarouselChrome,
  buildCreativeCarouselChromeCopy,
  compositeCreativeCarouselChrome,
  CreativeCarouselChromeError,
  hasCreativeCarouselChromeContract,
  renderCreativeCarouselChromeSvg,
} from "./creative-carousel-chrome";
import {
  compositeCreativeBrandOverlay,
  computeCreativeBrandPromptExclusionRect,
} from "./creative-brand-overlay";
import { buildCreativeCarouselChromePreviewSvg } from "./creative-carousel-chrome-svg";
import {
  CREATIVE_CAROUSEL_CHROME_STYLES,
  type CreativeAspectRatio,
} from "./creative-content.types";

test("reserves a compact ratio-aware pagination badge on every canvas", () => {
  const cases: Array<{
    aspectRatio: CreativeAspectRatio;
    canvas: { width: number; height: number };
    badgeTop: number;
  }> = [
    {
      aspectRatio: "1:1",
      canvas: { width: 1080, height: 1080 },
      badgeTop: 1000,
    },
    {
      aspectRatio: "4:5",
      canvas: { width: 1080, height: 1350 },
      badgeTop: 1270,
    },
    {
      aspectRatio: "16:9",
      canvas: { width: 1920, height: 1080 },
      badgeTop: 1000,
    },
  ];

  for (const { aspectRatio, canvas, badgeTop } of cases) {
    const chrome = buildCreativeCarouselChrome({
      aspectRatio,
      unitOrder: 2,
      totalSlides: 5,
    });

    assert.deepEqual(chrome.geometry.canvas, canvas);
    assert.deepEqual(chrome.geometry.badge, {
      left: Math.round((canvas.width - 108) / 2),
      top: badgeTop,
      width: 108,
      height: 56,
    });
    assert.equal(chrome.geometry.layout, "full");
    assert.ok(chrome.overlay);
    assert.deepEqual(
      { left: chrome.overlay.left, top: chrome.overlay.top },
      { left: 0, top: 0 },
    );
  }
});

test("can disable numbering and uses selected palette colours for the overlay", () => {
  const disabled = buildCreativeCarouselChrome({
    aspectRatio: "4:5",
    unitOrder: 2,
    totalSlides: 5,
    settings: {
      enabled: false,
      style: "minimal",
      backgroundColor: "#173F43",
      textColor: "#FAF5E6",
      accentColor: "#EF644B",
    },
  });
  assert.equal(disabled.geometry.layout, "skipped");
  assert.equal(disabled.geometry.skipReason, "disabled");
  assert.equal(disabled.overlay, undefined);
  assert.equal(disabled.promptReservation, undefined);

  const styled = buildCreativeCarouselChrome({
    aspectRatio: "4:5",
    unitOrder: 2,
    totalSlides: 5,
    continuationCue: "the next idea",
    settings: {
      enabled: true,
      style: "minimal",
      backgroundColor: "#173F43",
      textColor: "#FAF5E6",
      accentColor: "#EF644B",
    },
  });
  assert.equal(styled.style, "minimal");
  assert.match(styled.overlay!.input.toString(), /#173F43/);
  assert.match(styled.overlay!.input.toString(), /#FAF5E6/);
  assert.match(styled.overlay!.input.toString(), /#EF644B/);
});

test("derives progress and uses only a meaningful continuation cue", () => {
  assert.deepEqual(
    buildCreativeCarouselChromeCopy({
      unitOrder: 3,
      totalSlides: 7,
      continuationCue: "  qué cambia para tu bolsillo  ",
    }),
    {
      progress: "3/7",
      continuationCue: "qué cambia para tu bolsillo",
      visibleText: "3/7 · qué cambia para tu bolsillo →",
    },
  );

  assert.deepEqual(
    buildCreativeCarouselChromeCopy({
      unitOrder: 1,
      totalSlides: 4,
      continuationCue: "Desliza para ver las excepciones",
    }),
    {
      progress: "1/4",
      continuationCue: "ver las excepciones",
      visibleText: "1/4 · ver las excepciones →",
    },
  );
  assert.deepEqual(
    buildCreativeCarouselChromeCopy({
      unitOrder: 1,
      totalSlides: 4,
      continuationCue: "Siguiente",
    }),
    { progress: "1/4", visibleText: "1/4" },
  );
});

test("renders subtle progress only on the final slide", () => {
  const copy = buildCreativeCarouselChromeCopy({
    unitOrder: 5,
    totalSlides: 5,
    continuationCue: "esta entrada debe ignorarse",
  });

  assert.deepEqual(copy, { progress: "5/5", visibleText: "5/5" });
});

test("rejects impossible slide progress", () => {
  assert.throws(
    () =>
      buildCreativeCarouselChromeCopy({
        unitOrder: 6,
        totalSlides: 5,
      }),
    CreativeCarouselChromeError,
  );
  assert.throws(
    () =>
      buildCreativeCarouselChromeCopy({
        unitOrder: 0,
        totalSlides: 5,
      }),
    /positive integer/iu,
  );
});

test("emits a Sharp-compatible full-canvas SVG with editorial defaults", async () => {
  const chrome = buildCreativeCarouselChrome({
    aspectRatio: "4:5",
    unitOrder: 1,
    totalSlides: 5,
    continuationCue: "qué significa para tu bolsillo",
  });
  assert.ok(chrome.overlay);

  const metadata = await sharp(chrome.overlay.input).metadata();
  assert.deepEqual(
    { format: metadata.format, width: metadata.width, height: metadata.height },
    { format: "svg", width: 1080, height: 1350 },
  );

  const { data, info } = await sharp(chrome.overlay.input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual(pixelAt(data, info.channels, info.width, 500, 1000), [
    0, 0, 0, 0,
  ]);
  assert.deepEqual(pixelAt(data, info.channels, info.width, 20, 1300), [
    0, 0, 0, 0,
  ]);
  assert.notEqual(chrome.geometry.layout, "skipped");
  if (chrome.geometry.layout === "skipped") assert.fail("badge was skipped");
  assert.ok(chrome.geometry.badge.width <= 1080 * 0.6);
  assert.deepEqual(
    pixelAt(
      data,
      info.channels,
      info.width,
      chrome.geometry.badge.left + Math.round(chrome.geometry.badge.width / 2),
      chrome.geometry.badge.top + 10,
    ),
    [15, 41, 66, 225],
  );
});

test("composites the chrome onto a normalized PNG", async () => {
  const chrome = buildCreativeCarouselChrome({
    aspectRatio: "1:1",
    unitOrder: 1,
    totalSlides: 3,
    continuationCue: "qué viene después",
  });
  const base = await sharp({
    create: {
      width: 1080,
      height: 1080,
      channels: 4,
      background: "#F6F0E4",
    },
  })
    .png()
    .toBuffer();

  const result = await compositeCreativeCarouselChrome({ image: base, chrome });
  const metadata = await sharp(result).metadata();
  assert.deepEqual(
    { format: metadata.format, width: metadata.width, height: metadata.height },
    { format: "png", width: 1080, height: 1080 },
  );
});

test("moves the compact badge away from a bottom logo", async () => {
  const chrome = buildCreativeCarouselChrome({
    aspectRatio: "4:5",
    unitOrder: 1,
    totalSlides: 5,
    continuationCue: "qué cambia para ti",
    logoExclusionZone: { left: 400, top: 1200, width: 280, height: 150 },
  });

  assert.equal(chrome.geometry.layout, "adapted");
  assert.ok(chrome.geometry.badge.left + chrome.geometry.badge.width <= 384);
  assert.ok(chrome.overlay);

  const { data, info } = await sharp(chrome.overlay.input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual(pixelAt(data, info.channels, info.width, 540, 1300), [
    0, 0, 0, 0,
  ]);
  assert.match(
    chrome.promptReservation ?? "",
    /moved outside the logo exclusion zone/iu,
  );
});

test("a logo outside the compact badge does not change its layout", () => {
  const chrome = buildCreativeCarouselChrome({
    aspectRatio: "4:5",
    unitOrder: 2,
    totalSlides: 5,
    logoExclusionZone: { left: 700, top: 30, width: 300, height: 180 },
  });

  assert.equal(chrome.geometry.layout, "full");
  assert.deepEqual(chrome.geometry.badge, {
    left: 486,
    top: 1270,
    width: 108,
    height: 56,
  });
});

test("skips chrome when a bottom logo leaves no legible safe lane", () => {
  const chrome = buildCreativeCarouselChrome({
    aspectRatio: "4:5",
    unitOrder: 1,
    totalSlides: 5,
    continuationCue: "qué significa para tu bolsillo",
    logoExclusionZone: { left: 100, top: 1200, width: 880, height: 150 },
  });

  assert.equal(chrome.geometry.layout, "skipped");
  assert.equal(chrome.geometry.skipReason, "no-safe-region");
  assert.equal(chrome.overlay, undefined);
  assert.equal(chrome.promptReservation, undefined);
  assert.throws(
    () =>
      renderCreativeCarouselChromeSvg({
        copy: chrome.copy,
        colors: chrome.colors,
        geometry: chrome.geometry,
      }),
    /has no SVG overlay/iu,
  );
});

test("drops an overlong cue but preserves subtle progress", () => {
  const chrome = buildCreativeCarouselChrome({
    aspectRatio: "4:5",
    unitOrder: 1,
    totalSlides: 5,
    continuationCue: Array.from(
      { length: 40 },
      (_, index) => `detalle${index + 1}`,
    ).join(" "),
  });

  assert.equal(chrome.geometry.layout, "full");
  assert.equal(chrome.copy.continuationCue, undefined);
  assert.equal(chrome.copy.visibleText, "1/5");
  assert.ok(chrome.overlay);
  assert.ok(chrome.promptReservation);
});

test("keeps the full logo safety buffer clear and composites the logo last", async () => {
  const settings = {
    enabled: true,
    scope: "all-units" as const,
    placement: "bottom-left" as const,
    sizePercent: 18,
    insetPercent: 5,
    backdropMode: "none" as const,
    backdropColor: "#F6F0E4",
    backdropOpacity: 95,
  };
  const exclusion = computeCreativeBrandPromptExclusionRect({
    settings,
    canvasWidth: 1080,
    canvasHeight: 1350,
    logoWidth: 400,
    logoHeight: 100,
  });
  const chrome = buildCreativeCarouselChrome({
    aspectRatio: "4:5",
    unitOrder: 1,
    totalSlides: 5,
    continuationCue: "qué cambia para ti",
    logoExclusionZone: exclusion,
  });
  const base = await sharp({
    create: {
      width: 1080,
      height: 1350,
      channels: 4,
      background: "#F6F0E4",
    },
  })
    .png()
    .toBuffer();
  const logo = await sharp({
    create: {
      width: 400,
      height: 100,
      channels: 4,
      background: "#D71920",
    },
  })
    .png()
    .toBuffer();
  const withChrome = await compositeCreativeCarouselChrome({
    image: base,
    chrome,
  });
  const result = await compositeCreativeBrandOverlay({
    image: withChrome,
    logo,
    settings,
  });
  const { data, info } = await sharp(result.body)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  assert.deepEqual(
    { width: info.width, height: info.height },
    { width: 1080, height: 1350 },
  );
  assert.deepEqual(pixelAt(data, info.channels, info.width, 280, 1300), [
    246, 240, 228, 255,
  ]);
  assert.deepEqual(pixelAt(data, info.channels, info.width, 1000, 1325), [
    246, 240, 228, 255,
  ]);
  assert.deepEqual(pixelAt(data, info.channels, info.width, 100, 1260), [
    215, 25, 32, 255,
  ]);
});

test("the reservation contract tells the image model to leave chrome empty", () => {
  const chrome = buildCreativeCarouselChrome({
    aspectRatio: "4:5",
    unitOrder: 2,
    totalSlides: 5,
  });
  const prompt = chrome.promptReservation;

  assert.ok(prompt);
  assert.match(prompt, /<CAROUSEL_CHROME_CONTRACT>/u);
  assert.match(prompt, /x=486-594px and y=1270-1326px/iu);
  assert.match(prompt, /Do not render or approximate pagination/iu);
  assert.match(prompt, /exact approved compact overlay will be composited/iu);
  assert.doesNotMatch(prompt, /2\/5|DESLIZA/u);

  const appended = appendCreativeCarouselChromeContract(
    "BASE\n<CAROUSEL_CHROME_CONTRACT>old</CAROUSEL_CHROME_CONTRACT>\nFINAL",
    prompt,
  );
  assert.equal(
    appended.match(/<CAROUSEL_CHROME_CONTRACT>/gu)?.length,
    1,
  );
  assert.ok(appended.endsWith("</CAROUSEL_CHROME_CONTRACT>"));
  assert.match(appended, /BASE\s+FINAL/u);
  assert.equal(hasCreativeCarouselChromeContract(appended), true);
  assert.equal(hasCreativeCarouselChromeContract("legacy prompt"), false);
});

test("escapes supplied cue text and accepts configurable existing colors", () => {
  const chrome = buildCreativeCarouselChrome({
    aspectRatio: "16:9",
    unitOrder: 1,
    totalSlides: 4,
    continuationCue: 'what <changes> & "why"',
    colors: {
      background: "#17422F",
      text: "#F1F6F3",
      accent: "#B7791F",
    },
  });
  assert.ok(chrome.overlay);
  const svg = chrome.overlay.input.toString("utf8");

  assert.match(svg, /what &lt;changes&gt; &amp; &quot;why&quot;/u);
  assert.doesNotMatch(svg, /what <changes>/u);
  assert.match(svg, /fill="#17422F"/u);
  assert.match(svg, /fill="#F1F6F3"/u);
  assert.match(svg, /fill="#B7791F"/u);
  assert.throws(
    () =>
      buildCreativeCarouselChrome({
        aspectRatio: "1:1",
        unitOrder: 1,
        totalSlides: 2,
        colors: { accent: "gold" },
      }),
    /#RRGGBB/iu,
  );
});

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

const BRAND = {
  backgroundColor: "#173F43",
  textColor: "#FAF5E6",
  accentColor: "#EF644B",
} as const;

test("every counter style renders inside the reserved badge with brand colours", async () => {
  for (const style of CREATIVE_CAROUSEL_CHROME_STYLES) {
    const chrome = buildCreativeCarouselChrome({
      aspectRatio: "4:5",
      unitOrder: 2,
      totalSlides: 6,
      continuationCue: "the next idea",
      settings: { enabled: true, style, ...BRAND },
    });
    assert.equal(chrome.style, style);
    assert.notEqual(chrome.geometry.layout, "skipped", style);
    if (chrome.geometry.layout === "skipped") continue;
    const svg = chrome.overlay!.input.toString("utf8");
    assert.match(svg, /#EF644B/u, style);
    assert.match(svg, /the next idea/u, style);

    const { data, info } = await sharp(chrome.overlay!.input)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const badge = chrome.geometry.badge;
    for (let y = 0; y < info.height; y += 7) {
      for (let x = 0; x < info.width; x += 7) {
        const inside =
          x >= badge.left - 2 && x <= badge.left + badge.width + 2 &&
          y >= badge.top - 2 && y <= badge.top + badge.height + 2;
        if (!inside) {
          assert.equal(data[(y * info.width + x) * info.channels + 3], 0, `${style} paints outside its badge at ${x},${y}`);
        }
      }
    }
  }
});

test("pill and minimal markup stay byte-identical to compositor version 1", () => {
  const chrome = buildCreativeCarouselChrome({
    aspectRatio: "4:5",
    unitOrder: 2,
    totalSlides: 5,
    settings: { enabled: true, style: "minimal", ...BRAND },
  });
  assert.equal(
    chrome.overlay!.input.toString("utf8"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" xml:space="preserve"><rect x="486" y="1270" width="108" height="56" rx="14" fill="#173F43" fill-opacity="0.38"/><text x="540" y="1298" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700" fill="#FAF5E6">2/5</text></svg>',
  );
});

test("dots draw one dot per slide and widen the badge for long carousels", () => {
  const short = buildCreativeCarouselChrome({
    aspectRatio: "4:5",
    unitOrder: 3,
    totalSlides: 4,
    settings: { enabled: true, style: "dots", ...BRAND },
  });
  const long = buildCreativeCarouselChrome({
    aspectRatio: "4:5",
    unitOrder: 3,
    totalSlides: 12,
    settings: { enabled: true, style: "dots", ...BRAND },
  });
  const shortSvg = short.overlay!.input.toString("utf8");
  assert.equal(shortSvg.match(/<circle/gu)?.length, 4);
  assert.equal(shortSvg.match(/fill="#EF644B"/gu)?.length, 1);
  assert.doesNotMatch(shortSvg, /3\/4/u);
  assert.equal(long.overlay!.input.toString("utf8").match(/<circle/gu)?.length, 12);
  if (short.geometry.layout === "skipped" || long.geometry.layout === "skipped") {
    assert.fail("dots badge was skipped");
  }
  assert.ok(long.geometry.badge.width > short.geometry.badge.width);
  assert.match(long.promptReservation ?? "", new RegExp(`x=${long.geometry.badge.left}-`, "u"));
});

test("the progress bar fills in proportion to the slide position", () => {
  const svg = buildCreativeCarouselChrome({
    aspectRatio: "1:1",
    unitOrder: 1,
    totalSlides: 4,
    settings: { enabled: true, style: "progress-bar", ...BRAND },
  }).overlay!.input.toString("utf8");
  const bars = [...svg.matchAll(/<rect x="\d+" y="\d+" width="(\d+)" height="\d+" rx="\d+" fill="(#[\dA-F]{6})"/gu)];
  const track = bars.find((bar) => bar[2] === BRAND.textColor);
  const fill = bars.find((bar) => bar[2] === BRAND.accentColor);
  assert.ok(track && fill);
  assert.ok(Math.abs(Number(fill[1]) - Number(track[1]) / 4) <= 1);
});

test("the editor preview uses the compositor markup for every style", () => {
  for (const style of CREATIVE_CAROUSEL_CHROME_STYLES) {
    const svg = buildCreativeCarouselChromePreviewSvg({
      copy: { progress: "2/6", continuationCue: "next idea", visibleText: "2/6 · next idea →" },
      colors: { background: BRAND.backgroundColor, text: BRAND.textColor, accent: BRAND.accentColor },
      style,
    });
    assert.match(svg, /^<svg /u, style);
    assert.match(svg, /next idea/u, style);
  }
});

test("rejects an unknown counter style", () => {
  assert.throws(
    () =>
      buildCreativeCarouselChrome({
        aspectRatio: "4:5",
        unitOrder: 1,
        totalSlides: 3,
        settings: { enabled: true, style: "neon" as never, ...BRAND },
      }),
    /must be one of/iu,
  );
});

const IRREGULAR_STYLES = ["brush", "blob", "sketch", "torn-paper", "sticker"] as const;

test("irregular shapes stay inside the reserved badge on every slide", async () => {
  for (const style of IRREGULAR_STYLES) {
    for (const [unitOrder, continuationCue] of [
      [1, undefined],
      [3, "qué cambia para tu bolsillo hoy"],
      [9, "lo que sigue"],
    ] as const) {
      const chrome = buildCreativeCarouselChrome({
        aspectRatio: "4:5",
        unitOrder,
        totalSlides: 10,
        continuationCue,
        settings: { enabled: true, style, ...BRAND },
      });
      if (chrome.geometry.layout === "skipped") assert.fail(`${style} skipped`);
      const badge = chrome.geometry.badge;
      const { data, info } = await sharp(chrome.overlay!.input)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      for (let y = badge.top - 20; y < badge.top + badge.height + 20; y += 1) {
        for (let x = badge.left - 20; x < badge.left + badge.width + 20; x += 1) {
          if (x < 0 || y < 0 || x >= info.width || y >= info.height) continue;
          const inside =
            x >= badge.left - 1 && x <= badge.left + badge.width + 1 &&
            y >= badge.top - 1 && y <= badge.top + badge.height + 1;
          if (!inside) {
            assert.equal(
              data[(y * info.width + x) * info.channels + 3],
              0,
              `${style} slide ${unitOrder} paints outside its badge at ${x},${y}`,
            );
          }
        }
      }
    }
  }
});

test("irregular shapes are reproducible per slide and vary between slides", () => {
  const render = (style: (typeof IRREGULAR_STYLES)[number], unitOrder: number) =>
    buildCreativeCarouselChrome({
      aspectRatio: "4:5",
      unitOrder,
      totalSlides: 5,
      settings: { enabled: true, style, ...BRAND },
    }).overlay!.input.toString("utf8");
  for (const style of IRREGULAR_STYLES) {
    assert.equal(render(style, 2), render(style, 2), `${style} is not deterministic`);
    assert.notEqual(
      render(style, 2).replace(/>\d\/5</u, ""),
      render(style, 3).replace(/>\d\/5</u, ""),
      `${style} does not vary between slides`,
    );
  }
});
