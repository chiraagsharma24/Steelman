import { z } from "zod";

export const ClaimSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});
export const ExtractionSchema = z.object({
  claims: z.array(ClaimSchema).min(1).max(5),
});
export type ExtractedClaim = z.infer<typeof ClaimSchema>;

export const EvidenceCitationSchema = z.object({
  chunkId: z.string().min(1),
  quote: z.string(),
});

export const SideArgumentSchema = z.object({
  argument: z.string().min(1),
  evidence: z.array(EvidenceCitationSchema),
  weakestPoint: z.string().min(1),
});
export type SideArgument = z.infer<typeof SideArgumentSchema>;

export const KeyEvidenceItemSchema = z.object({
  chunkId: z.string().min(1),
  why: z.string().min(1),
});

export const RefereeVerdictSchema = z.object({
  verdict: z.enum(["SUPPORTED", "CONTESTED", "UNSUPPORTED"]),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  reasoning: z.string().min(1),
  forSummary: z.string(),
  againstSummary: z.string(),
  forWeakness: z.string(),
  againstWeakness: z.string(),
  keyEvidence: z.array(KeyEvidenceItemSchema),
});
export type RefereeVerdict = z.infer<typeof RefereeVerdictSchema>;
