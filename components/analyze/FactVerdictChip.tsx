"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { FactVerdictLabel } from "@/lib/analyze/schemas";

const STYLES: Record<FactVerdictLabel, string> = {
  SUPPORTED: "border-for/30 bg-for/10 text-for",
  NEEDS_CONTEXT: "border-contested/40 bg-contested/15 text-contested",
  UNVERIFIABLE: "border-muted-foreground/30 bg-muted text-muted-foreground",
  MISLEADING: "border-against/30 bg-against/10 text-against",
  FALSE: "border-against/50 bg-against/15 text-against",
};

const LABELS: Record<FactVerdictLabel, string> = {
  SUPPORTED: "Supported",
  NEEDS_CONTEXT: "Needs context",
  UNVERIFIABLE: "Unverifiable",
  MISLEADING: "Misleading",
  FALSE: "False",
};

export function FactVerdictChip({ verdict, className }: { verdict: FactVerdictLabel; className?: string }) {
  const prefersReducedMotion = useReducedMotion();
  const isFlagged = verdict === "MISLEADING" || verdict === "FALSE";

  return (
    <motion.span
      initial={prefersReducedMotion ? false : { opacity: 0, scale: isFlagged ? 0.7 : 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: prefersReducedMotion ? 0 : isFlagged ? 0.35 : 0.2,
        ease: isFlagged ? [0.34, 1.56, 0.64, 1] : "easeOut",
      }}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
        STYLES[verdict],
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {LABELS[verdict]}
    </motion.span>
  );
}
