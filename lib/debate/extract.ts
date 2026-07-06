import { EXTRACTOR_MODEL } from "@/lib/mesh";
import { chatJson } from "@/lib/chatJson";
import { ExtractionSchema, type ExtractedClaim } from "./schemas";

// Extraction gets the fullest practical view of the source (unlike
// debate/referee, which only ever see retrieved evidence chunks) — but even
// here we cap input size as a pragmatic guard against pathologically large
// documents blowing past the model's context window and cost budget.
const MAX_INPUT_CHARS = 12_000;

const SYSTEM_PROMPT = `You extract debatable claims from text for a structured, evidence-grounded debate.

A "claim" is a specific, falsifiable assertion someone could argue for or against — not a vague topic or a question. For example "Remote work increases productivity" is a claim; "remote work" is not.

Rules:
- Extract between 1 and 5 distinct claims. Prefer fewer, sharper claims over many overlapping ones.
- If the input text is already a single sharp, debatable claim, return just that one claim unchanged.
- Each claim must be self-contained (understandable without reading the source text).
- Do not invent claims the text doesn't support or imply.

Respond with ONLY valid JSON, no markdown fences, no commentary:
{"claims": [{"id": string, "text": string}]}`;

export async function extractClaims(inputText: string): Promise<ExtractedClaim[]> {
  const truncated = inputText.slice(0, MAX_INPUT_CHARS);
  const result = await chatJson(
    {
      model: EXTRACTOR_MODEL,
      temperature: 0,
      max_tokens: 800,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: truncated },
      ],
    },
    ExtractionSchema
  );
  return result.claims;
}
