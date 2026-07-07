import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/mesh";
import { handleApiError, withCors } from "@/lib/api";
import { startAnalysis } from "@/lib/analyze/run";

export const runtime = "nodejs";
// Classification (the only work this route does) is a handful of chat calls
// over the source text — comfortably fast, but generous headroom in case of
// an unusually long source. The actual fact-checking loop, which is what
// used to make this route take minutes, now happens across separate
// GET /api/analyze/[id] polls (see lib/analyze/run.ts) instead of here.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => {
      throw new AppError("validation_error", "Request body must be valid JSON.", 400);
    });

    const documentId = typeof body.documentId === "string" ? body.documentId : undefined;
    const inputText = typeof body.inputText === "string" ? body.inputText : undefined;
    const title = typeof body.title === "string" ? body.title : undefined;

    if (!documentId && !inputText) {
      throw new AppError("validation_error", "Provide `documentId` or `inputText`.", 400);
    }

    const result = await startAnalysis({ documentId, inputText, title });
    return withCors(NextResponse.json({ ok: true, ...result }));
  } catch (err) {
    return withCors(handleApiError(err));
  }
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}
