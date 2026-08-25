import {
  EditorialEvaluationConfigurationError,
} from "@/app/modules/stories/editorial-evaluation.config";
import {
  EditorialEvaluationDailyLimitError,
  evaluateEditorialCandidates,
} from "@/app/modules/stories/evaluate-editorial-candidates";
import { EditorialEvaluationResponseError } from "@/app/modules/stories/gemini-story-editorial-evaluator";
import { ApiError } from "@google/genai";
import { NextResponse } from "next/server";

import { authorizeRadarCollector } from "../radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "../radar-topic";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const unauthorizedResponse = authorizeRadarCollector(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  try {
    return NextResponse.json(
      await evaluateEditorialCandidates(await requireActiveRequestTopic(request)),
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    if (error instanceof EditorialEvaluationDailyLimitError) {
      return NextResponse.json(
        {
          error: error.message,
          daily: {
            ...error.usage,
            maxRuns: error.configuration.maxRunsPerDay,
            maxStories: error.configuration.maxStoriesPerDay,
          },
        },
        { status: 429 },
      );
    }

    if (error instanceof EditorialEvaluationConfigurationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 503 },
      );
    }

    if (error instanceof EditorialEvaluationResponseError) {
      console.error("Gemini returned an invalid editorial response", error);

      return NextResponse.json(
        { error: "Gemini returned an invalid editorial evaluation" },
        { status: 502 },
      );
    }

    if (error instanceof ApiError) {
      console.error("Gemini API failed during editorial evaluation", error);
      const status = [429, 503].includes(error.status)
        ? error.status
        : 502;

      return NextResponse.json(
        {
          error:
            status === 429
              ? "Gemini daily or rate limit reached"
              : status === 503
                ? "Gemini is temporarily unavailable; try again later"
                : "Gemini rejected the editorial evaluation request",
        },
        { status },
      );
    }

    console.error("Failed to evaluate editorial story candidates", error);

    return NextResponse.json(
      { error: "The editorial candidates could not be evaluated" },
      { status: 502 },
    );
  }
}
