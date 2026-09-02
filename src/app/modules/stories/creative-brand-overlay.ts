import { createHash } from "node:crypto";

import sharp from "sharp";

import type {
  CreativeAspectRatio,
  CreativeBrandOverlay,
  CreativeBrandOverlaySettings,
  CreativeBrandOverlaySnapshot,
  CreativeBrandPlacement,
} from "./creative-content.types";

const MAX_INPUT_PIXELS = 50_000_000;
const PANEL_PADDING_PERCENT = 1.5;
const PANEL_RADIUS_PERCENT = 1.2;
const PROMPT_EXCLUSION_BUFFER_PERCENT = 5;

export type CreativeBrandPixelRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CreativeBrandOverlayGeometry = {
  canvas: {
    width: number;
    height: number;
  };
  inset: number;
  panelPadding: number;
  logo: CreativeBrandPixelRect;
  occupied: CreativeBrandPixelRect;
  backdrop?: CreativeBrandPixelRect & {
    radius: number;
  };
};

export function computeCreativeBrandPromptExclusionRect({
  settings,
  canvasWidth,
  canvasHeight,
  logoWidth,
  logoHeight,
}: {
  settings: CreativeBrandOverlaySettings;
  canvasWidth: number;
  canvasHeight: number;
  logoWidth: number;
  logoHeight: number;
}): CreativeBrandPixelRect {
  const geometry = computeCreativeBrandOverlayGeometry({
    settings,
    canvasWidth,
    canvasHeight,
    logoWidth,
    logoHeight,
  });
  const exclusionBuffer = Math.round(
    Math.min(canvasWidth, canvasHeight) *
      (PROMPT_EXCLUSION_BUFFER_PERCENT / 100),
  );
  return expandAndClipRect(
    geometry.occupied,
    exclusionBuffer,
    canvasWidth,
    canvasHeight,
  );
}

export type CompositedCreativeBrandImage = {
  body: Buffer;
  contentType: "image/png";
  width: number;
  height: number;
  geometry: CreativeBrandOverlayGeometry;
};

export function shouldApplyCreativeBrandOverlay(
  settings: CreativeBrandOverlaySettings | undefined,
  unitOrder: number,
): boolean {
  if (!settings?.enabled || !Number.isInteger(unitOrder) || unitOrder < 1) {
    return false;
  }

  return settings.scope === "all-units" || unitOrder === 1;
}

export function creativeBrandInputHash({
  settings,
  assetId,
  assetSha256,
}: {
  settings: CreativeBrandOverlaySettings;
  assetId: string;
  assetSha256: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        policy: "deterministic-brand-overlay-v4-proportional-slot",
        assetId,
        assetSha256,
        scope: settings.scope,
        placement: settings.placement,
        sizePercent: settings.sizePercent,
        insetPercent: settings.insetPercent,
        backdrop:
          settings.backdropMode === "solid"
            ? {
                mode: "solid",
                color: settings.backdropColor.toUpperCase(),
                opacity: settings.backdropOpacity,
              }
            : { mode: "none" },
      }),
    )
    .digest("hex");
}

export function creativeCanvasDimensions(
  aspectRatio: CreativeAspectRatio,
): { width: number; height: number } {
  switch (aspectRatio) {
    case "1:1":
      return { width: 1080, height: 1080 };
    case "4:5":
      return { width: 1080, height: 1350 };
    case "9:16":
      return { width: 1080, height: 1920 };
    case "16:9":
      return { width: 1920, height: 1080 };
  }
}

