import { AppError, EXTRACTOR_MODEL } from "@/lib/mesh";
import { requestOnce, stripCodeFences } from "@/lib/chatJson";
import { mapWithConcurrency, withRateLimitBackoff } from "@/lib/concurrency";
import { chunkText } from "@/lib/ingest/chunk";
import {
  ClaimBatchSchema,
  ClassifiedClaimSchema,
  ClaimSelectionSchema,
  type ClassifiedClaim,
} from "./schemas";

// Long sources (a claim-dense transcript, a long article) are split into
// batches for extraction instead of one truncated single-shot call — a
// single call over a long transcript either misses everything past the
// truncation point, or (if forced to cover it all) overflows output tokens.
// Batching also means one batch's failure can't take down the whole source.
const BATCH_CHARS = 9_000;
const BATCH_OVERLAP_CHARS = 300;
const MAX_CONCURRENT_BATCHES = 3;
const BATCH_MAX_TOKENS = 4500;

// Final cap on claims actually analyzed (each checkable claim triggers a
// 3-model fact-check, so this bounds cost/latency and keeps the dashboard
// scannable). When exceeded, claims are SELECTED by significance — never
// truncated or dropped by arbitrary order.
const MAX_TOTAL_CLAIMS = 20;

const SYSTEM_PROMPT = `You are a neutral claim classifier. Extract discrete, distinct claims made in this excerpt of a larger source — assertions someone could evaluate independently, not vague topics. This is one excerpt of a longer document: extract every distinct claim you find here, however many that is. A short or filler-heavy excerpt may have none; a dense one may have many. Do not artificially pad or limit the count to hit a target number.

CLAIM TEXT MUST BE VERBATIM: reproduce each claim's wording exactly as it appears in the source. Never shorten, summarize, paraphrase, or truncate claim text — not even to fit a length or count limit. A complete, valid JSON response with fewer claims is always better than a response that mangles claim wording to fit more in.

Claim types:
- FACTUAL: an assertion about verifiable facts (statistics, events, causal claims, quotes, historical facts).
- OPINION: a subjective judgment or belief, not empirically verifiable.
- PREDICTION: a claim about the future.
- VALUE_JUDGMENT: a normative claim about what is good/bad/right/wrong.

checkable: true ONLY for FACTUAL claims that are specific and empirically verifiable — not vague generalities.

framing: an array of NEUTRALLY-named rhetorical techniques present in how the claim is stated, if any. Most claims should have an EMPTY array — only include a flag when it is genuinely, clearly present. Detect the technique from wording alone, never from which side or conclusion it favors. The technique is the same technique on every side of every issue:
- "emotional language": morally loaded or highly charged wording used in place of neutral description — e.g. "heartless act that shatters lives" is exactly the same technique as "flooding our country, destroying communities" or "greedy corporations". Charged language critical of the political left is flagged exactly like charged language critical of the political right, business, immigrants, police, or any other subject.
- "loaded terms": a label that presupposes a conclusion instead of describing neutrally — "job creators" (for business owners) and "handouts" (for subsidies) are the same technique as "gun grabbers" (for gun-control advocates) or "gun nuts" (for gun-rights advocates).
- "cherry-picking": citing a favorable statistic or example while omitting comparably relevant contrary data — regardless of which conclusion the cherry-picked data supports.
- "missing context", "false balance", "unsourced statistic": likewise judged purely from the structure of the claim, not its political valence.

CRITICAL NEUTRALITY RULES:
- Judge the CLAIM as stated, never the creator, author, channel, or speaker. Never infer or mention political affiliation, party, or ideology.
- Apply identical standards regardless of the claim's political direction or subject matter.
- Framing flags describe rhetorical technique objectively — they are NOT accusations of lying or bad faith.
- Do not invent framing flags just to seem balanced or to "both-sides" the analysis. An ordinary, plainly stated claim should have zero framing flags.
- Self-check before finalizing each claim: if this exact wording pattern appeared in a claim with the opposite political conclusion, would you flag it the same way? If your answer would change based on the conclusion rather than the wording itself, correct the inconsistency before responding.

Respond with ONLY valid JSON, no markdown fences, no commentary:
{"claims": [{"id": string, "text": string, "type": "FACTUAL"|"OPINION"|"PREDICTION"|"VALUE_JUDGMENT", "checkable": boolean, "framing": string[]}]}`;

const RETRY_NUDGE =
  "Your previous response was not valid JSON matching the required schema. Return ONLY valid JSON, no markdown fences, no commentary. Do not shorten, paraphrase, summarize, or otherwise alter any claim text — fix ONLY the JSON syntax/structure, preserving every claim's wording verbatim.";

interface ParseResult {
  ok: boolean;
  claims: ClassifiedClaim[];
  error?: string;
}

function tryParseBatch(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFences(raw));
  } catch (err) {
    return { ok: false, claims: [], error: err instanceof Error ? err.message : "invalid JSON" };
  }
  const result = ClaimBatchSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, claims: [], error: result.error.message };
  }
  return { ok: true, claims: result.data.claims };
}

/**
 * Salvages whatever individually-valid claim objects exist in a response
 * that failed whole-array validation (e.g. one malformed claim, or the
 * array exceeding the batch cap) — rather than discarding the entire batch
 * over one bad item.
 */
