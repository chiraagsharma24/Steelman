import { chatJson } from "@/lib/chatJson";
import { FACTCHECK_MODEL_1, FACTCHECK_MODEL_2, FACTCHECK_MODEL_3 } from "@/lib/mesh";
import {
  ClaimJudgmentSchema,
  type ClaimJudgment,
  type FactVerdictLabel,
  type Agreement,
  type Grounding,
  type SourceRef,
} from "./schemas";
import { gatherGrounding, type GroundingResult } from "./factcheck";

// Provider-diverse trio (OpenAI, Anthropic, Google) — the whole point is
// independent judgment from genuinely different models, not just different
// calls to the same one.
const CONSENSUS_MODELS = [FACTCHECK_MODEL_1, FACTCHECK_MODEL_2, FACTCHECK_MODEL_3];

const CALIBRATION_RULES = `Rules:
- Only conclude FALSE or MISLEADING when the evidence is CLEAR and directly contradicts or substantially distorts the claim.
- When evidence is thin, mixed, or genuinely ambiguous, use NEEDS_CONTEXT (evidence is mixed or context-dependent) or UNVERIFIABLE (no reliable evidence either way) — do not stretch weak evidence into a strong verdict.
- SUPPORTED requires the evidence to actually confirm the claim, not merely fail to contradict it.
- Strong verdicts require strong evidence. When in doubt, choose the more cautious verdict.`;

const SYSTEM_PROMPT = `You are a neutral, careful fact-checker evaluating a single factual claim in isolation.

${CALIBRATION_RULES}

Keep "explanation" and "correction" to 1-2 short sentences each — brief over thorough. A complete, valid JSON response matters far more than an exhaustive one: finish the JSON. If you're running long, cut the explanation short and close the object rather than continuing to elaborate.

Respond with ONLY valid JSON, no markdown fences, no commentary:
{"verdict": "SUPPORTED"|"MISLEADING"|"FALSE"|"UNVERIFIABLE"|"NEEDS_CONTEXT", "confidence": "HIGH"|"MEDIUM"|"LOW", "explanation": string, "correction": string|null}
"correction" is a plain, accurate replacement statement when verdict is MISLEADING or FALSE, otherwise null.`;

function buildUserPrompt(claimText: string, grounding: GroundingResult): string {
  if (grounding.grounding === "WEB" && grounding.contextText) {
    return `Web search findings relevant to this claim:\n${grounding.contextText}\n\nClaim to evaluate: "${claimText}"`;
  }
  return `No web search results are available for this claim — rely only on your training knowledge. If you are not confident, say so honestly and prefer UNVERIFIABLE over guessing.\n\nClaim to evaluate: "${claimText}"`;
}

async function judgeClaim(
  model: string,
  claimText: string,
  grounding: GroundingResult
): Promise<ClaimJudgment> {
  return chatJson(
    {
      model,
      temperature: 0,
      max_tokens: 2000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(claimText, grounding) },
      ],
    },
    ClaimJudgmentSchema
  );
}

export interface ConsensusResult {
  verdicts: { model: string; verdict: FactVerdictLabel }[];
  agreement: Agreement;
  finalVerdict: FactVerdictLabel;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  explanation: string;
  correction: string | null;
  sources: SourceRef[];
  grounding: Grounding;
}

function computeAgreement(judgments: ClaimJudgment[]): {
  agreement: Agreement;
  finalVerdict: FactVerdictLabel;
  winners: ClaimJudgment[];
} {
  const counts = new Map<FactVerdictLabel, ClaimJudgment[]>();
  for (const j of judgments) {
    const list = counts.get(j.verdict) ?? [];
    list.push(j);
    counts.set(j.verdict, list);
  }

  const entries = Array.from(counts.entries());
  let best = entries[0];
  for (const entry of entries) {
    if (entry[1].length > best[1].length) best = entry;
  }

  const [bestVerdict, bestList] = best;
  if (bestList.length === judgments.length) {
    return { agreement: "UNANIMOUS", finalVerdict: bestVerdict, winners: bestList };
  }
  if (bestList.length >= 2) {
    return { agreement: "MAJORITY", finalVerdict: bestVerdict, winners: bestList };
  }
  // No verdict got 2+ votes: a genuine 3-way split. Fall back to the most
  // honest default (acknowledging disagreement) rather than picking a
  // verdict arbitrarily.
  return { agreement: "SPLIT", finalVerdict: "NEEDS_CONTEXT", winners: judgments };
}

const CONFIDENCE_RANK: Record<"HIGH" | "MEDIUM" | "LOW", number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
const RANK_TO_CONFIDENCE: Array<"LOW" | "MEDIUM" | "HIGH"> = ["LOW", "LOW", "MEDIUM", "HIGH"];

// Disagreement inherently signals lower certainty, regardless of how
// confident any individual model claimed to be — cap the reported
// confidence by how well the models agreed, not just their self-reports.
function deriveConfidence(agreement: Agreement, winners: ClaimJudgment[]): "HIGH" | "MEDIUM" | "LOW" {
  const cap = agreement === "UNANIMOUS" ? 3 : agreement === "MAJORITY" ? 2 : 1;
  const avgRank = Math.round(
    winners.reduce((sum, w) => sum + CONFIDENCE_RANK[w.confidence], 0) / winners.length
  );
  return RANK_TO_CONFIDENCE[Math.min(avgRank, cap)];
}

export async function runConsensusFactCheck(
  claimText: string,
  allowWebSearch: boolean
): Promise<ConsensusResult> {
  const grounding = await gatherGrounding(claimText, allowWebSearch);

  const judgments = await Promise.all(
    CONSENSUS_MODELS.map((model) => judgeClaim(model, claimText, grounding))
  );

  const { agreement, finalVerdict, winners } = computeAgreement(judgments);
  const confidence = deriveConfidence(agreement, winners);
  const representative = winners[0];

  return {
    verdicts: CONSENSUS_MODELS.map((model, i) => ({ model, verdict: judgments[i].verdict })),
    agreement,
    finalVerdict,
    confidence,
    explanation: representative.explanation,
    correction: representative.correction,
    sources: grounding.sources,
    grounding: grounding.grounding,
  };
}
