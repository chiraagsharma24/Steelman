"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { FactVerdictLabel } from "@/lib/analyze/schemas";

const ORDER: FactVerdictLabel[] = ["SUPPORTED", "NEEDS_CONTEXT", "UNVERIFIABLE", "MISLEADING", "FALSE"];

const BAR_COLOR: Record<FactVerdictLabel, string> = {
  SUPPORTED: "bg-for",
  NEEDS_CONTEXT: "bg-contested",
  UNVERIFIABLE: "bg-contested/50",
  MISLEADING: "bg-against/70",
  FALSE: "bg-against",
};

const DOT_COLOR: Record<FactVerdictLabel, string> = BAR_COLOR;

const LABELS: Record<FactVerdictLabel, string> = {
  SUPPORTED: "Supported",
  NEEDS_CONTEXT: "Needs context",
  UNVERIFIABLE: "Unverifiable",
  MISLEADING: "Misleading",
  FALSE: "False",
};

export function DistributionBar({ distribution }: { distribution: Record<FactVerdictLabel, number> }) {
  const prefersReducedMotion = useReducedMotion();
  const present = ORDER.filter((key) => distribution[key] > 0);

  if (present.length === 0) {
    return <p className="text-sm italic text-muted-foreground">No claims were checkable against evidence.</p>;
  }

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {present.map((key) => (
          <motion.div
            key={key}
            className={BAR_COLOR[key]}
            initial={prefersReducedMotion ? false : { width: 0 }}
            animate={{ width: `${distribution[key]}%` }}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.8,
              ease: "easeOut",
              delay: prefersReducedMotion ? 0 : 0.2,
            }}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {present.map((key) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", DOT_COLOR[key])} aria-hidden />
            {LABELS[key]} <span className="font-medium text-foreground">{distribution[key]}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}
