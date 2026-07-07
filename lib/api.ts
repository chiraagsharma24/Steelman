import { NextResponse } from "next/server";
import { AppError } from "@/lib/mesh";

// The browser extension (a separate project, different origin — a
// chrome-extension:// URL) calls the analyze endpoints directly, so they
// need CORS enabled. Scoped to just those routes (each imports this
// explicitly) rather than applied site-wide via next.config. Wide open
// (`*`) rather than locked to one origin because nothing behind these
// routes is per-user or cookie-authenticated — it's the same public
// Mesh-backed analysis anyone hitting the API gets.
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function withCors(res: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.headers.set(key, value);
  }
  return res;
}

export function handleApiError(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: err.code,
          message: err.message,
          requestId: err.requestId,
          retryAfterSeconds: err.retryAfterSeconds,
        },
      },
      { status: err.status || 500 }
    );
  }
  console.error("[api] unhandled error:", err);
  return NextResponse.json(
    { ok: false, error: { code: "unknown", message: "Unexpected server error." } },
    { status: 500 }
  );
}
