import { REFEREE_MODEL } from "@/lib/mesh";
import type { RetrievedChunk } from "@/lib/retrieve";
import { chatJson } from "@/lib/chatJson";
import { RefereeVerdictSchema, type RefereeVerdict } from "./schemas";
import { buildEvidenceBlock } from "./shared";
import type { DebateResult } from "./debate";

const SYSTEM_PROMPT = `You are an impartial referee judging a structured, evidence-grounded debate between a Prosecutor (arguing against a claim) and a Defender (arguing for it).

Base your verdict ONLY on evidence quality and grounding — not on which side sounded more confident or persuasive. A well-written argument built on thin or absent evidence should NOT win.

- SUPPORTED: the claim is well-grounded in the evidence and survives the opposing argument.
- CONTESTED: both sides have real, evidence-backed points, and the claim is genuinely disputed.
- UNSUPPORTED: neither side actually grounded their argument in real evidence. Say so honestly even if one or both arguments sound confident — an unsupported claim stays unsupported no matter how well it's argued.

Keep each string field to 1-3 sentences. A complete, valid JSON response is more important than an exhaustive one.

Respond with ONLY valid JSON, no markdown fences, no commentary:
{"verdict": "SUPPORTED"|"CONTESTED"|"UNSUPPORTED", "confidence": "HIGH"|"MEDIUM"|"LOW", "reasoning": string, "forSummary": string, "againstSummary": string, "forWeakness": string, "againstWeakness": string, "keyEvidence": [{"chunkId": string, "why": string}]}`;

export async function runReferee(
  claimText: string,
  debate: DebateResult,
  chunks: RetrievedChunk[]
): Promise<RefereeVerdict> {
  const userContent = `Claim: "${claimText}"

Evidence provided to both sides:
${buildEvidenceBlock(chunks)}

PROSECUTOR (against):
${JSON.stringify(debate.prosecutor)}

DEFENDER (for):
${JSON.stringify(debate.defender)}`;

  return chatJson(
    {
      model: REFEREE_MODEL,
      temperature: 0,
      max_tokens: 1000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    },
    RefereeVerdictSchema
  );
}
