import {
  EditorialEvaluationConfigurationError,
} from "@/app/modules/stories/editorial-evaluation.config";
import {
  EditorialEvaluationDailyLimitError,
  evaluateEditorialCandidates,
} from "@/app/modules/stories/evaluate-editorial-candidates";
import {
  EditorialEvaluationResponseError,
  EditorialProviderFallbackError,
} from "@/app/modules/stories/gemini-story-editorial-evaluator";
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
    const requestBody = await readEvaluationRequest(request);
    return NextResponse.json(
      await evaluateEditorialCandidates(
        await requireActiveRequestTopic(request),
        new Date(),
        { force: requestBody.force },
      ),
    );
  } catch (error) {
    if (error instanceof InvalidEditorialEvaluationRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

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

    if (error instanceof EditorialProviderFallbackError) {
      console.error("All editorial AI providers failed", error);
      return NextResponse.json(
        {
          error: `${error.providers.join(", ")} could not complete the editorial evaluation`,
        },
        { status: 502 },
      );
    }

    if (error instanceof EditorialEvaluationResponseError) {
      console.error("Editorial AI returned an invalid response", error);

      return NextResponse.json(
        { error: "Editorial AI returned an invalid editorial evaluation" },
        { status: 502 },
      );
    }

    console.error("Failed to evaluate editorial story candidates", error);

    return NextResponse.json(
      { error: "The editorial candidates could not be evaluated" },
      { status: 502 },
    );
  }
}

async function readEvaluationRequest(
  request: Request,
): Promise<{ force: boolean }> {
  const text = await request.text();
  if (!text.trim()) return { force: false };

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new InvalidEditorialEvaluationRequestError(
      "The editorial evaluation request must be valid JSON",
    );
  }

  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    ("force" in value && typeof value.force !== "boolean")
  ) {
    throw new InvalidEditorialEvaluationRequestError(
      "force must be a boolean",
    );
  }

  return {
    force:
      "force" in value && typeof value.force === "boolean"
        ? value.force
        : false,
  };
}

class InvalidEditorialEvaluationRequestError extends Error {}
