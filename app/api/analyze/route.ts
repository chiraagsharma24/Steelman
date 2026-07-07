import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/mesh";
import { handleApiError } from "@/lib/api";
import { runAnalysis } from "@/lib/analyze/run";

export const runtime = "nodejs";

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

    const result = await runAnalysis({ documentId, inputText, title });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleApiError(err);
  }
}
