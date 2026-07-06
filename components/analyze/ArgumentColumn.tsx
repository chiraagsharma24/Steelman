"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { SideArgument } from "@/lib/debate/schemas";
import type { RetrievedChunk } from "@/lib/retrieve";
import { EvidenceChip, type EvidenceSide } from "./EvidenceChip";

const CONFIG: Record<EvidenceSide, { label: string; role: string; text: string; border: string; bg: string }> = {
  for: {
    label: "For",
    role: "Defender",
    text: "text-for",
    border: "border-for/25",
    bg: "bg-for-muted/30",
  },
  against: {
    label: "Against",
    role: "Prosecutor",
    text: "text-against",
    border: "border-against/25",
    bg: "bg-against-muted/30",
  },
};

export function ArgumentColumn({
  side,
  argument,
  evidenceChunks,
}: {
  side: EvidenceSide;
  argument: SideArgument;
  evidenceChunks: RetrievedChunk[];
}) {
  const cfg = CONFIG[side];

  return (
    <motion.div
      initial={{ opacity: 0, x: side === "for" ? -14 : 14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className={cn("rounded-lg border p-5", cfg.border, cfg.bg)}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className={cn("text-xs font-semibold uppercase tracking-wider", cfg.text)}>{cfg.label}</span>
        <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">{cfg.role}</span>
      </div>

      <p className="font-serif text-[0.98rem] leading-relaxed text-foreground">{argument.argument}</p>

      {argument.evidence.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {argument.evidence.map((citation, i) => (
            <EvidenceChip
              key={`${citation.chunkId}-${i}`}
              index={i + 1}
              quote={citation.quote}
              sourceContent={evidenceChunks.find((c) => c.chunkId === citation.chunkId)?.content}
              side={side}
            />
          ))}
        </div>
      )}

      <p className="mt-4 border-t border-border/60 pt-3 text-xs italic text-muted-foreground">
        Weakest point: {argument.weakestPoint}
      </p>
    </motion.div>
  );
}
