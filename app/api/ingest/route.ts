import { NextRequest, NextResponse } from "next/server";
import type { SourceType } from "@prisma/client";
import { AppError } from "@/lib/mesh";
import { handleApiError } from "@/lib/api";
import { fromText } from "@/lib/ingest/text";
import { fromUrl } from "@/lib/ingest/url";
import { fromPdf } from "@/lib/ingest/file";
import { ingestAndStore } from "@/lib/ingest/store";
import type { IngestSource } from "@/lib/ingest/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let source: IngestSource;
    let sourceType: SourceType;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        throw new AppError("validation_error", "Expected a `file` field for file uploads.", 400);
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      source = await fromPdf(buffer, file.name);
      sourceType = "FILE";
    } else {
      const body = await request.json().catch(() => {
        throw new AppError("validation_error", "Request body must be valid JSON.", 400);
      });

      if (body.sourceType === "TEXT") {
        if (typeof body.text !== "string") {
          throw new AppError("validation_error", "`text` is required for sourceType TEXT.", 400);
        }
        source = fromText(body.text, typeof body.title === "string" ? body.title : undefined);
        sourceType = "TEXT";
      } else if (body.sourceType === "URL") {
        if (typeof body.url !== "string") {
          throw new AppError("validation_error", "`url` is required for sourceType URL.", 400);
        }
        source = await fromUrl(body.url);
        sourceType = "URL";
      } else {
        throw new AppError(
          "validation_error",
          "`sourceType` must be one of TEXT, URL, or FILE (FILE requires multipart/form-data).",
          400
        );
      }
    }

    const result = await ingestAndStore(source, sourceType);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleApiError(err);
  }
}
