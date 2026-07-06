-- Vector similarity index for Chunk.embedding.
-- Not expressible in schema.prisma (Prisma has no vector/operator-class
-- support), so this migration is hand-written rather than generated.
-- HNSW (not IVFFlat) so lookups stay correct/fast even before the table
-- has enough rows for IVFFlat's clustering to be meaningful.
CREATE INDEX IF NOT EXISTS "Chunk_embedding_hnsw_idx"
  ON "Chunk" USING hnsw ("embedding" vector_cosine_ops);
