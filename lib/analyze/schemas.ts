import { z } from "zod";

export const ClaimTypeSchema = z.enum(["FACTUAL", "OPINION", "PREDICTION", "VALUE_JUDGMENT"]);

export const ClassifiedClaimSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  type: ClaimTypeSchema,
  checkable: z.boolean(),
  framing: z.array(z.string()),
});
export type ClassifiedClaim = z.infer<typeof ClassifiedClaimSchema>;

// Per-batch extraction schema. No .min() — a given transcript/text chunk may
// legitimately contain zero standalone claims (e.g. pure narrative filler).
// The .max() is a safety net against a truly runaway response, not a
// realistic ceiling — a single dense ~9k-char batch legitimately produced 42
// claims in testing (a personal-narrative TED talk breaks into many short
// declarative sentences), so this must stay well above what real content
// produces or every dense batch pays for a wasted retry. The *real* cap on
// total analyzed claims is enforced after merging all batches (see
// lib/analyze/claims.ts), via significance selection, not truncation.
export const ClaimBatchSchema = z.object({
  claims: z.array(ClassifiedClaimSchema).max(80),
});

export const ClaimSelectionSchema = z.object({
  keepIds: z.array(z.string()),
});

export const FactVerdictLabelSchema = z.enum([
  "SUPPORTED",
  "MISLEADING",
  "FALSE",
  "UNVERIFIABLE",
  "NEEDS_CONTEXT",
]);
export type FactVerdictLabel = z.infer<typeof FactVerdictLabelSchema>;

export const ClaimJudgmentSchema = z.object({
  verdict: FactVerdictLabelSchema,
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  explanation: z.string().min(1),
  correction: z.string().nullable(),
});
export type ClaimJudgment = z.infer<typeof ClaimJudgmentSchema>;

export const SourceRefSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const GroundingSchema = z.enum(["WEB", "MODEL_KNOWLEDGE"]);
export type Grounding = z.infer<typeof GroundingSchema>;

export const AgreementSchema = z.enum(["UNANIMOUS", "MAJORITY", "SPLIT"]);
export type Agreement = z.infer<typeof AgreementSchema>;
