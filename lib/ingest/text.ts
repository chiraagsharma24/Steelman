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

function deriveTitle(text: string): string {
  const firstLine = text.split("\n").find((line) => line.trim().length > 0) ?? "Untitled";
  return firstLine.trim().slice(0, 120);
}
