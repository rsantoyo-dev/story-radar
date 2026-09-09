import { resolveDeliveryFile } from "@/app/modules/meta/freeze-publication-package";
import { readPrivateR2ImageFile } from "@/app/modules/stories/r2-storage";

/**
 * Public, unauthenticated delivery of a frozen publication JPEG (PUB-03). The
 * opaque token is the only capability — there is no `Authorization` here so
 * Instagram's servers can fetch the file. The R2 object key, any credential and
 * every internal identifier stay on the server; a failure returns a bare status
 * with no revealing body.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

type Context = { params: Promise<{ token: string }> };

const IMMUTABLE_HEADERS = {
  "Content-Type": "image/jpeg",
  "Cache-Control": "public, max-age=600",
  "Content-Disposition": "inline",
} as const;

async function locate(context: Context) {
  const { token } = await context.params;
  if (!TOKEN_PATTERN.test(token)) return { code: 404 as const };
  const target = await resolveDeliveryFile(token).catch(() => undefined);
  if (!target) return { code: 404 as const };
  if (target.disposition === "gone") return { code: 410 as const };
  return { code: 200 as const, target };
}

export async function GET(_request: Request, context: Context) {
  try {
    const located = await locate(context);
    if (located.code !== 200) {
      return new Response(null, { status: located.code });
    }
    const file = await readPrivateR2ImageFile({
      objectKey: located.target.objectKey,
      contentType: located.target.contentType,
    });
    return new Response(file, { headers: IMMUTABLE_HEADERS });
  } catch {
    return new Response(null, { status: 502 });
  }
}

export async function HEAD(_request: Request, context: Context) {
  try {
    const located = await locate(context);
    return new Response(null, {
      status: located.code,
      headers: located.code === 200 ? IMMUTABLE_HEADERS : undefined,
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
