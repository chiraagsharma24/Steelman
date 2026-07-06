import { DEFENDER_MODEL, PROSECUTOR_MODEL } from "@/lib/mesh";
import type { RetrievedChunk } from "@/lib/retrieve";
import { chatJson } from "./json";
import { SideArgumentSchema, type SideArgument } from "./schemas";
import { buildEvidenceBlock } from "./shared";

export interface DebateResult {
  prosecutor: SideArgument;
  defender: SideArgument;
}

const GROUNDING_RULES = `Rules:
- You may ONLY use the evidence chunks provided below. Every substantive point in your argument MUST cite the chunkId(s) it relies on in the "evidence" field.
- Do not invent facts, statistics, or quotes that are not present in the provided evidence.
- If the provided evidence is insufficient to make a strong case, SAY SO explicitly in your argument rather than fabricating support.
- Honestly identify the weakest point in your own case in "weakestPoint" — do not spin it away.
- Keep "argument" to at most 5-6 sentences. A complete, valid JSON response is more important than an exhaustive one — do not let the argument run so long that you can't close the JSON.

Respond with ONLY valid JSON, no markdown fences, no commentary:
{"argument": string, "evidence": [{"chunkId": string, "quote": string}], "weakestPoint": string}`;

function systemPromptFor(side: "prosecutor" | "defender"): string {
  const role = side === "prosecutor" ? "Prosecutor" : "Defender";
  const stance = side === "prosecutor" ? "AGAINST" : "FOR";
  return `You are the ${role} in a structured, evidence-grounded debate. Argue strictly ${stance} the claim given by the user, grounded only in the evidence provided.\n\n${GROUNDING_RULES}`;
}

function userContentFor(claimText: string, chunks: RetrievedChunk[]): string {
  return `Claim: "${claimText}"\n\nEvidence:\n${buildEvidenceBlock(chunks)}`;
}

/**
 * Two parallel chat() calls (one per model) rather than a single
 * compare() call with model_overrides.system_prompt. compare() would give
 * us both sides in one round trip, and the SDK's ModelOverride.system_prompt
 * looks purpose-built for this — but Day 2 only verified compare() with a
 * *shared* prompt across models ("Say hi"), never per-model system prompts
 * driving strict-JSON structured output. Two chat() calls reuse the
 * already-proven chatJson() pipeline (parse/validate/retry) independently
 * per side, so a JSON failure on one side doesn't affect the other and can
 * retry on its own — compare()'s bundled result makes that isolation
 * awkward. Proven-and-composable won over fewer-round-trips here.
 */
export async function runSideDebate(
  claimText: string,
  chunks: RetrievedChunk[]
): Promise<DebateResult> {
  const userContent = userContentFor(claimText, chunks);

  const [prosecutor, defender] = await Promise.all([
    chatJson(
      {
        model: PROSECUTOR_MODEL,
        temperature: 0.4,
        max_tokens: 1100,
        messages: [
          { role: "system", content: systemPromptFor("prosecutor") },
          { role: "user", content: userContent },
        ],
      },
      SideArgumentSchema
    ),
    chatJson(
      {
        model: DEFENDER_MODEL,
        temperature: 0.4,
        max_tokens: 1100,
        messages: [
          { role: "system", content: systemPromptFor("defender") },
          { role: "user", content: userContent },
        ],
      },
      SideArgumentSchema
    ),
  ]);

  return { prosecutor, defender };
}
