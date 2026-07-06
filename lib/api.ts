import { NextResponse } from "next/server";
import { AppError } from "@/lib/mesh";

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