export function computeCreativeBrandOverlayGeometry({
  settings,
  canvasWidth,
  canvasHeight,
  logoWidth,
  logoHeight,
}: {
  settings: CreativeBrandOverlaySettings;
  canvasWidth: number;
  canvasHeight: number;
  logoWidth: number;
  logoHeight: number;
}): CreativeBrandOverlayGeometry {
  assertPositiveInteger(canvasWidth, "Canvas width");
  assertPositiveInteger(canvasHeight, "Canvas height");
  assertPositiveInteger(logoWidth, "Logo width");
  assertPositiveInteger(logoHeight, "Logo height");
  assertSettings(settings);

  const shortEdge = Math.min(canvasWidth, canvasHeight);
  const inset = Math.round(shortEdge * (settings.insetPercent / 100));
  const panelPadding =
    settings.backdropMode === "solid"
      ? Math.max(1, Math.round(shortEdge * (PANEL_PADDING_PERCENT / 100)))
      : 0;
  const requestedMaximumLogoEdge = Math.max(
    1,
    Math.round(shortEdge * (settings.sizePercent / 100)),
  );
  const availableLogoWidth = canvasWidth - inset * 2 - panelPadding * 2;
  const availableLogoHeight = canvasHeight - inset * 2 - panelPadding * 2;

  if (availableLogoWidth < 1 || availableLogoHeight < 1) {
    throw new CreativeBrandOverlayError(
      "The brand inset and backdrop padding leave no room for the logo.",
    );
  }

  const scale = Math.min(
    requestedMaximumLogoEdge / logoWidth,
    requestedMaximumLogoEdge / logoHeight,
    availableLogoWidth / logoWidth,
    availableLogoHeight / logoHeight,
  );
  const renderedLogoWidth = Math.max(1, Math.floor(logoWidth * scale));
  const renderedLogoHeight = Math.max(1, Math.floor(logoHeight * scale));
  const occupiedWidth = renderedLogoWidth + panelPadding * 2;
  const occupiedHeight = renderedLogoHeight + panelPadding * 2;
  const occupied = {
    left: horizontalPosition(
      settings.placement,
      canvasWidth,
      occupiedWidth,
      inset,
    ),
    top: verticalPosition(
      settings.placement,
      canvasHeight,
      occupiedHeight,
      inset,
    ),
    width: occupiedWidth,
    height: occupiedHeight,
  };
  const logo = {
    left: occupied.left + panelPadding,
    top: occupied.top + panelPadding,
    width: renderedLogoWidth,
    height: renderedLogoHeight,
  };
  const radius = Math.min(
    Math.max(1, Math.round(shortEdge * (PANEL_RADIUS_PERCENT / 100))),
    Math.floor(occupiedWidth / 2),
    Math.floor(occupiedHeight / 2),
  );

  return {
    canvas: { width: canvasWidth, height: canvasHeight },
    inset,
    panelPadding,
    logo,
    occupied,
    ...(settings.backdropMode === "solid"
      ? { backdrop: { ...occupied, radius } }
      : {}),
  };
}

export function buildCreativeBrandExclusionZonePrompt({
  brandOverlay,
  unitOrder,
  aspectRatio,
}: {
  brandOverlay: CreativeBrandOverlay | undefined;
  unitOrder: number;
  aspectRatio: CreativeAspectRatio;
}): string | undefined {
  const asset = brandOverlay?.asset;
  if (
    !brandOverlay ||
    !asset ||
    !shouldApplyCreativeBrandOverlay(brandOverlay, unitOrder)
  ) {
    return undefined;
  }

  const canvas = creativeCanvasDimensions(aspectRatio);
  const exclusionZone = computeCreativeBrandPromptExclusionRect({
    settings: brandOverlay,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    logoWidth: asset.width,
    logoHeight: asset.height,
  });
  const backdropInstruction =
    brandOverlay.backdropMode === "solid"
      ? `A compositor will add a rounded ${normalizeHexColor(brandOverlay.backdropColor)} backdrop at ${brandOverlay.backdropOpacity}% opacity behind the logo; do not draw or approximate that panel.`
      : "No backdrop will be added, so keep the entire zone especially calm, low-detail, and compatible with the surrounding palette.";
  const layoutBoundaryInstruction = brandLayoutBoundaryInstruction({
    placement: brandOverlay.placement,
    exclusionZone,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
  });

  return [
    "<BRAND_OVERLAY_CONTRACT>",
    `FINAL BRAND LAYOUT LOCK (non-negotiable): the approved logo will be composited after generation at ${brandOverlay.placement}.`,
    `Keep x=${exclusionZone.left}-${exclusionZone.left + exclusionZone.width}px and y=${exclusionZone.top}-${exclusionZone.top + exclusionZone.height}px free of foreground content (${percent(exclusionZone.width, canvas.width)}% of canvas width by ${percent(exclusionZone.height, canvas.height)}% of canvas height). This rectangle includes a ${PROMPT_EXCLUSION_BUFFER_PERCENT}% short-edge safety buffer. The underlying background color or low-detail texture may continue naturally through it.`,
    layoutBoundaryInstruction,
    "Do not place visible text, faces, people, focal subjects, charts, data, icons, high-contrast edges, or important details inside or overlapping the reserved slot or exclusion zone. Reflow or scale the required visible copy so every glyph stays entirely inside one of the usable content regions described above and outside the reserved slot.",
    backdropInstruction,
    "Do not render, imitate, spell, approximate, or imply a logo, wordmark, brand mark, watermark, signature, or placeholder anywhere. The exact approved alpha PNG will be composited afterward.",
    "</BRAND_OVERLAY_CONTRACT>",
  ].join(" ");
}

