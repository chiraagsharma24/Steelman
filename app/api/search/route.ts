import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/mesh";
import { handleApiError } from "@/lib/api";
import { searchChunks } from "@/lib/retrieve";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => {
      throw new AppError("validation_error", "Request body must be valid JSON.", 400);
    });

    if (typeof body.query !== "string" || body.query.trim().length === 0) {
      throw new AppError("validation_error", "`query` is required.", 400);
    }

    const results = await searchChunks(body.query, {
      topK: typeof body.topK === "number" ? body.topK : undefined,
      documentId: typeof body.documentId === "string" ? body.documentId : undefined,
    });

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return handleApiError(err);
  }
}
