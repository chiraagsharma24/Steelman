import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/mesh";
import { handleApiError } from "@/lib/api";
import { runDebate } from "@/lib/debate/run";

export const runtime = "nodejs";

/**
 * Debug route for the debate pipeline (no UI yet — Day 4). Runs the full
 * extract -> retrieve -> debate -> referee -> persist flow and returns the
 * complete structured result so debate quality can be inspected directly.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => {
      throw new AppError("validation_error", "Request body must be valid JSON.", 400);
    });

    const documentId = typeof body.documentId === "string" ? body.documentId : undefined;
    const inputText = typeof body.inputText === "string" ? body.inputText : undefined;
    const question = typeof body.question === "string" ? body.question : undefined;

    if (!documentId && !inputText) {
      throw new AppError("validation_error", "Provide `documentId` or `inputText`.", 400);
    }

    const result = await runDebate({ documentId, inputText, question });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleApiError(err);
  }
}
