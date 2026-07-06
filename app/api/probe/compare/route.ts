import { NextResponse } from "next/server";
import { getMeshClient } from "@/lib/mesh";
import { handleApiError } from "@/lib/api";

export const runtime = "nodejs";

/**
 * One-time dev probe: confirms whether client.compare.create (streaming)
 * actually works against the live Mesh gateway with the installed SDK
 * (v0.1.0), ahead of building the Day 3 debate pipeline on top of it.
 */
export async function GET() {
  try {
    const client = getMeshClient();
    const stream = client.compare.create({
      models: ["openai/gpt-4o-mini", "google/gemini-2.5-flash"],
      messages: [{ role: "user", content: "Say hi in five words or fewer." }],
      stream: true,
    });

    const events: unknown[] = [];
    for await (const event of stream) {
      events.push(event);
    }

    return NextResponse.json({
      ok: true,
      supported: true,
      eventCount: events.length,
      sample: events.slice(0, 5),
    });
  } catch (err) {
    if (err instanceof TypeError) {
      return NextResponse.json({
        ok: true,
        supported: false,
        message: "client.compare.create appears unavailable in the installed SDK.",
        detail: err.message,
      });
    }
    return handleApiError(err);
  }
}
