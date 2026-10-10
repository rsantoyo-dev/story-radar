import { latestDraft2SessionResponse } from "../draft2-route";

export const runtime = "nodejs";

/** The latest Draft 2 session of a story (every column): the canvas reads it on load and after a run stops. */
export async function GET(request: Request) {
  return latestDraft2SessionResponse(request);
}
