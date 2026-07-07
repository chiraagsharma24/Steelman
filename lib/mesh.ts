import {
  MeshAPI,
  MeshAPIApiError,
  type ChatCompletionParams,
  type ChatCompletionResponse,
  type CompareParams,
  type CompareResponse,
  type CompareStreamEvent,
  type EmbeddingsParams,
  type EmbeddingsResponse,
  type ResponsesParams,
  type ResponsesResponse,
} from "meshapi-node-sdk";


export const EXTRACTOR_MODEL = "openai/gpt-4o-mini";
export const PROSECUTOR_MODEL = "openai/gpt-4o";
export const DEFENDER_MODEL = "anthropic/claude-sonnet-4.5";
export const REFEREE_MODEL = "openai/gpt-4o";
export const EMBED_MODEL = "openai/text-embedding-3-small";

// Three provider-diverse models for fact-check consensus (Day 5) — deliberately
// not reusing PROSECUTOR/REFEREE since those are both "openai/gpt-4o"; genuine
// cross-model bias defense needs distinct providers, not just distinct names.
export const FACTCHECK_MODEL_1 = "openai/gpt-4o";
export const FACTCHECK_MODEL_2 = "anthropic/claude-sonnet-4.5";
export const FACTCHECK_MODEL_3 = "google/gemini-2.5-flash";

export type AppErrorCode =
  | "rate_limit_exceeded"
  | "spend_limit_exceeded"
  | "insufficient_balance"
  | "unauthorized"
  | "model_not_found"
  | "upstream_error"
  | "validation_error"
  | "unknown";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  constructor(
    code: AppErrorCode,
    message: string,
    status: number,
    requestId?: string,
    retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const USER_SAFE_MESSAGES: Record<AppErrorCode, string> = {
  rate_limit_exceeded: "Mesh is rate-limiting requests right now. Please try again shortly.",
  spend_limit_exceeded: "The Mesh spend limit has been reached. Contact the workspace owner.",
  insufficient_balance: "This Mesh workspace doesn't have enough balance for this operation.",
  unauthorized: "Mesh rejected the request credentials. Check MESH_API_KEY.",
  model_not_found: "The requested model is not available on Mesh.",
  upstream_error: "The upstream model provider failed. Please try again.",
  validation_error: "The request sent to Mesh was invalid.",
  unknown: "Something went wrong talking to Mesh.",
};

const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set([
  "rate_limit_exceeded",
  "spend_limit_exceeded",
  "insufficient_balance",
  "unauthorized",
  "model_not_found",
  "upstream_error",
  "validation_error",
]);

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }
  if (err instanceof MeshAPIApiError) {
    const code: AppErrorCode = KNOWN_ERROR_CODES.has(err.errorCode)
      ? (err.errorCode as AppErrorCode)
      : "unknown";
    return new AppError(
      code,
      USER_SAFE_MESSAGES[code],
      err.status,
      err.requestId,
      err.retryAfterSeconds
    );
  }
  if (err instanceof Error) {
    return new AppError("unknown", USER_SAFE_MESSAGES.unknown, 0, undefined, undefined);
  }
  return new AppError("unknown", USER_SAFE_MESSAGES.unknown, 0, undefined, undefined);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new AppError(
      "unknown",
      `Missing required environment variable: ${name}`,
      0,
      undefined,
      undefined
    );
  }
  return value;
}

let cachedClient: MeshAPI | undefined;

export function getMeshClient(): MeshAPI {
  if (cachedClient) return cachedClient;
  cachedClient = new MeshAPI({
    baseUrl: process.env.MESH_BASE_URL ?? "https://api.meshapi.ai",
    token: requireEnv("MESH_API_KEY"),
  });
  return cachedClient;
}

export async function chat(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
  try {
    const client = getMeshClient();
    return await client.chat.completions.create({ ...params, stream: false });
  } catch (err) {
    throw toAppError(err);
  }
}

export async function compare(
  params: CompareParams
): Promise<CompareResponse | AsyncIterable<CompareStreamEvent>> {
  try {
    const client = getMeshClient();
    if (params.stream) {
      return client.compare.create({ ...params, stream: true });
    }
    return await client.compare.create({ ...params, stream: false });
  } catch (err) {
    throw toAppError(err);
  }
}

export async function embed(params: EmbeddingsParams): Promise<EmbeddingsResponse> {
  try {
    const client = getMeshClient();
    return await client.embeddings.create(params);
  } catch (err) {
    throw toAppError(err);
  }
}

// Confirmed via a live call: web_search_preview responses come back with
// status:"queued", background:true, output:[] — the search runs as an async
// background job. The SDK has no typed retrieve/poll method, so we poll the
// (undocumented-in-SDK, but real) GET /v1/responses/{id} endpoint directly.
const RESPONSE_POLL_INTERVAL_MS = 1500;
// Kept comfortably under the 60s maxDuration on the analyze routes (see
// app/api/analyze/route.ts and app/api/analyze/[id]/route.ts) — each of
// those handles at most one web search plus one 3-model consensus round per
// request, so this needs headroom for the consensus call after it returns.
const RESPONSE_POLL_MAX_WAIT_MS = 30_000;
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

async function pollResponseUntilDone(id: string): Promise<ResponsesResponse> {
  const token = requireEnv("MESH_API_KEY");
  const baseUrl = process.env.MESH_BASE_URL ?? "https://api.meshapi.ai";
  const deadline = Date.now() + RESPONSE_POLL_MAX_WAIT_MS;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, RESPONSE_POLL_INTERVAL_MS));
    const res = await fetch(`${baseUrl}/v1/responses/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new AppError("upstream_error", "Failed to poll Mesh response status.", res.status);
    }
    const body = (await res.json()) as ResponsesResponse;
    if (typeof body.status === "string" && TERMINAL_STATUSES.has(body.status)) {
      return body;
    }
  }
  throw new AppError(
    "upstream_error",
    "Timed out waiting for the web search job to complete.",
    504
  );
}

// The Responses API (not chat.completions) is the only place Mesh exposes
// built-in tools like `web_search_preview` — see lib/analyze/factcheck.ts.
// Background jobs (see above) are polled to completion before returning, so
// callers always get a `status: "completed"` (or throw) response — the async
// nature is fully hidden here, consistent with chat()/compare()/embed().
export async function responses(params: ResponsesParams): Promise<ResponsesResponse> {
  try {
    const client = getMeshClient();
    const initial = await client.responses.create({ ...params, stream: false });
    if (!initial.background || initial.status === "completed") {
      return initial;
    }
    if (typeof initial.id !== "string") {
      throw new AppError("upstream_error", "Mesh returned a background job with no id to poll.", 502);
    }
    // Cost sanity: each of these is a real, billable background job — log it
    // so per-analysis spend is visible in the server log, not just inferred.
    const startedAt = Date.now();
    console.log(`[mesh] web search job ${initial.id} started (background)`);
    const result = await pollResponseUntilDone(initial.id);
    console.log(`[mesh] web search job ${initial.id} completed in ${Date.now() - startedAt}ms`);
    return result;
  } catch (err) {
    throw toAppError(err);
  }
}

