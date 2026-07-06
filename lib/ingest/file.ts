import { PDFParse } from "pdf-parse";
import { AppError } from "@/lib/mesh";
import type { IngestSource } from "./types";

const MIN_LENGTH = 20;

export async function fromPdf(buffer: Buffer, filename?: string): Promise<IngestSource> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ pageJoiner: "" });
    const text = result.text.trim();
    if (text.length < MIN_LENGTH) {
      throw new AppError(
        "validation_error",
        "No extractable text found in this PDF — it may be scanned/image-only.",
        422
      );
    }
    const title = filename?.replace(/\.pdf$/i, "").trim();
    return { title: title || "Untitled PDF", text };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      "validation_error",
      "Failed to parse the PDF. Make sure it's a valid, non-encrypted PDF.",
      400
    );
  } finally {
    await parser.destroy();
  }
}
