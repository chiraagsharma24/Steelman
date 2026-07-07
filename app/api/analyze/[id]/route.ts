import { NextRequest, NextResponse } from "next/server";
import { handleApiError, withCors } from "@/lib/api";
import { stepAnalysis } from "@/lib/analyze/run";

export const runtime = "nodejs";
// Each call does at most one claim's worth of work — one web search
// (capped at 30s, see RESPONSE_POLL_MAX_WAIT_MS in lib/mesh.ts) plus one
// 3-model consensus round — so this stays well under even Vercel Hobby's
// 60s ceiling regardless of how many claims the analysis has left.
export const maxDuration = 60;

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const result = await stepAnalysis(params.id);
    return withCors(NextResponse.json({ ok: true, ...result }));
  } catch (err) {
    return withCors(handleApiError(err));
  }
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}
