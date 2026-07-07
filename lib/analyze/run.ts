import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/mesh";
import { mapWithConcurrency, withRateLimitBackoff } from "@/lib/concurrency";
import { classifyClaims, selectTopClaims } from "./claims";
import { runConsensusFactCheck } from "./consensus";
import { computeScore, type ScoredClaim } from "./score";
import type { Agreement, ClassifiedClaim, FactVerdictLabel, Grounding, SourceRef } from "./schemas";

// Each web search job places a real cost hold on the Mesh account
// (confirmed: $5/job, released on completion) — running them concurrently
// stacks holds (2 concurrent = $10 reserved), which is what exhausted the
// account's free balance during testing. Strictly sequential (1) means only
// one hold is ever outstanding at a time; the real per-job cost is cents, so
// sequential is fine on cost, just slower — the loading UI is built for that.
const MAX_CONCURRENT_CLAIMS = 1;

// Only the most significant checkable claims get a real web search — the
// rest are still 3-model fact-checked, just on model-knowledge grounding.
// This bounds real spend to a handful of jobs per analysis regardless of how
// many checkable claims a long source produces (could be up to 20).
const WEB_VERIFY_LIMIT = 5;

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
  status: "DONE" | "FAILED";
  error?: string;
  claimAnalysisId?: string;

  factVerdict?: FactVerdictLabel;
  factConfidence?: "HIGH" | "MEDIUM" | "LOW";
  factExplanation?: string;
  sources?: SourceRef[];
  correction?: string | null;
  grounding?: Grounding;
  consensus?: { verdicts: { model: string; verdict: FactVerdictLabel }[]; agreement: Agreement };
}

export interface RunAnalysisResult {
  analysisId: string;
  title: string;
  credibilityScore: number;
  distribution: Record<FactVerdictLabel, number>;
  framingCounts: Record<string, number>;
  claims: ClaimAnalysisResult[];
}

async function processCheckableClaim(
  analysisId: string,
  claim: ClassifiedClaim,
  allowWebSearch: boolean
): Promise<ClaimAnalysisResult> {
  const label = claim.text.slice(0, 60);
  try {
    return await withRateLimitBackoff(async () => {
      console.log(
        `[analyze] claim "${label}": fact-checking (${allowWebSearch ? "web search + " : ""}3-model consensus)`
      );
      const t0 = Date.now();
      const consensus = await runConsensusFactCheck(claim.text, allowWebSearch);
      console.log(
        `[analyze] claim "${label}": consensus done in ${Date.now() - t0}ms -> ${consensus.finalVerdict} (${consensus.agreement}, grounding=${consensus.grounding})`
      );

      const row = await prisma.claimAnalysis.create({
        data: {
          analysisId,
          claimText: claim.text,
          claimType: claim.type,
          checkable: true,
          framingJson: claim.framing as unknown as Prisma.InputJsonValue,
          status: "DONE",
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

      return {
        claimId: claim.id,
        claimText: claim.text,
        claimType: claim.type,
        checkable: true,
        framing: claim.framing,
        status: "DONE",
        claimAnalysisId: row.id,
        factVerdict: consensus.finalVerdict,
        factConfidence: consensus.confidence,
        factExplanation: consensus.explanation,
        sources: consensus.sources,
        correction: consensus.correction,
        grounding: consensus.grounding,
        consensus: { verdicts: consensus.verdicts, agreement: consensus.agreement },
      };
    }, "analyze");
  } catch (err) {
    console.error(`[analyze] claim "${label}" failed:`, err);
    const message =
      err instanceof AppError ? err.message : "Unexpected error while fact-checking this claim.";
    const row = await prisma.claimAnalysis.create({
      data: {
        analysisId,
        claimText: claim.text,
        claimType: claim.type,
        checkable: true,
        framingJson: claim.framing as unknown as Prisma.InputJsonValue,
        status: "FAILED",
        error: message,
      },
    });
    return {
      claimId: claim.id,
      claimText: claim.text,
      claimType: claim.type,
      checkable: true,
      framing: claim.framing,
      status: "FAILED",
      claimAnalysisId: row.id,
      error: message,
    };
  }
}

async function persistNonCheckableClaim(
  analysisId: string,
  claim: ClassifiedClaim
): Promise<ClaimAnalysisResult> {
  const row = await prisma.claimAnalysis.create({
    data: {
      analysisId,
      claimText: claim.text,
      claimType: claim.type,
      checkable: false,
      framingJson: claim.framing as unknown as Prisma.InputJsonValue,
      status: "DONE",
    },
  });
  return {
    claimId: claim.id,
    claimText: claim.text,
    claimType: claim.type,
    checkable: false,
    framing: claim.framing,
    status: "DONE",
    claimAnalysisId: row.id,
  };
}

export async function runAnalysis(input: RunAnalysisInput): Promise<RunAnalysisResult> {
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

  const title = input.title?.trim() || documentTitle || sourceText.slice(0, 140);

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
  const nonCheckableClaims = classified.filter((c) => !c.checkable);

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

  const [checkedResults, uncheckedResults] = await Promise.all([
    mapWithConcurrency(checkableClaims, MAX_CONCURRENT_CLAIMS, (claim) =>
      processCheckableClaim(analysisRow.id, claim, webEligibleIds.has(claim.id))
    ),
    Promise.all(nonCheckableClaims.map((claim) => persistNonCheckableClaim(analysisRow.id, claim))),
  ]);

  const allResults = [...checkedResults, ...uncheckedResults];
  // Restore original classification order for a coherent claim-by-claim read
  // (checkable/non-checkable were processed as separate groups above).
  const orderIndex = new Map(classified.map((c, i) => [c.id, i]));
  allResults.sort((a, b) => (orderIndex.get(a.claimId) ?? 0) - (orderIndex.get(b.claimId) ?? 0));

  const scored: ScoredClaim[] = allResults.map((r) => ({
    checkable: r.checkable,
    succeeded: r.status === "DONE",
    factVerdict: r.factVerdict,
    factConfidence: r.factConfidence,
    framing: r.framing,
  }));
  const score = computeScore(scored);

  await prisma.analysis.update({
    where: { id: analysisRow.id },
    data: {
      status: "DONE",
      credibilityScore: score.credibilityScore,
      distributionJson: score.distribution as unknown as Prisma.InputJsonValue,
      framingCountsJson: score.framingCounts as unknown as Prisma.InputJsonValue,
    },
  });

  // Cost sanity: how many claims actually triggered a real (billable) web
  // search job vs. fell back to model-knowledge, for this one analysis run.
  const webGroundedCount = allResults.filter((r) => r.grounding === "WEB").length;

  console.log(
    `[analyze] ${analysisRow.id}: done — score ${score.credibilityScore}/100, ${score.checkedCount}/${score.totalClaims} claims checked, ${webGroundedCount} web search call(s) made`
  );

  return {
    analysisId: analysisRow.id,
    title,
    credibilityScore: score.credibilityScore,
    distribution: score.distribution,
    framingCounts: score.framingCounts,
    claims: allResults,
  };
}
