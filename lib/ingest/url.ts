import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { AppError } from "@/lib/mesh";
import type { IngestSource } from "./types";

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

  const dom = new JSDOM(html, { url: parsed.toString() });
  const article = new Readability(dom.window.document).parse();
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
