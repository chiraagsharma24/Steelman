import type { FactVerdictLabel } from "./schemas";

export interface ScoredClaim {
  checkable: boolean;
  succeeded: boolean; // fact-check pipeline completed for this claim
  factVerdict?: FactVerdictLabel;
  factConfidence?: "HIGH" | "MEDIUM" | "LOW";
  framing: string[];
}

export interface ScoreResult {
  // null when insufficientEvidence is true — there is no honest single
  // number to show, so the UI must show a coverage-based headline instead.
  credibilityScore: number | null;
  // True when too few checkable claims resolved to a real verdict (most
  // came back UNVERIFIABLE) for a percentage score to be a fair summary of
  // the source, as opposed to a reflection of our own evidence gaps.
  insufficientEvidence: boolean;
  /** % of checkable+succeeded claims in each verdict bucket. Sums to 100
   * (or all-zero if nothing was checkable/succeeded). Informational only —
   * UNVERIFIABLE is included here (unlike in the score) since seeing "42%
   * unverifiable" is exactly the honest context this distribution exists
   * to convey. */
  distribution: Record<FactVerdictLabel, number>;
  framingCounts: Record<string, number>;
  checkedCount: number;
  totalClaims: number;
  // Every claim classified as checkable, regardless of whether the
  // fact-check pipeline succeeded on it — the denominator for coverage.
  checkableCount: number;
  // Checked claims that got an actual assessed verdict (i.e. excluding
  // UNVERIFIABLE) — the numerator for coverage, and the only claims that
  // feed the score.
  verifiedCount: number;
}

// --- Credibility formula ---
// Starts at 100. For every checkable claim that resolved to a real,
// assessed verdict, subtract a penalty based on that verdict, scaled by the
// consensus confidence (a LOW-confidence FALSE shouldn't tank the score as
// hard as a HIGH-confidence one). Then subtract a small, capped penalty for
// framing/rhetorical technique density across the whole source.
//
// UNVERIFIABLE claims are excluded from the score entirely (not just
// lightly penalized) — "we couldn't verify this" is neutral information
// about the evidence available, not a mark against the source. A source
// made of claims we simply can't check should never read as "low
// credibility"; see MIN_VERIFIED_RATIO below for what happens when most of
// a source falls in that bucket. Claims the pipeline failed to process
// (not `succeeded`) are likewise excluded — we don't penalize a source for
// our own failure to evaluate it.
const VERDICT_PENALTY: Record<FactVerdictLabel, number> = {
  SUPPORTED: 0,
  NEEDS_CONTEXT: 5,
  UNVERIFIABLE: 0, // excluded from scoring entirely — see comment above
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

// Below this share of checkable claims resolving to a real verdict, a
// percentage score would mostly measure our evidence gaps, not the
// source's credibility — show an honest "insufficient evidence" state
// instead of a number.
const MIN_VERIFIED_RATIO = 0.4;

const EMPTY_DISTRIBUTION: Record<FactVerdictLabel, number> = {
  SUPPORTED: 0,
  MISLEADING: 0,
  FALSE: 0,
  UNVERIFIABLE: 0,
  NEEDS_CONTEXT: 0,
};

export function computeScore(claims: ScoredClaim[]): ScoreResult {
  const checkableClaims = claims.filter((c) => c.checkable);
  const checked = claims.filter((c) => c.checkable && c.succeeded && c.factVerdict);

  const distribution = { ...EMPTY_DISTRIBUTION };
  for (const claim of checked) {
    distribution[claim.factVerdict as FactVerdictLabel] += 1;
  }
  if (checked.length > 0) {
    for (const key of Object.keys(distribution) as FactVerdictLabel[]) {
      distribution[key] = Math.round((distribution[key] / checked.length) * 100);
    }
  }

  const scoreable = checked.filter((c) => c.factVerdict !== "UNVERIFIABLE");
  const verifiedCount = scoreable.length;

  const framingCounts: Record<string, number> = {};
  let framingFlagCount = 0;
  for (const claim of claims) {
    for (const technique of claim.framing) {
      framingCounts[technique] = (framingCounts[technique] ?? 0) + 1;
      framingFlagCount += 1;
    }
  }
  const framingPenalty = Math.min(framingFlagCount * FRAMING_PENALTY_PER_FLAG, FRAMING_PENALTY_CAP);

  const coverageRatio = checkableClaims.length > 0 ? verifiedCount / checkableClaims.length : 1;
  const insufficientEvidence = checkableClaims.length > 0 && coverageRatio < MIN_VERIFIED_RATIO;

  let credibilityScore: number | null = null;
  if (!insufficientEvidence) {
    let verdictPenalty = 0;
    for (const claim of scoreable) {
      const verdict = claim.factVerdict as FactVerdictLabel;
      const confidence = claim.factConfidence ?? "MEDIUM";
      verdictPenalty += VERDICT_PENALTY[verdict] * CONFIDENCE_WEIGHT[confidence];
    }
    credibilityScore = Math.max(0, Math.min(100, Math.round(100 - verdictPenalty - framingPenalty)));
  }

  return {
    credibilityScore,
    insufficientEvidence,
    distribution,
    framingCounts,
    checkedCount: checked.length,
    totalClaims: claims.length,
    checkableCount: checkableClaims.length,
    verifiedCount,
  };
}
