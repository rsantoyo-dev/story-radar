import {
  clearStoryRadarData,
  getStoryRadarDatabaseStats,
} from "@/app/modules/stories/story-radar.repository";
import { getEditorialEvaluationPublicConfig } from "@/app/modules/stories/editorial-evaluation.config";
import { getEditorialDashboardStats } from "@/app/modules/stories/story-editorial.repository";
import { NextResponse } from "next/server";

import { authorizeRadarCollector } from "../radar-api-auth";
import {
  requireRequestTopic,
  topicRequestErrorResponse,
} from "../radar-topic";

export async function GET(request: Request) {
  const unauthorizedResponse = authorizeRadarCollector(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  try {
    return NextResponse.json(await getRadarAdminStats(await requireRequestTopic(request)));
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    console.error("Failed to read Press Craftor database stats", error);

    return NextResponse.json(
      {
        error: "The database status could not be read",
      },
      {
        status: 500,
      },
    );
  }
}

export async function DELETE(request: Request) {
  const unauthorizedResponse = authorizeRadarCollector(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  if (request.headers.get("x-radar-confirm") !== "DELETE") {
    return NextResponse.json(
      {
        error: 'Header "X-Radar-Confirm: DELETE" is required',
      },
      {
        status: 400,
      },
    );
  }

  try {
    const topicId = await requireRequestTopic(request);
    const deleted = await clearStoryRadarData(topicId);

    return NextResponse.json({
      deleted,
      stats: await getRadarAdminStats(topicId),
    });
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    console.error("Failed to clear Press Craftor data", error);

    return NextResponse.json(
      {
        error: "The database data could not be cleared",
      },
      {
        status: 500,
      },
    );
  }
}

async function getRadarAdminStats(topicId: string) {
  const [database, editorial] = await Promise.all([
    getStoryRadarDatabaseStats(topicId),
    getEditorialDashboardStats(topicId, getEditorialEvaluationPublicConfig()),
  ]);

  return {
    ...database,
    editorial,
  };
}
