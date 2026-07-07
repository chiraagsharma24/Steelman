import { AppError, FACTCHECK_MODEL_1, responses } from "@/lib/mesh";
import { withRateLimitBackoff } from "@/lib/concurrency";
import type { Grounding, SourceRef } from "./schemas";

export interface GroundingResult {
  grounding: Grounding;
  contextText: string;
  sources: SourceRef[];
}

interface ResponsesOutputTextAnnotation {
  type?: string;
  url?: string;
  title?: string;
  start_index?: number;
  end_index?: number;
}
interface ResponsesOutputContent {
  type?: string;
  text?: string;
  annotations?: ResponsesOutputTextAnnotation[];
}
interface ResponsesOutputItem {
  type?: string;
  content?: ResponsesOutputContent[];
}

function extractTextAndSources(output: unknown[]): { text: string; sources: SourceRef[] } {
  let text = "";
  const sources: SourceRef[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const messageItem = item as ResponsesOutputItem;
    if (messageItem.type !== "message" || !Array.isArray(messageItem.content)) continue;

    for (const part of messageItem.content) {
      if (part?.type !== "output_text" || typeof part.text !== "string") continue;
      text += (text ? "\n" : "") + part.text;

      for (const annotation of part.annotations ?? []) {
        if (annotation?.type !== "url_citation" || typeof annotation.url !== "string") continue;
        const { start_index, end_index } = annotation;
        const snippet =
          typeof start_index === "number" && typeof end_index === "number"
            ? part.text.slice(start_index, end_index)
            : "";
        sources.push({
          title: typeof annotation.title === "string" ? annotation.title : annotation.url,
          url: annotation.url,
          snippet,
        });
      }
    }
  }

  return { text, sources };
}

/**
 * Attempts a real web search via Mesh's Responses API — `web_search_preview`
 * is only available on client.responses.create, not chat.completions (the
 * SDK's ChatCompletionParams.tools type only allows function-calling tools).
 *
 * VERIFIED end-to-end via a live call (output shape confirmed: a
 * `web_search_call` item followed by a `message` item whose
 * `content[].annotations` are `url_citation`s with `title`/`url`/
 * `start_index`/`end_index` into the message text). Runs as an async
 * background job on Mesh's side — lib/mesh.ts's `responses()` polls it to
 * completion before returning, so this function only ever sees a finished
 * result or a thrown AppError.
 */
async function attemptWebSearch(claimText: string): Promise<{ text: string; sources: SourceRef[] }> {
  const res = await responses({
    model: FACTCHECK_MODEL_1,
    input: `Search the web for evidence relevant to this claim and summarize what you find, citing your sources:\n\n"${claimText}"`,
    tools: [{ type: "web_search_preview" }],
  });

  const output = Array.isArray(res.output) ? res.output : [];
  const { text, sources } = extractTextAndSources(output);

  if (!text.trim()) {
    throw new AppError("upstream_error", "Web search returned no usable content.", 502);
  }

  return { text, sources };
}

/**
 * Gathers grounding for a claim: real web search results when available,
 * honestly falling back to "no grounding" (model-knowledge-only) when web
 * search is unavailable for any reason. Never silently pretends to have
 * searched when it hasn't. One backoff-retry on rate limits specifically —
 * web search jobs are heavier/costlier than a normal chat call, so we give a
 * transient rate limit one real chance before giving up on live grounding.
 *
 * `allowWebSearch: false` skips the attempt entirely — each web search job
 * places a real cost hold on the Mesh account (confirmed: $5/job, released
 * on completion), so only a handful of the most significant claims per
 * analysis are allowed to spend one (see lib/analyze/run.ts). The rest go
 * straight to model-knowledge without wasting a network round-trip.
 */
export async function gatherGrounding(
  claimText: string,
  allowWebSearch: boolean
): Promise<GroundingResult> {
  if (!allowWebSearch) {
    return { grounding: "MODEL_KNOWLEDGE", contextText: "", sources: [] };
  }
  try {
    const { text, sources } = await withRateLimitBackoff(
      () => attemptWebSearch(claimText),
      "analyze-websearch"
    );
    return { grounding: "WEB", contextText: text, sources };
  } catch (err) {
    console.warn(
      "[analyze] web search unavailable, falling back to model-knowledge-only:",
      err instanceof Error ? err.message : err
    );
    return { grounding: "MODEL_KNOWLEDGE", contextText: "", sources: [] };
  }
}
