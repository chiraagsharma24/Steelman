import type { RetrievedChunk } from "@/lib/retrieve";

export function buildEvidenceBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "(no evidence retrieved)";
  return chunks.map((c) => `[${c.chunkId}] ${c.content}`).join("\n\n");
}