function salvageClaims(raw: string, batchIndex: number): ClassifiedClaim[] {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFences(raw));
  } catch {
    console.error(
      `[analyze] batch ${batchIndex}: response wasn't parseable JSON at all — 0 claims salvaged`
    );
    return [];
  }
  const candidates =
    json && typeof json === "object" && Array.isArray((json as { claims?: unknown }).claims)
      ? (json as { claims: unknown[] }).claims
      : [];

  const salvaged: ClassifiedClaim[] = [];
  for (const item of candidates) {
    const parsed = ClassifiedClaimSchema.safeParse(item);
    if (parsed.success) salvaged.push(parsed.data);
  }
  console.warn(
    `[analyze] batch ${batchIndex}: salvaged ${salvaged.length}/${candidates.length} individually-valid claims after batch validation failed`
  );
  return salvaged;
}

async function extractBatch(text: string, batchIndex: number): Promise<ClassifiedClaim[]> {
  try {
    return await withRateLimitBackoff(async () => {
      const params = {
        model: EXTRACTOR_MODEL,
        temperature: 0,
        max_tokens: BATCH_MAX_TOKENS,
        messages: [
          { role: "system" as const, content: SYSTEM_PROMPT },
          { role: "user" as const, content: text },
        ],
      };

      const raw = await requestOnce(params);
      const attempt1 = tryParseBatch(raw);
      if (attempt1.ok) return attempt1.claims;

      console.warn(
        `[analyze] batch ${batchIndex}: classification failed validation, retrying once:`,
        attempt1.error
      );
      const retryRaw = await requestOnce({
        ...params,
        messages: [...params.messages, { role: "user" as const, content: RETRY_NUDGE }],
      });
      const attempt2 = tryParseBatch(retryRaw);
      if (attempt2.ok) return attempt2.claims;

      console.error(`[analyze] batch ${batchIndex}: retry also failed validation:`, attempt2.error);
      return salvageClaims(retryRaw, batchIndex);
    }, "analyze-classify");
  } catch (err) {
    // Any residual failure (including a Mesh-level error the backoff
    // couldn't recover from) costs this batch's claims, not the whole
    // analysis — the same per-item isolation used for fact-checking.
    console.error(
      `[analyze] batch ${batchIndex} failed entirely, contributing 0 claims:`,
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

function normalizeForDedup(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupeClaims(claims: ClassifiedClaim[]): ClassifiedClaim[] {
  const seen = new Set<string>();
  const result: ClassifiedClaim[] = [];
  for (const claim of claims) {
    const key = normalizeForDedup(claim.text);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(claim);
  }
  return result;
}

// Deterministic fallback if the LLM-based significance ranking itself fails
// — never leaves claim selection entirely unresolved.
function heuristicSelect(claims: ClassifiedClaim[], limit: number): ClassifiedClaim[] {
  const checkable = claims.filter((c) => c.checkable);
  const rest = claims.filter((c) => !c.checkable);
  return [...checkable, ...rest].slice(0, limit);
}

function buildSelectionPrompt(limit: number): string {
  return `You are selecting the most significant claims from a longer list extracted from a single source. Choose the ${limit} most significant and substantive claims — prioritize specific, checkable factual claims over vague opinions, but include a few notable opinions or predictions if they are central to the source's argument. Respond with ONLY valid JSON, no markdown fences: {"keepIds": string[]} listing the ids of the claims to keep, most significant first.`;
}

/**
 * Ranks `claims` by significance via a cheap LLM call and returns the top
 * `limit`, falling back to a deterministic heuristic if that call fails.
 * Reused both to cap the total claims analyzed and to pick which checkable
 * claims are significant enough to spend a real (costly) web search on.
 */
export async function selectTopClaims(
  claims: ClassifiedClaim[],
  limit: number
): Promise<ClassifiedClaim[]> {
  const compact = claims.map((c) => ({ id: c.id, text: c.text, type: c.type, checkable: c.checkable }));
  try {
    const raw = await requestOnce({
      model: EXTRACTOR_MODEL,
      temperature: 0,
      max_tokens: 800,
      messages: [
        { role: "system", content: buildSelectionPrompt(limit) },
        { role: "user", content: JSON.stringify(compact) },
      ],
    });
    const json: unknown = JSON.parse(stripCodeFences(raw));
    const parsed = ClaimSelectionSchema.safeParse(json);
    if (!parsed.success) throw new Error("selection response failed schema validation");

    const byId = new Map(claims.map((c) => [c.id, c]));
    const kept = parsed.data.keepIds
      .map((id) => byId.get(id))
      .filter((c): c is ClassifiedClaim => Boolean(c));

    if (kept.length === 0) throw new Error("selection returned no valid ids");
    return kept.slice(0, limit);
  } catch (err) {
    console.warn(
      "[analyze] LLM-based claim selection failed, falling back to a deterministic heuristic (checkable claims first):",
      err instanceof Error ? err.message : err
    );
    return heuristicSelect(claims, limit);
  }
}

export async function classifyClaims(inputText: string): Promise<ClassifiedClaim[]> {
  const batches = chunkText(inputText, BATCH_CHARS, BATCH_OVERLAP_CHARS);

  const batchResults = await mapWithConcurrency(batches, MAX_CONCURRENT_BATCHES, (batch, i) =>
    extractBatch(batch.content, i)
  );

  const merged = batchResults.flat().map((claim, i) => ({ ...claim, id: String(i + 1) }));
  const deduped = dedupeClaims(merged);

  if (deduped.length === 0) {
    throw new AppError("validation_error", "Could not extract any claims from this source.", 422);
  }

  console.log(`[analyze] classified ${deduped.length} claim(s) across ${batches.length} batch(es)`);

  if (deduped.length <= MAX_TOTAL_CLAIMS) {
    return deduped;
  }

  console.log(
    `[analyze] ${deduped.length} claims exceed the cap of ${MAX_TOTAL_CLAIMS} — selecting the most significant`
  );
  return selectTopClaims(deduped, MAX_TOTAL_CLAIMS);
}
