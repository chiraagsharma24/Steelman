import type { ClaimAnalysis, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/mesh";
import { withRateLimitBackoff } from "@/lib/concurrency";
import { classifyClaims, selectTopClaims } from "./claims";
import { runConsensusFactCheck } from "./consensus";
import { computeScore, type ScoredClaim } from "./score";
import type { Agreement, ClassifiedClaim, FactVerdictLabel, Grounding, SourceRef } from "./schemas";

// Only the most significant checkable claims get a real web search — the
// rest are still 3-model fact-checked, just on model-knowledge grounding.
// This bounds real spend to a handful of jobs per analysis regardless of how
// many checkable claims a long source produces (could be up to 20).
const WEB_VERIFY_LIMIT = 5;

// A serverless request handles at most ONE claim per call (see stepAnalysis)
// so an analysis of any length fits comfortably under Vercel's per-request
// duration limit — the frontend polls GET /api/analyze/[id] repeatedly
// instead of one request blocking for the whole pipeline. If the invocation
// that claimed a row crashes or is killed mid-work before it can mark the
// row DONE/FAILED, a later poll recovers it once it's been stuck in
// PROCESSING longer than this — comfortably above the worst case for one
// claim (a ~30s web-search wait, see RESPONSE_POLL_MAX_WAIT_MS in lib/mesh.ts,
// plus a few seconds for the 3-model consensus call).
const PROCESSING_STALE_MS = 90_000;

export interface RunAnalysisInput {
  documentId?: string;
  inputText?: string;
  title?: string;
}

export interface ClaimAnalysisResult {
  claimId: string;
  claimText: string;
  claimType: ClassifiedClaim["type"];
  checkable: boolean;
  framing: string[];
  status: "PENDING" | "DONE" | "FAILED";
  error?: string;

  factVerdict?: FactVerdictLabel;
  factConfidence?: "HIGH" | "MEDIUM" | "LOW";
  factExplanation?: string;
  sources?: SourceRef[];
  correction?: string | null;
  grounding?: Grounding;
  consensus?: { verdicts: { model: string; verdict: FactVerdictLabel }[]; agreement: Agreement };
}

// Returned by POST /api/analyze — just enough to start polling immediately.
export interface StartAnalysisResult {
  analysisId: string;
  title: string;
  totalClaims: number;
  checkableCount: number;
}

// Returned by GET /api/analyze/[id] on every poll. credibilityScore/
// distribution/framingCounts are only populated once status === "DONE".
export interface AnalysisPollResult {
  analysisId: string;
  status: "RUNNING" | "DONE" | "FAILED";
  title: string;
  totalClaims: number;
  doneCount: number;
  credibilityScore?: number;
  distribution?: Record<FactVerdictLabel, number>;
  framingCounts?: Record<string, number>;
  claims: ClaimAnalysisResult[];
}

// The final shape once status === "DONE" — same as AnalysisPollResult but
// with the score fields guaranteed present, matching what the results UI
// (components/analyze/AnalysisResults.tsx) expects.
export interface RunAnalysisResult {
  analysisId: string;
  title: string;
  credibilityScore: number;
  distribution: Record<FactVerdictLabel, number>;
  framingCounts: Record<string, number>;
  claims: ClaimAnalysisResult[];
}

function rowToResult(row: ClaimAnalysis): ClaimAnalysisResult {
  const consensus = row.consensusJson as unknown as ClaimAnalysisResult["consensus"] | null;
  return {
    claimId: row.id,
    claimText: row.claimText,
    claimType: row.claimType,
    checkable: row.checkable,
    framing: (row.framingJson as unknown as string[] | null) ?? [],
    // PROCESSING is an implementation detail of the polling pipeline — from
    // the client's perspective a claim that's actively being checked reads
    // the same as one still waiting its turn.
    status: row.status === "PROCESSING" ? "PENDING" : (row.status as "PENDING" | "DONE" | "FAILED"),
    error: row.error ?? undefined,
    factVerdict: row.factVerdict ?? undefined,
    factConfidence: row.factConfidence ?? undefined,
    factExplanation: row.factExplanation ?? undefined,
    sources: (row.sourcesJson as unknown as SourceRef[] | null) ?? undefined,
    correction: row.correction,
    grounding: row.grounding ?? undefined,
    consensus: consensus ?? undefined,
  };
}

async function resolveSourceText(
  input: RunAnalysisInput
): Promise<{ sourceText: string; title: string }> {
  let sourceText = input.inputText?.trim();
  let documentTitle: string | undefined;

  if (input.documentId) {
    const doc = await prisma.document.findUnique({ where: { id: input.documentId } });
    if (!doc) {
      throw new AppError(
        "validation_error",
        "We could not find that document to analyze. Please try again from the start.",
        404
      );
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

  const title = input.title?.trim() || documentTitle || sourceText.slice(0, 140);
  return { sourceText, title };
}

/**
 * Kicks off an analysis: classifies claims and persists every one of them as
 * a ClaimAnalysis row (non-checkable ones already DONE, checkable ones
 * PENDING) then returns immediately. The actual fact-checking happens one
 * claim at a time across subsequent stepAnalysis() calls (see GET
 * /api/analyze/[id]) — never inside this function — so this always returns
 * fast regardless of how many claims the source produces.
 */
export async function startAnalysis(input: RunAnalysisInput): Promise<StartAnalysisResult> {
  const { sourceText, title } = await resolveSourceText(input);

  const analysisRow = await prisma.analysis.create({
    data: { title, status: "RUNNING", documentId: input.documentId },
  });

  console.log(`[analyze] ${analysisRow.id}: classifying claims`);

  let classified: ClassifiedClaim[];
  try {
    classified = await classifyClaims(sourceText);
    console.log(`[analyze] ${analysisRow.id}: classified ${classified.length} claim(s)`);
  } catch (err) {
    await prisma.analysis.update({ where: { id: analysisRow.id }, data: { status: "FAILED" } });
    throw err;
  }

  const checkableClaims = classified.filter((c) => c.checkable);

  let webEligibleIds: Set<string>;
  if (checkableClaims.length <= WEB_VERIFY_LIMIT) {
    webEligibleIds = new Set(checkableClaims.map((c) => c.id));
  } else {
    const selected = await selectTopClaims(checkableClaims, WEB_VERIFY_LIMIT);
    webEligibleIds = new Set(selected.map((c) => c.id));
  }
  console.log(
    `[analyze] ${analysisRow.id}: ${webEligibleIds.size}/${checkableClaims.length} checkable claims selected for real web verification (rest: model-knowledge only)`
  );

  await prisma.claimAnalysis.createMany({
    data: classified.map((claim, i) => ({
      analysisId: analysisRow.id,
      claimText: claim.text,
      claimType: claim.type,
      checkable: claim.checkable,
      framingJson: claim.framing as unknown as Prisma.InputJsonValue,
      sortIndex: i,
      webEligible: claim.checkable && webEligibleIds.has(claim.id),
      // Non-checkable claims need no fact-check work at all — mark them DONE
      // immediately rather than making a later poll do a no-op step for them.
      status: claim.checkable ? "PENDING" : "DONE",
    })),
  });

  return {
    analysisId: analysisRow.id,
    title,
    totalClaims: classified.length,
    checkableCount: checkableClaims.length,
  };
}

async function processClaimRow(row: ClaimAnalysis): Promise<void> {
  const label = row.claimText.slice(0, 60);
  try {
    await withRateLimitBackoff(async () => {
      console.log(
        `[analyze] claim "${label}": fact-checking (${row.webEligible ? "web search + " : ""}3-model consensus)`
      );
      const t0 = Date.now();
      const consensus = await runConsensusFactCheck(row.claimText, row.webEligible);
      console.log(
        `[analyze] claim "${label}": consensus done in ${Date.now() - t0}ms -> ${consensus.finalVerdict} (${consensus.agreement}, grounding=${consensus.grounding})`
      );

      await prisma.claimAnalysis.update({
        where: { id: row.id },
        data: {
          status: "DONE",
          processingStartedAt: null,
          factVerdict: consensus.finalVerdict,
          factConfidence: consensus.confidence,
          factExplanation: consensus.explanation,
          sourcesJson: consensus.sources as unknown as Prisma.InputJsonValue,
          correction: consensus.correction,
          grounding: consensus.grounding,
          consensusJson: {
            verdicts: consensus.verdicts,
            agreement: consensus.agreement,
          } as unknown as Prisma.InputJsonValue,
          agreement: consensus.agreement,
        },
      });
    }, "analyze");
  } catch (err) {
    console.error(`[analyze] claim "${label}" failed:`, err);
    const message =
      err instanceof AppError ? err.message : "Unexpected error while fact-checking this claim.";
    await prisma.claimAnalysis.update({
      where: { id: row.id },
      data: { status: "FAILED", processingStartedAt: null, error: message },
    });
  }
}

async function finalizeAnalysis(analysisId: string): Promise<void> {
  const rows = await prisma.claimAnalysis.findMany({ where: { analysisId } });
  const scored: ScoredClaim[] = rows.map((r) => ({
    checkable: r.checkable,
    succeeded: r.status === "DONE",
    factVerdict: r.factVerdict ?? undefined,
    factConfidence: r.factConfidence ?? undefined,
    framing: (r.framingJson as unknown as string[] | null) ?? [],
  }));
  const score = computeScore(scored);

  await prisma.analysis.update({
    where: { id: analysisId },
    data: {
      status: "DONE",
      credibilityScore: score.credibilityScore,
      distributionJson: score.distribution as unknown as Prisma.InputJsonValue,
      framingCountsJson: score.framingCounts as unknown as Prisma.InputJsonValue,
    },
  });

  const webGroundedCount = rows.filter((r) => r.grounding === "WEB").length;
  console.log(
    `[analyze] ${analysisId}: done — score ${score.credibilityScore}/100, ${score.checkedCount}/${score.totalClaims} claims checked, ${webGroundedCount} web search call(s) made`
  );
}

async function snapshot(analysisId: string): Promise<AnalysisPollResult> {
  const analysis = await prisma.analysis.findUnique({ where: { id: analysisId } });
  if (!analysis) {
    throw new AppError("validation_error", "We could not find that analysis.", 404);
  }
  const rows = await prisma.claimAnalysis.findMany({
    where: { analysisId },
    orderBy: { sortIndex: "asc" },
  });

  const claims = rows.map(rowToResult);
  const doneCount = rows.filter((r) => r.status === "DONE" || r.status === "FAILED").length;

  return {
    analysisId,
    status: analysis.status === "RUNNING" ? "RUNNING" : analysis.status === "DONE" ? "DONE" : "FAILED",
    title: analysis.title,
    totalClaims: rows.length,
    doneCount,
    credibilityScore: analysis.credibilityScore ?? undefined,
    distribution: (analysis.distributionJson as unknown as Record<FactVerdictLabel, number> | null) ?? undefined,
    framingCounts: (analysis.framingCountsJson as unknown as Record<string, number> | null) ?? undefined,
    claims,
  };
}

/**
 * Does at most one unit of work — fact-checking a single claim, or (once
 * every claim is done) computing the final score — then returns the current
 * state of the whole analysis. Called on every GET /api/analyze/[id] poll.
 * Bounded to roughly one web-search-plus-consensus round trip per call
 * (well under Vercel's per-request duration limit) regardless of how many
 * claims remain, which is what makes polling this repeatedly a safe way to
 * drive an analysis that would otherwise run far longer than one request.
 */
export async function stepAnalysis(analysisId: string): Promise<AnalysisPollResult> {
  const analysis = await prisma.analysis.findUnique({ where: { id: analysisId } });
  if (!analysis) {
    throw new AppError("validation_error", "We could not find that analysis.", 404);
  }
  if (analysis.status !== "RUNNING") {
    return snapshot(analysisId);
  }

  try {
    // Recover any claim abandoned by a crashed/killed invocation before it
    // could finish, so the analysis can't get stuck forever.
    await prisma.claimAnalysis.updateMany({
      where: {
        analysisId,
        status: "PROCESSING",
        processingStartedAt: { lt: new Date(Date.now() - PROCESSING_STALE_MS) },
      },
      data: { status: "PENDING", processingStartedAt: null },
    });

    // Only one claim may be in flight at a time — each web search job places a
    // real cost hold on the Mesh account, and running them concurrently stacks
    // holds (see WEB_VERIFY_LIMIT above). If some other poll is already
    // mid-claim, do no new work this call; just report current progress.
    const inFlight = await prisma.claimAnalysis.findFirst({
      where: { analysisId, status: "PROCESSING" },
    });

    if (!inFlight) {
      const next = await prisma.claimAnalysis.findFirst({
        where: { analysisId, status: "PENDING" },
        orderBy: { sortIndex: "asc" },
      });

      if (next) {
        // Atomic compare-and-swap: guards the race between two near-simultaneous
        // polls both finding the same PENDING row before either has claimed it.
        const claimed = await prisma.claimAnalysis.updateMany({
          where: { id: next.id, status: "PENDING" },
          data: { status: "PROCESSING", processingStartedAt: new Date() },
        });
        if (claimed.count === 1) {
          await processClaimRow({ ...next, status: "PROCESSING" });
        }
        // count === 0 means another poll won the race — fall through and just
        // report current progress below.
      } else {
        await finalizeAnalysis(analysisId);
      }
    }
  } catch (err) {
    // A transient persistence hiccup here (dropped pooled connection,
    // serverless Postgres cold-start reconnect, etc.) must not take the
    // whole analysis down — processClaimRow already isolates a genuine
    // per-claim failure (marks that row FAILED and returns normally), so
    // anything reaching here is infrastructure noise around that, not a
    // claim result. Log it and let the next poll retry this same unit of
    // work instead of 500-ing the request.
    console.error(`[analyze] ${analysisId}: step failed, will retry on next poll:`, err);
  }

  return snapshot(analysisId);
}