/** Ensures the spatial brand contract is unique within the supplied prompt. */
export function appendCreativeBrandContract(
  prompt: string,
  contract: string | undefined,
): string {
  const withoutPreviousContract = prompt
    .replace(
      /<BRAND_OVERLAY_CONTRACT>[\s\S]*?<\/BRAND_OVERLAY_CONTRACT>/giu,
      "",
    )
    .trim();
  if (!contract?.trim()) return withoutPreviousContract;
  return `${withoutPreviousContract}\n\n${contract.trim()}`;
}

export function creativeImageTextQualityInstruction(
  brandContract: string | undefined,
): string {
  return brandContract
    ? "Within the usable content regions outside the proportional brand slot, prioritize text quality: the rendered text must be sharp, correctly spelled, evenly kerned, fully legible, and reflowed or scaled so no glyph enters the slot. The adjacent lane and the normal full-width region below or above the slot remain usable unless a later final spatial contract reserves them."
    : "Prioritize text quality above all other visual considerations: the rendered text must be sharp, correctly spelled, evenly kerned, and fully legible with no distorted, blurred, or malformed characters.";
}

function brandLayoutBoundaryInstruction({
  placement,
  exclusionZone,
  canvasWidth,
  canvasHeight,
}: {
  placement: CreativeBrandPlacement;
  exclusionZone: CreativeBrandPixelRect;
  canvasWidth: number;
  canvasHeight: number;
}): string {
  const right = exclusionZone.left + exclusionZone.width;
  const bottom = exclusionZone.top + exclusionZone.height;

  if (placement === "top-left") {
    return `PROPORTIONAL TOP-LEFT CORNER SLOT: reserve only x=0-${right}px and y=0-${bottom}px as seamless background-only space. In that top band, use the adjacent right lane x=${right}-${canvasWidth}px when the required copy remains large and phone-legible; every glyph and focal element there must begin at or after x=${right}px. Otherwise start the wide headline below y=${bottom}px in the normal full-width content region. Below y=${bottom}px, the normal full-width content region is available again. Do not create an unnecessary full-width empty header.`;
  }
  if (placement === "top-right") {
    return `PROPORTIONAL TOP-RIGHT CORNER SLOT: reserve only x=${exclusionZone.left}-${canvasWidth}px and y=0-${bottom}px as seamless background-only space. In that top band, use the adjacent left lane x=0-${exclusionZone.left}px for the headline when the required copy remains large and phone-legible; every glyph and focal element there must end at or before x=${exclusionZone.left}px. Otherwise start the wide headline below y=${bottom}px in the normal full-width content region. Below y=${bottom}px, the normal full-width content region is available again. Do not create an unnecessary full-width empty header.`;
  }
  if (placement === "top-center") {
    return `PROPORTIONAL TOP-CENTER SLOT: reserve only x=${exclusionZone.left}-${right}px and y=0-${bottom}px as seamless background-only space. Within that top band, foreground content may use the left lane x=0-${exclusionZone.left}px or right lane x=${right}-${canvasWidth}px but may not cross the slot. Below y=${bottom}px, the normal full-width content region is available again; place a wide headline there if it cannot fit cleanly in either side lane.`;
  }
  if (placement === "bottom-left") {
    return `PROPORTIONAL BOTTOM-LEFT CORNER SLOT: reserve only x=0-${right}px and y=${exclusionZone.top}-${canvasHeight}px as seamless background-only space. In that bottom band, foreground content may use the adjacent right lane x=${right}-${canvasWidth}px only outside any separately reserved pagination badge and must not enter the slot. Above y=${exclusionZone.top}px, the normal full-width content region is available.`;
  }
  if (placement === "bottom-right") {
    return `PROPORTIONAL BOTTOM-RIGHT CORNER SLOT: reserve only x=${exclusionZone.left}-${canvasWidth}px and y=${exclusionZone.top}-${canvasHeight}px as seamless background-only space. In that bottom band, foreground content may use the adjacent left lane x=0-${exclusionZone.left}px only outside any separately reserved pagination badge and must not enter the slot. Above y=${exclusionZone.top}px, the normal full-width content region is available.`;
  }
  if (placement === "bottom-center") {
    return `PROPORTIONAL BOTTOM-CENTER SLOT: reserve only x=${exclusionZone.left}-${right}px and y=${exclusionZone.top}-${canvasHeight}px as seamless background-only space. Within that bottom band, foreground content may use the left lane x=0-${exclusionZone.left}px or right lane x=${right}-${canvasWidth}px only outside any separately reserved pagination badge and may not cross the slot. Above y=${exclusionZone.top}px, the normal full-width content region is available.`;
  }
  if (placement === "center-left") {
    return `PROPORTIONAL CENTER-LEFT SLOT: reserve only x=0-${right}px and y=${exclusionZone.top}-${bottom}px as seamless background-only space. Within that middle band, foreground content may use the adjacent right lane x=${right}-${canvasWidth}px. Above y=${exclusionZone.top}px and below y=${bottom}px, the normal full-width content region is available.`;
  }
  if (placement === "center-right") {
    return `PROPORTIONAL CENTER-RIGHT SLOT: reserve only x=${exclusionZone.left}-${canvasWidth}px and y=${exclusionZone.top}-${bottom}px as seamless background-only space. Within that middle band, foreground content may use the adjacent left lane x=0-${exclusionZone.left}px. Above y=${exclusionZone.top}px and below y=${bottom}px, the normal full-width content region is available.`;
  }

  return `PROPORTIONAL CENTER SLOT: reserve only x=${exclusionZone.left}-${right}px and y=${exclusionZone.top}-${bottom}px as seamless background-only space. Within that middle band, foreground content may use the left lane x=0-${exclusionZone.left}px or right lane x=${right}-${canvasWidth}px but may not cross the slot. Above y=${exclusionZone.top}px and below y=${bottom}px, the normal full-width content region is available.`;
}

