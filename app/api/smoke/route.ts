import { NextResponse } from "next/server";
import { AppError, EMBED_MODEL, EXTRACTOR_MODEL, chat, embed } from "@/lib/mesh";

export async function GET() {
  try {
    const chatResponse = await chat({
      model: EXTRACTOR_MODEL,
      messages: [{ role: "user", content: "Reply with exactly: MESH OK" }],
      temperature: 0,
      max_tokens: 16,
    });

    const reply = chatResponse.choices[0]?.message.content ?? null;
    const tokens = chatResponse.usage?.total_tokens ?? null;

    const embeddingResponse = await embed({
      model: EMBED_MODEL,
      input: ["hello"],
    });
    const vector = embeddingResponse.data[0]?.embedding;
    const dimensions = Array.isArray(vector) ? vector.length : null;

    return NextResponse.json({
      ok: true,
      reply,
      tokens,
      embedding: { model: EMBED_MODEL, dimensions },
    });
  } catch (err) {
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
    return NextResponse.json(
      { ok: false, error: { code: "unknown", message: "Unexpected server error." } },
      { status: 500 }
    );
  }
}
