import { randomUUID } from "crypto";
import { Prisma, type SourceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError, EMBED_MODEL, embed } from "@/lib/mesh";
import { chunkText } from "./chunk";
import type { IngestSource } from "./types";

const EMBED_BATCH_SIZE = 50;
const INSERT_BATCH_SIZE = 200;
const TRANSACTION_TIMEOUT_MS = 20_000;

export interface IngestResult {
  documentId: string;
  title: string;
  chunkCount: number;
}

async function embedChunks(contents: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < contents.length; i += EMBED_BATCH_SIZE) {
    const batch = contents.slice(i, i + EMBED_BATCH_SIZE);
    const res = await embed({ model: EMBED_MODEL, input: batch });
    const sorted = [...res.data].sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      if (!Array.isArray(item.embedding)) {
        throw new AppError("upstream_error", "Mesh returned a non-numeric embedding.", 502);
      }
      vectors.push(item.embedding as number[]);
    }
    console.log(
      `[ingest] embedded ${Math.min(i + EMBED_BATCH_SIZE, contents.length)}/${contents.length} chunks`
    );
  }
  return vectors;
}

export async function ingestAndStore(
  source: IngestSource,
  sourceType: SourceType
): Promise<IngestResult> {
  const chunks = chunkText(source.text);
  if (chunks.length === 0) {
    throw new AppError("validation_error", "Nothing to ingest — extracted text was empty.", 400);
  }

  console.log(
    `[ingest] "${source.title}": ${chunks.length} chunks, embedding via ${EMBED_MODEL}`
  );

  // Embed everything before touching the DB — if this fails, nothing has
  // been written yet, so there's nothing to roll back.
  const vectors = await embedChunks(chunks.map((c) => c.content));

  const documentId = randomUUID();

  await prisma.$transaction(
    async (tx) => {
      await tx.document.create({
        data: {
          id: documentId,
          title: source.title,
          sourceType,
          rawText: source.text,
        },
      });

      // Batched multi-row INSERTs (not one round-trip per chunk) — Neon's
      // per-statement latency made N sequential inserts blow past Prisma's
      // default 5s interactive-transaction timeout on anything but trivial
      // documents.
      for (let i = 0; i < chunks.length; i += INSERT_BATCH_SIZE) {
        const batch = chunks.slice(i, i + INSERT_BATCH_SIZE);
        const rows = batch.map((chunk, j) => {
          const vectorLiteral = `[${vectors[i + j].join(",")}]`;
          return Prisma.sql`(${randomUUID()}, ${documentId}, ${chunk.content}, ${chunk.chunkIndex}, ${vectorLiteral}::vector)`;
        });
        await tx.$executeRaw`
          INSERT INTO "Chunk" ("id", "documentId", "content", "chunkIndex", "embedding")
          VALUES ${Prisma.join(rows)}
        `;
      }
    },
    { timeout: TRANSACTION_TIMEOUT_MS }
  );

  console.log(`[ingest] stored document ${documentId} with ${chunks.length} chunks`);

  return { documentId, title: source.title, chunkCount: chunks.length };
}
