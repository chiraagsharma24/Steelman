import { AppError } from "@/lib/mesh";
import type { IngestSource } from "./types";

// jsdom/@mozilla/readability are imported lazily, only inside this
// function's URL branch — never at module load. jsdom pulls in an
// ESM-only transitive dep (@exodus/bytes via html-encoding-sniffer) that
// crashes with ERR_REQUIRE_ESM on Vercel's serverless build. Keeping the
// import out of the module's top level means TEXT/YOUTUBE requests (which
// never touch this file's code) can't be taken down by it, and if the
// import itself still fails at runtime, we degrade gracefully below
// instead of 500ing.

const MIN_LENGTH = 200;
const FETCH_TIMEOUT_MS = 15_000;

export async function fromUrl(rawUrl: string): Promise<IngestSource> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppError("validation_error", "That doesn't look like a valid URL.", 400);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AppError("validation_error", "Only http/https URLs are supported.", 400);
  }

  let html: string;
  try {
    const res = await fetch(parsed.toString(), {
      headers: { "user-agent": "Mozilla/5.0 (compatible; SteelmanBot/1.0)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new AppError(
        "upstream_error",
        `Fetching the URL failed (HTTP ${res.status}).`,
        502
      );
    }
    html = await res.text();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      "upstream_error",
      "Could not fetch the URL. Check that it's reachable.",
      502
    );
  }

  let article: { title?: string | null; textContent?: string | null } | null;
  try {
    const [{ JSDOM }, { Readability }] = await Promise.all([
      import("jsdom"),
      import("@mozilla/readability"),
    ]);
    const dom = new JSDOM(html, { url: parsed.toString() });
    article = new Readability(dom.window.document).parse();
  } catch {
    throw new AppError(
      "upstream_error",
      "URL analysis is temporarily unavailable — paste the text or use a YouTube link instead.",
      503
    );
  }

  const text = article?.textContent?.trim() ?? "";

  if (text.length < MIN_LENGTH) {
    throw new AppError(
      "validation_error",
      "Could not extract readable article content from that URL.",
      422
    );
  }

  return { title: article?.title?.trim() || parsed.hostname, text };
}
