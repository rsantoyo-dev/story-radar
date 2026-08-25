import { NextResponse } from "next/server";

export function authorizeRadarCollector(
  request: Request,
): NextResponse | undefined {
  const configuredSecret = process.env.RADAR_COLLECTOR_SECRET?.trim();

  if (!configuredSecret) {
    return NextResponse.json(
      {
        error: "RADAR_COLLECTOR_SECRET is not configured",
      },
      {
        status: 503,
      },
    );
  }

  const authorization = request.headers.get("authorization");

  if (authorization !== `Bearer ${configuredSecret}`) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": "Bearer",
        },
      },
    );
  }

  return undefined;
}
