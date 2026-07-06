export interface TextChunk {
  content: string;
  chunkIndex: number;
}

const MAX_CHARS = 3200;
const OVERLAP_CHARS = 600;

/**
 * Sentence-aware splitter: breaks on sentence-ending punctuation or blank
 * lines rather than fixed character offsets, so chunk boundaries don't land
 * mid-sentence.
 */
function splitSentences(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  return normalized
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])|\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function chunkText(
  text: string,
  maxChars = MAX_CHARS,
  overlapChars = OVERLAP_CHARS
): TextChunk[] {
  const sentences = splitSentences(text.trim());
  if (sentences.length === 0) return [];

  const step = Math.max(1, maxChars - overlapChars);
  const chunks: TextChunk[] = [];
  let current: string[] = [];
  let currentLen = 0;

  const flush = () => {
    if (current.length === 0) return;
    const content = current.join(" ").trim();
    if (content) chunks.push({ content, chunkIndex: chunks.length });
  };

  for (const sentence of sentences) {
    // A single sentence longer than the whole budget: hard-split by offset.
    if (sentence.length > maxChars) {
      flush();
      current = [];
      currentLen = 0;
      for (let i = 0; i < sentence.length; i += step) {
        chunks.push({ content: sentence.slice(i, i + maxChars), chunkIndex: chunks.length });
      }
      continue;
    }

    if (current.length > 0 && currentLen + sentence.length + 1 > maxChars) {
      flush();
      // Carry trailing sentences (up to overlapChars) into the next chunk.
      const overlapSentences: string[] = [];
      let overlapLen = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const s = current[i];
        if (overlapLen + s.length > overlapChars) break;
        overlapSentences.unshift(s);
        overlapLen += s.length + 1;
      }
      current = overlapSentences;
      currentLen = overlapLen;
    }

    current.push(sentence);
    currentLen += sentence.length + 1;
  }
  flush();

  return chunks;
}
