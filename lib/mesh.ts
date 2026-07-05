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
} from "meshapi-node-sdk";


export const EXTRACTOR_MODEL = "openai/gpt-4o-mini";
export const PROSECUTOR_MODEL = "openai/gpt-4o";
export const DEFENDER_MODEL = "anthropic/claude-sonnet-4.5";
export const REFEREE_MODEL = "openai/gpt-4o";
export const EMBED_MODEL = "openai/text-embedding-3-small";

export type AppErrorCode =
  | "rate_limit_exceeded"
  | "spend_limit_exceeded"
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
  unauthorized: "Mesh rejected the request credentials. Check MESH_API_KEY.",
  model_not_found: "The requested model is not available on Mesh.",
  upstream_error: "The upstream model provider failed. Please try again.",
  validation_error: "The request sent to Mesh was invalid.",
  unknown: "Something went wrong talking to Mesh.",
};

const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set([
  "rate_limit_exceeded",
  "spend_limit_exceeded",
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