export async function compositeCreativeBrandOverlay({
  image,
  logo,
  settings,
}: {
  image: Uint8Array;
  logo: Uint8Array;
  settings: CreativeBrandOverlaySettings;
}): Promise<CompositedCreativeBrandImage> {
  assertSettings(settings);
  const imageBuffer = toBuffer(image);
  const logoBuffer = toBuffer(logo);
  const [imageMetadata, logoMetadata] = await Promise.all([
    sharp(imageBuffer, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata(),
    sharp(logoBuffer, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata(),
  ]);

  if (!imageMetadata.width || !imageMetadata.height) {
    throw new CreativeBrandOverlayError(
      "The normalized creative image has no readable dimensions.",
    );
  }
  if (
    logoMetadata.format !== "png" ||
    !logoMetadata.hasAlpha ||
    !logoMetadata.width ||
    !logoMetadata.height
  ) {
    throw new CreativeBrandOverlayError(
      "The brand logo must be a valid PNG with an alpha channel.",
    );
  }

  const geometry = computeCreativeBrandOverlayGeometry({
    settings,
    canvasWidth: imageMetadata.width,
    canvasHeight: imageMetadata.height,
    logoWidth: logoMetadata.width,
    logoHeight: logoMetadata.height,
  });
  const resizedLogo = await sharp(logoBuffer, {
    failOn: "error",
    limitInputPixels: MAX_INPUT_PIXELS,
  })
    .resize(geometry.logo.width, geometry.logo.height, { fit: "fill" })
    .png()
    .toBuffer();
  const layers: Array<{
    input: Buffer;
    left: number;
    top: number;
  }> = [];

  if (geometry.backdrop) {
    layers.push({
      input: await createRoundedBackdrop({
        width: geometry.backdrop.width,
        height: geometry.backdrop.height,
        radius: geometry.backdrop.radius,
        color: settings.backdropColor,
        opacity: settings.backdropOpacity,
      }),
      left: geometry.backdrop.left,
      top: geometry.backdrop.top,
    });
  }

  layers.push({
    input: resizedLogo,
    left: geometry.logo.left,
    top: geometry.logo.top,
  });

  const body = await sharp(imageBuffer, {
    failOn: "error",
    limitInputPixels: MAX_INPUT_PIXELS,
  })
    .composite(layers)
    .png()
    .toBuffer();

  return {
    body,
    contentType: "image/png",
    width: imageMetadata.width,
    height: imageMetadata.height,
    geometry,
  };
}

/**
 * Dispatches the immutable compositor policy captured by an asset. Keep each
 * version available so a Fal job completed after a deploy uses the same
 * geometry that reserved its prompt safe zone.
 */
export function compositeCreativeBrandOverlaySnapshot({
  image,
  logo,
  snapshot,
}: {
  image: Uint8Array;
  logo: Uint8Array;
  snapshot: CreativeBrandOverlaySnapshot;
}): Promise<CompositedCreativeBrandImage> {
  switch (snapshot.compositorVersion) {
    case 1:
      return compositeCreativeBrandOverlay({ image, logo, settings: snapshot });
  }
}

function horizontalPosition(
  placement: CreativeBrandPlacement,
  canvasWidth: number,
  occupiedWidth: number,
  inset: number,
): number {
  if (placement.endsWith("left")) return inset;
  if (placement.endsWith("right")) {
    return canvasWidth - inset - occupiedWidth;
  }
  return Math.round((canvasWidth - occupiedWidth) / 2);
}

function verticalPosition(
  placement: CreativeBrandPlacement,
  canvasHeight: number,
  occupiedHeight: number,
  inset: number,
): number {
  if (placement.startsWith("top")) return inset;
  if (placement.startsWith("bottom")) {
    return canvasHeight - inset - occupiedHeight;
  }
  return Math.round((canvasHeight - occupiedHeight) / 2);
}

function expandAndClipRect(
  rect: CreativeBrandPixelRect,
  amount: number,
  canvasWidth: number,
  canvasHeight: number,
): CreativeBrandPixelRect {
  const left = Math.max(0, rect.left - amount);
  const top = Math.max(0, rect.top - amount);
  const right = Math.min(canvasWidth, rect.left + rect.width + amount);
  const bottom = Math.min(canvasHeight, rect.top + rect.height + amount);
  return { left, top, width: right - left, height: bottom - top };
}

async function createRoundedBackdrop({
  width,
  height,
  radius,
  color,
  opacity,
}: {
  width: number;
  height: number;
  radius: number;
  color: string;
  opacity: number;
}): Promise<Buffer> {
  const { red, green, blue } = parseHexColor(color);
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" fill="#fff"/></svg>`,
  );

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: red, g: green, b: blue, alpha: opacity / 100 },
    },
  })
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

