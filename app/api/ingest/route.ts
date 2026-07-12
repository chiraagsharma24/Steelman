import { NextRequest, NextResponse } from "next/server";
import type { SourceType } from "@prisma/client";
import { AppError } from "@/lib/mesh";
import { handleApiError, withCors } from "@/lib/api";
import { fromText } from "@/lib/ingest/text";
import { fromUrl } from "@/lib/ingest/url";
import { fromPdf } from "@/lib/ingest/file";
import { fromYoutube } from "@/lib/ingest/youtube";
import { ingestAndStore } from "@/lib/ingest/store";
import type { IngestSource } from "@/lib/ingest/types";

export const runtime = "nodejs";
// Embedding a long source (many chunks, batched at 50/request — see
// lib/ingest/store.ts) is the slow part here; 60s is generous headroom for
// anything this app currently ingests, and matches the ceiling used on the
// analyze routes.
export const maxDuration = 60;

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
      } else if (body.sourceType === "YOUTUBE") {
        if (typeof body.url !== "string") {
          throw new AppError("validation_error", "`url` is required for sourceType YOUTUBE.", 400);
        }
        source = await fromYoutube(body.url);
        sourceType = "YOUTUBE";
      } else {
        throw new AppError(
          "validation_error",
          "`sourceType` must be one of TEXT, URL, YOUTUBE, or FILE (FILE requires multipart/form-data).",
          400
        );
      }
    }

    const result = await ingestAndStore(source, sourceType);
    return withCors(NextResponse.json({ ok: true, ...result }));
  } catch (err) {
    return withCors(handleApiError(err));
  }
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}
