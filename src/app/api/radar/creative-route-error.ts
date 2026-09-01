import { ApiError } from "@google/genai";
import { ApiError as FalApiError } from "@fal-ai/client";
import { APIError as GroqApiError } from "groq-sdk";
import { NextResponse } from "next/server";

import { CreativeContentConfigurationError } from "@/app/modules/stories/creative-content.config";
import { CreativeContentResponseError } from "@/app/modules/stories/gemini-creative-content-generator";
import { FalImageConfigurationError } from "@/app/modules/stories/fal-image-generation.config";
import { FalImageResponseError } from "@/app/modules/stories/fal-image-client";
import { CreativeAssetValidationError } from "@/app/modules/stories/manage-creative-assets";
import {
  CreativeContentConflictError,
  CreativeContentDailyLimitError,
  CreativeContentInsufficientError,
  CreativeContentNotFoundError,
  CreativeDraftValidationError,
} from "@/app/modules/stories/manage-creative-content";
import { CreativeProfileValidationError } from "@/app/modules/stories/creative-profile.repository";
import { CreativeBrandOverlayValidationError } from "@/app/modules/stories/creative-brand-overlay-validation";
import { CreativeBrandAssetNotFoundError } from "@/app/modules/stories/creative-brand-assets.repository";
import {
  CreativeCharacterConflictError,
  CreativeCharacterNotFoundError,
  CreativeCharacterValidationError,
} from "@/app/modules/stories/creative-characters.repository";
import { CreativeCharacterReferenceValidationError } from "@/app/modules/stories/manage-creative-characters";
import { CreativeBrandAssetValidationError } from "@/app/modules/stories/manage-creative-brand-assets";
import {
  R2StorageConfigurationError,
  R2StorageObjectError,
  R2StorageValidationError,
} from "@/app/modules/stories/r2-storage";
import { SelectedStoryContentNotFoundError } from "@/app/modules/stories/story-content.repository";

export function creativeRouteErrorResponse(
  error: unknown,
  operation: string,
): NextResponse {
  if (
    error instanceof CreativeContentNotFoundError ||
    error instanceof SelectedStoryContentNotFoundError ||
    error instanceof CreativeCharacterNotFoundError ||
    error instanceof CreativeBrandAssetNotFoundError
  ) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "The JSON body is invalid" }, { status: 400 });
  }

  if (
    error instanceof CreativeProfileValidationError ||
    error instanceof CreativeBrandOverlayValidationError ||
    error instanceof CreativeBrandAssetValidationError ||
    error instanceof CreativeAssetValidationError ||
    error instanceof CreativeDraftValidationError ||
    error instanceof CreativeCharacterValidationError ||
    error instanceof CreativeCharacterReferenceValidationError ||
    error instanceof R2StorageValidationError
  ) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof CreativeContentInsufficientError) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }

  if (error instanceof CreativeContentConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof CreativeCharacterConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof CreativeContentDailyLimitError) {
    return NextResponse.json({ error: error.message }, { status: 429 });
  }

  if (
    error instanceof CreativeContentConfigurationError ||
    error instanceof FalImageConfigurationError ||
    error instanceof R2StorageConfigurationError
  ) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  if (
    error instanceof CreativeContentResponseError ||
    error instanceof FalImageResponseError ||
    error instanceof R2StorageObjectError
  ) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  if (error instanceof ApiError) {
    const status = error.status === 429 ? 429 : 502;
    return NextResponse.json(
      { error: `Gemini could not ${operation} (HTTP ${error.status})` },
      { status },
    );
  }

  if (error instanceof GroqApiError) {
    const status = error.status === 429 ? 429 : 502;
    return NextResponse.json(
      { error: `Groq could not ${operation} (HTTP ${error.status})` },
      { status },
    );
  }

  if (error instanceof FalApiError) {
    const status = error.status === 429 ? 429 : 502;
    return NextResponse.json(
      { error: `fal.ai could not ${operation} (HTTP ${error.status})` },
      { status },
    );
  }

  console.error(`Failed to ${operation}`, error);
  return NextResponse.json(
    { error: `The server could not ${operation}` },
    { status: 500 },
  );
}

export function noStoreJson(value: unknown, status = 200): NextResponse {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