function normalizeHexColor(value: string): string {
  const { red, green, blue } = parseHexColor(value);
  return `#${[red, green, blue]
    .map((component) => component.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function parseHexColor(value: string): {
  red: number;
  green: number;
  blue: number;
} {
  const match = /^#([\da-f]{6})$/iu.exec(value.trim());
  if (!match?.[1]) {
    throw new CreativeBrandOverlayError(
      "Brand backdrop colors must use the #RRGGBB format.",
    );
  }

  return {
    red: Number.parseInt(match[1].slice(0, 2), 16),
    green: Number.parseInt(match[1].slice(2, 4), 16),
    blue: Number.parseInt(match[1].slice(4, 6), 16),
  };
}

function assertSettings(settings: CreativeBrandOverlaySettings): void {
  if (
    !Number.isFinite(settings.sizePercent) ||
    settings.sizePercent <= 0 ||
    settings.sizePercent > 100
  ) {
    throw new CreativeBrandOverlayError(
      "Brand logo size must be greater than zero and at most 100 percent.",
    );
  }
  if (
    !Number.isFinite(settings.insetPercent) ||
    settings.insetPercent < 0 ||
    settings.insetPercent >= 50
  ) {
    throw new CreativeBrandOverlayError(
      "Brand logo inset must be between zero and 50 percent.",
    );
  }
  if (
    !Number.isFinite(settings.backdropOpacity) ||
    settings.backdropOpacity < 0 ||
    settings.backdropOpacity > 100
  ) {
    throw new CreativeBrandOverlayError(
      "Brand backdrop opacity must be between zero and 100 percent.",
    );
  }
  if (settings.backdropMode === "solid") {
    parseHexColor(settings.backdropColor);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new CreativeBrandOverlayError(`${label} must be a positive integer.`);
  }
}

function percent(value: number, whole: number): string {
  return (Math.round((value / whole) * 1_000) / 10).toFixed(1);
}

function toBuffer(value: Uint8Array): Buffer {
  return Buffer.isBuffer(value)
    ? value
    : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

export class CreativeBrandOverlayError extends Error {}
