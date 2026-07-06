import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/mesh";
import { searchChunks, type RetrievedChunk } from "@/lib/retrieve";
import { extractClaims } from "./extract";
import { runSideDebate, type DebateResult } from "./debate";
import { runReferee } from "./referee";
import type { ExtractedClaim, RefereeVerdict, SideArgument } from "./schemas";

const MAX_CONCURRENT_CLAIMS = 3;
const EVIDENCE_TOP_K = 6;
const DEFAULT_BACKOFF_MS = 3000;

export interface RunDebateInput {
  documentId?: string;
  inputText?: string;
  question?: string;
}

export interface ClaimResult {
  claimId: string;
  claimText: string;
  status: "done" | "failed";
  error?: string;
  verdictId?: string;
  verdict?: RefereeVerdict;
  prosecutor?: SideArgument;
  defender?: SideArgument;
  evidence?: RetrievedChunk[];
}

export interface RunDebateResult {
  debateId: string;
  question: string;
  claims: ClaimResult[];
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function withRateLimitBackoff<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError && err.code === "rate_limit_exceeded") {
      const waitMs = (err.retryAfterSeconds ?? DEFAULT_BACKOFF_MS / 1000) * 1000;
      console.warn(`[debate] rate limited, backing off ${waitMs}ms then retrying once`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return await fn();
    }
    throw err;
  }
}

async function processClaim(
  debateId: string,
  claim: ExtractedClaim,
  documentId: string | undefined
): Promise<ClaimResult> {
  const label = claim.text.slice(0, 60);
  try {
    return await withRateLimitBackoff(async () => {
      console.log(`[debate] claim "${label}": retrieving evidence`);
      const chunks = await searchChunks(claim.text, { topK: EVIDENCE_TOP_K, documentId });
      console.log(`[debate] claim "${label}": ${chunks.length} evidence chunks, running debate`);

      const debateStart = Date.now();
      const debate: DebateResult = await runSideDebate(claim.text, chunks);
      console.log(`[debate] claim "${label}": debate done in ${Date.now() - debateStart}ms`);

      const refereeStart = Date.now();
      const verdict = await runReferee(claim.text, debate, chunks);
      console.log(
        `[debate] claim "${label}": referee done in ${Date.now() - refereeStart}ms -> ${verdict.verdict}/${verdict.confidence}`
      );

      const verdictRow = await prisma.verdict.create({
        data: {
          debateId,
          claim: claim.text,
          forArgument: debate.defender.argument,
          againstArgument: debate.prosecutor.argument,
          forWeakness: debate.defender.weakestPoint,
          againstWeakness: debate.prosecutor.weakestPoint,
          confidence: verdict.confidence,
          verdictLabel: verdict.verdict,
          reasoning: verdict.reasoning,
          forSummary: verdict.forSummary,
          againstSummary: verdict.againstSummary,
          evidenceJson: chunks as unknown as Prisma.InputJsonValue,
          keyEvidenceJson: verdict.keyEvidence as unknown as Prisma.InputJsonValue,
        },
      });

      return {
        claimId: claim.id,
        claimText: claim.text,
        status: "done",
        verdictId: verdictRow.id,
        verdict,
        prosecutor: debate.prosecutor,
        defender: debate.defender,
        evidence: chunks,
      };
    });
  } catch (err) {
    console.error(`[debate] claim "${label}" failed:`, err);
    return {
      claimId: claim.id,
      claimText: claim.text,
      status: "failed",
      error: err instanceof AppError ? err.message : "Unexpected error while processing this claim.",
    };
  }
}

export async function runDebate(input: RunDebateInput): Promise<RunDebateResult> {
  let sourceText = input.inputText?.trim();
  let documentTitle: string | undefined;

  if (input.documentId) {
    const doc = await prisma.document.findUnique({ where: { id: input.documentId } });
    if (!doc) {
      throw new AppError("validation_error", "documentId not found.", 404);
    }
    documentTitle = doc.title;
    if (!sourceText) sourceText = doc.rawText ?? undefined;
  }

  if (!sourceText) {
    throw new AppError(
      "validation_error",
      "Provide inputText, or a documentId whose document has stored text.",
      400
    );
  }

  const question = input.question?.trim() || documentTitle || sourceText.slice(0, 140);

  const debateRow = await prisma.debate.create({
    data: { question, status: "RUNNING", documentId: input.documentId },
  });

  console.log(`[debate] ${debateRow.id}: extracting claims`);

  let claims: ExtractedClaim[];
  try {
    claims = await extractClaims(sourceText);
    console.log(`[debate] ${debateRow.id}: extracted ${claims.length} claim(s)`);
  } catch (err) {
    await prisma.debate.update({ where: { id: debateRow.id }, data: { status: "FAILED" } });
    throw err;
  }

  const results = await mapWithConcurrency(claims, MAX_CONCURRENT_CLAIMS, (claim) =>
    processClaim(debateRow.id, claim, input.documentId)
  );

  const anySucceeded = results.some((r) => r.status === "done");
  await prisma.debate.update({
    where: { id: debateRow.id },
    data: { status: anySucceeded ? "DONE" : "FAILED" },
  });

  return { debateId: debateRow.id, question, claims: results };
}
