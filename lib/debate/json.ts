import type { z } from "zod";
import type { ChatCompletionParams } from "meshapi-node-sdk";
import { AppError, chat } from "@/lib/mesh";

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseAndValidate<T>(raw: string, schema: z.ZodType<T>): T {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFences(raw));
  } catch {
    throw new AppError("validation_error", "Model returned invalid JSON.", 502);
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new AppError(
      "validation_error",
      `Model output failed schema validation: ${result.error.message}`,
      502
    );
  }
  return result.data;
}

async function requestOnce(params: ChatCompletionParams): Promise<string> {
  const res = await chat(params);
  const content = res.choices[0]?.message.content;
  return typeof content === "string" ? content : "";
}

const RETRY_NUDGE =
  "Your previous response was not valid JSON matching the required schema. Return ONLY valid JSON, no markdown fences, no commentary.";

/**
 * Runs a chat completion and validates its content against `schema`.
 * Mesh-level failures (AppError from chat(), e.g. rate limits) propagate
 * immediately with no retry here — that's handled by the caller. Only our
 * own JSON-parse/schema-validation failures trigger one retry with a nudge.
 */
export async function chatJson<T>(params: ChatCompletionParams, schema: z.ZodType<T>): Promise<T> {
  const raw = await requestOnce(params);
  try {
    return parseAndValidate(raw, schema);
  } catch (err) {
    console.warn(
      "[debate] model output failed validation, retrying once:",
      err instanceof Error ? err.message : err,
      "\n--- raw (first 500 chars) ---\n" + raw.slice(0, 500)
    );
    const retryRaw = await requestOnce({
      ...params,
      messages: [...params.messages, { role: "user", content: RETRY_NUDGE }],
    });
    try {
      return parseAndValidate(retryRaw, schema);
    } catch (retryErr) {
      console.error(
        "[debate] retry also failed:",
        retryErr instanceof Error ? retryErr.message : retryErr,
        "\n--- raw (first 500 chars) ---\n" + retryRaw.slice(0, 500)
      );
      throw retryErr;
    }
  }
}
