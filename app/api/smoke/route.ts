import { NextResponse } from "next/server";
import { EMBED_MODEL, EXTRACTOR_MODEL, chat, embed } from "@/lib/mesh";
import { handleApiError } from "@/lib/api";

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
    return handleApiError(err);
  }
}
