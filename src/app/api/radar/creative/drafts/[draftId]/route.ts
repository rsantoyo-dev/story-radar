import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import {
  approveSavedCreativeDraft,
  refreshCreativeDraftCharacterReferences,
  saveCreativeDraft,
  setSavedCreativeDraftVisualFidelity,
  unapproveSavedCreativeDraft,
} from "@/app/modules/stories/manage-creative-content";
import { VISUAL_FIDELITY_MODES } from "@/app/modules/stories/creative-content.types";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "../../../creative-route-error";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ draftId: string }> };

export async function PUT(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const draftId = await parseId(context);

  if (!draftId) {
    return noStoreJson({ error: "draftId must be a valid UUID" }, 400);
  }

  try {
    return noStoreJson(
      await saveCreativeDraft(
        await requireActiveRequestTopic(request),
        draftId,
        await request.json(),
      ),
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "save the creative draft");
  }
}

export async function PATCH(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const draftId = await parseId(context);

  if (!draftId) {
    return noStoreJson({ error: "draftId must be a valid UUID" }, 400);
  }

  try {
    const body = (await request.json()) as {
      action?: unknown;
      humanReviewed?: unknown;
      expectedVersion?: number;
      mode?: unknown;
      reason?: unknown;
      by?: unknown;
    };
    if (
      body.action !== "approve" &&
      body.action !== "unapprove" &&
      body.action !== "refresh-character-references" &&
      body.action !== "set-visual-fidelity"
    ) {
      return noStoreJson(
        {
          error:
            "action must be approve, unapprove, refresh-character-references, or set-visual-fidelity",
        },
        400,
      );
    }
    if (
      body.humanReviewed !== undefined &&
      typeof body.humanReviewed !== "boolean"
    ) {
      return noStoreJson({ error: "humanReviewed must be true or false" }, 400);
    }
    const topicId = await requireActiveRequestTopic(request);

    if (body.action === "set-visual-fidelity") {
      const override = parseVisualFidelityBody(body);
      if ("error" in override) {
        return noStoreJson({ error: override.error }, 400);
      }
      const actor =
        typeof body.by === "string" && body.by.trim()
          ? body.by.trim().slice(0, 200)
          : null;
      return noStoreJson(
        await setSavedCreativeDraftVisualFidelity(
          topicId,
          draftId,
          override.value,
          actor,
        ),
      );
    }

    return noStoreJson(
      body.action === "approve"
        ? await approveSavedCreativeDraft(
            topicId,
            draftId,
            body.humanReviewed === true,
            body.expectedVersion,
          )
        : body.action === "unapprove"
          ? await unapproveSavedCreativeDraft(topicId, draftId)
          : await refreshCreativeDraftCharacterReferences(topicId, draftId),
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(
      error,
      "change the creative draft approval",
    );
  }
}

function parseVisualFidelityBody(body: {
  mode?: unknown;
  reason?: unknown;
}):
  | { value: { mode: null } | { mode: string; reason: string } }
  | { error: string } {
  if (body.mode === null || body.mode === undefined) {
    return { value: { mode: null } };
  }
  if (
    typeof body.mode !== "string" ||
    !(VISUAL_FIDELITY_MODES as readonly string[]).includes(body.mode)
  ) {
    return {
      error: `mode must be null or one of: ${VISUAL_FIDELITY_MODES.join(", ")}`,
    };
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return { error: "reason is required when setting a visual fidelity override" };
  }
  return { value: { mode: body.mode, reason: reason.slice(0, 500) } };
}

async function parseId(context: Context): Promise<string | undefined> {
  const { draftId } = await context.params;
  return UUID_PATTERN.test(draftId) ? draftId : undefined;
}
