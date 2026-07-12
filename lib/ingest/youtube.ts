import { AppError } from "@/lib/mesh";
import type { IngestSource } from "./types";

const MIN_LENGTH = 20;

// youtube-transcript-plus returns raw caption text with HTML entities
// (e.g. "&#39;") undecoded. Decode without jsdom — jsdom pulls in an
// ESM-only transitive dep (@exodus/bytes via html-encoding-sniffer) that
// crashes with ERR_REQUIRE_ESM on Vercel's serverless build.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (match, name) => NAMED_ENTITIES[name] ?? match);
}

export async function fromYoutube(url: string): Promise<IngestSource> {
  // Imported lazily, only inside this function — not at module load. This
  // is the SAME package that turned out to be the real cause of every
  // /api/ingest request 500ing on Vercel (not just YOUTUBE/URL requests):
  // youtube-transcript-plus is ESM-only, and route.ts imports fromYoutube
  // unconditionally, so a top-level `import` here previously crashed the
  // whole route's module load — taking TEXT requests down with it, even
  // though TEXT never touches this file's logic. See lib/ingest/url.ts and
  // lib/ingest/file.ts for the same fix applied to their own ESM deps.
  const {
    fetchTranscript,
    YoutubeTranscriptInvalidVideoIdError,
    YoutubeTranscriptVideoUnavailableError,
    YoutubeTranscriptDisabledError,
    YoutubeTranscriptNotAvailableError,
    YoutubeTranscriptNotAvailableLanguageError,
    YoutubeTranscriptTooManyRequestError,
  } = await import("youtube-transcript-plus");

  try {
    // Explicit lang: "en" is required — without it the library picked an
    // arbitrary caption track (Albanian, Arabic) instead of English for two
    // of three videos tested. Steelman only supports English video sources
    // for now.
    const result = await fetchTranscript(url, { videoDetails: true, lang: "en" });
    const rawText = result.segments.map((s) => s.text).join(" ");
    const text = decodeHtmlEntities(rawText).trim();

    if (text.length < MIN_LENGTH) {
      throw new AppError("validation_error", "This video's transcript is too short to analyze.", 422);
    }

    return { title: decodeHtmlEntities(result.videoDetails.title), text };
  } catch (err) {
    if (err instanceof AppError) throw err;

    if (err instanceof YoutubeTranscriptInvalidVideoIdError) {
      throw new AppError("validation_error", "That doesn't look like a valid YouTube URL.", 400);
    }
    if (err instanceof YoutubeTranscriptVideoUnavailableError) {
      throw new AppError("validation_error", "That YouTube video is unavailable or private.", 404);
    }
    if (err instanceof YoutubeTranscriptDisabledError) {
      throw new AppError("validation_error", "Captions are disabled for this video.", 422);
    }
    if (err instanceof YoutubeTranscriptNotAvailableLanguageError) {
      throw new AppError(
        "validation_error",
        `This video has no English transcript (available: ${err.availableLangs.join(", ") || "none"}). Steelman currently only supports English-captioned videos.`,
        422
      );
    }
    if (err instanceof YoutubeTranscriptNotAvailableError) {
      throw new AppError("validation_error", "No transcript is available for this video.", 422);
    }
    if (err instanceof YoutubeTranscriptTooManyRequestError) {
      throw new AppError(
        "rate_limit_exceeded",
        "YouTube is rate-limiting transcript requests right now. Try again shortly.",
        429
      );
    }

    throw new AppError("upstream_error", "Could not fetch this video's transcript.", 502);
  }
}
