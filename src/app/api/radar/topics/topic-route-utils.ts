import {
  TopicCatalogValidationError,
} from "@/app/modules/topics/topic-catalog.repository";
import { NextResponse } from "next/server";

export function noStoreJson(value: unknown, status = 200): NextResponse {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function jsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const value = (await request.json()) as unknown;

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TopicCatalogValidationError("The request body must be an object");
  }

  return value as Record<string, unknown>;
}

export function topicCatalogError(
  error: unknown,
  action: string,
): NextResponse {
  if (error instanceof TopicCatalogValidationError) {
    return noStoreJson({ error: error.message }, 400);
  }

  if (isUniqueViolation(error)) {
    return noStoreJson(
      { error: "A topic or RSS source with that identifier already exists" },
      409,
    );
  }

  console.error(`Failed to ${action}`, error);
  return noStoreJson({ error: `Unable to ${action}` }, 500);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
