import type { FactVerdictLabel } from "./schemas";

export interface ScoredClaim {
  checkable: boolean;
  succeeded: boolean; // fact-check pipeline completed for this claim
  factVerdict?: FactVerdictLabel;
  factConfidence?: "HIGH" | "MEDIUM" | "LOW";
  framing: string[];
}

export interface ScoreResult {
  credibilityScore: number;
  /** % of checkable+succeeded claims in each verdict bucket. Sums to 100
   * (or all-zero if nothing was checkable/succeeded). */
  distribution: Record<FactVerdictLabel, number>;
  framingCounts: Record<string, number>;
  checkedCount: number;
  totalClaims: number;
}

// --- Credibility formula ---
// Starts at 100. For every checkable claim that was successfully fact-checked,
// subtract a penalty based on its verdict, scaled by the consensus
// confidence (a LOW-confidence FALSE shouldn't tank the score as hard as a
// HIGH-confidence one). Then subtract a small, capped penalty for framing/
// rhetorical technique density across the whole source. Claims the pipeline
// failed to process are excluded entirely — we don't penalize a source for
// our own failure to evaluate it.
const VERDICT_PENALTY: Record<FactVerdictLabel, number> = {
  SUPPORTED: 0,
  NEEDS_CONTEXT: 5,
  UNVERIFIABLE: 3,
  MISLEADING: 15,
  FALSE: 25,
};
const CONFIDENCE_WEIGHT: Record<"HIGH" | "MEDIUM" | "LOW", number> = {
  HIGH: 1.0,
  MEDIUM: 0.7,
  LOW: 0.4,
};
const FRAMING_PENALTY_PER_FLAG = 2;
const FRAMING_PENALTY_CAP = 15;

const EMPTY_DISTRIBUTION: Record<FactVerdictLabel, number> = {
  SUPPORTED: 0,
  MISLEADING: 0,
  FALSE: 0,
  UNVERIFIABLE: 0,
  NEEDS_CONTEXT: 0,
};

export function computeScore(claims: ScoredClaim[]): ScoreResult {
  const checked = claims.filter((c) => c.checkable && c.succeeded && c.factVerdict);

  let verdictPenalty = 0;
  const distribution = { ...EMPTY_DISTRIBUTION };
  for (const claim of checked) {
    const verdict = claim.factVerdict as FactVerdictLabel;
    const confidence = claim.factConfidence ?? "MEDIUM";
    verdictPenalty += VERDICT_PENALTY[verdict] * CONFIDENCE_WEIGHT[confidence];
    distribution[verdict] += 1;
  }
  if (checked.length > 0) {
    for (const key of Object.keys(distribution) as FactVerdictLabel[]) {
      distribution[key] = Math.round((distribution[key] / checked.length) * 100);
    }
  }

  const framingCounts: Record<string, number> = {};
  let framingFlagCount = 0;
  for (const claim of claims) {
    for (const technique of claim.framing) {
      framingCounts[technique] = (framingCounts[technique] ?? 0) + 1;
      framingFlagCount += 1;
    }
  }
  const framingPenalty = Math.min(framingFlagCount * FRAMING_PENALTY_PER_FLAG, FRAMING_PENALTY_CAP);

  const credibilityScore = Math.max(0, Math.min(100, Math.round(100 - verdictPenalty - framingPenalty)));

  return {
    credibilityScore,
    distribution,
    framingCounts,
    checkedCount: checked.length,
    totalClaims: claims.length,
  };
}
