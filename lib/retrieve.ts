import { prisma } from "@/lib/prisma";
import { AppError, EMBED_MODEL, embed } from "@/lib/mesh";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
}

interface ChunkDistanceRow {
  id: string;
  documentId: string;
  content: string;
  distance: number;
}

export async function searchChunks(
  query: string,
  opts: { topK?: number; documentId?: string } = {}
): Promise<RetrievedChunk[]> {
  const topK = opts.topK ?? 8;

  const res = await embed({ model: EMBED_MODEL, input: [query] });
  const vector = res.data[0]?.embedding;
  if (!Array.isArray(vector)) {
    throw new AppError("upstream_error", "Mesh returned a non-numeric embedding for the query.", 502);
  }
  const vectorLiteral = `[${vector.join(",")}]`;

  const rows = opts.documentId
    ? await prisma.$queryRaw<ChunkDistanceRow[]>`
        SELECT "id", "documentId", "content", ("embedding" <=> ${vectorLiteral}::vector) AS distance
        FROM "Chunk"
        WHERE "documentId" = ${opts.documentId} AND "embedding" IS NOT NULL
        ORDER BY distance ASC
        LIMIT ${topK}
      `
    : await prisma.$queryRaw<ChunkDistanceRow[]>`
        SELECT "id", "documentId", "content", ("embedding" <=> ${vectorLiteral}::vector) AS distance
        FROM "Chunk"
        WHERE "embedding" IS NOT NULL
        ORDER BY distance ASC
        LIMIT ${topK}
      `;

  return rows.map((r) => ({
    chunkId: r.id,
    documentId: r.documentId,
    content: r.content,
    score: 1 - r.distance,
  }));
}
