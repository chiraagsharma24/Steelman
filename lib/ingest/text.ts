import { AppError } from "@/lib/mesh";
import type { IngestSource } from "./types";

const MIN_LENGTH = 20;

export function fromText(input: string, title?: string): IngestSource {
  const text = input.trim();
  if (text.length < MIN_LENGTH) {
    throw new AppError(
      "validation_error",
      "Pasted text is too short to ingest.",
      400
    );
  }
  return { title: title?.trim() || deriveTitle(text), text };
}

const TITLE_MAX_CHARS = 80;

function deriveTitle(text: string): string {
  const firstLine = (text.split("\n").find((line) => line.trim().length > 0) ?? "Untitled").trim();
  if (firstLine.length <= TITLE_MAX_CHARS) return firstLine;
  const truncated = firstLine.slice(0, TITLE_MAX_CHARS);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated}…`;
}
