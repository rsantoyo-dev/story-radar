import {
  getStoryKeywordPreferences,
  saveStoryKeywordPreferences,
} from "@/app/modules/stories/story-preferences.repository";
import { normalizeRelevanceText } from "@/app/modules/stories/evaluate-story-relevance";
import { NextResponse } from "next/server";

import { authorizeRadarCollector } from "../radar-api-auth";
import {
  requireRequestTopic,
  topicRequestErrorResponse,
} from "../radar-topic";

const MAX_TERMS_PER_LIST = 100;
const MAX_TERM_LENGTH = 80;

export async function GET(request: Request) {
  const unauthorizedResponse = authorizeRadarCollector(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  try {
    return NextResponse.json(
      await getStoryKeywordPreferences(await requireRequestTopic(request)),
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    console.error("Failed to read story keyword preferences", error);

    return NextResponse.json(
      { error: "The editorial preferences could not be read" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const unauthorizedResponse = authorizeRadarCollector(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  try {
    const payload = (await request.json()) as unknown;
    const preferences = parsePreferences(payload);

    return NextResponse.json(
      await saveStoryKeywordPreferences(
        await requireRequestTopic(request),
        preferences,
      ),
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    const message =
      error instanceof InvalidPreferencesError
        ? error.message
        : "The editorial preferences could not be saved";

    if (!(error instanceof InvalidPreferencesError)) {
      console.error("Failed to save story keyword preferences", error);
    }

    return NextResponse.json(
      { error: message },
      { status: error instanceof InvalidPreferencesError ? 400 : 500 },
    );
  }
}

function parsePreferences(payload: unknown) {
  if (!isRecord(payload)) {
    throw new InvalidPreferencesError("The request body must be an object");
  }

  const favoredTerms = parseTermList(payload.favoredTerms, "favoredTerms");
  const unfavoredTerms = parseTermList(
    payload.unfavoredTerms,
    "unfavoredTerms",
  );
  const favoredKeys = new Set(favoredTerms.map(normalizeRelevanceText));
  const overlappingTerm = unfavoredTerms.find((term) =>
    favoredKeys.has(normalizeRelevanceText(term)),
  );

  if (overlappingTerm) {
    throw new InvalidPreferencesError(
      `The term "${overlappingTerm}" cannot be favored and unfavored at the same time`,
    );
  }

  return {
    favoredTerms,
    unfavoredTerms,
  };
}

function parseTermList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((term) => typeof term === "string")) {
    throw new InvalidPreferencesError(`${field} must be an array of strings`);
  }

  if (value.length > MAX_TERMS_PER_LIST) {
    throw new InvalidPreferencesError(
      `${field} cannot contain more than ${MAX_TERMS_PER_LIST} terms`,
    );
  }

  const uniqueTerms = new Map<string, string>();

  value.forEach((rawTerm) => {
    const term = rawTerm.trim();

    if (!term) {
      return;
    }

    if (term.length > MAX_TERM_LENGTH) {
      throw new InvalidPreferencesError(
        `Each term must contain at most ${MAX_TERM_LENGTH} characters`,
      );
    }

    uniqueTerms.set(normalizeRelevanceText(term), term);
  });

  return [...uniqueTerms.values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class InvalidPreferencesError extends Error {}
