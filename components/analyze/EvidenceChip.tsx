"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type EvidenceSide = "for" | "against";

interface EvidenceChipProps {
  index: number;
  quote: string;
  sourceContent?: string;
  side: EvidenceSide;
}

export function EvidenceChip({ index, quote, sourceContent, side }: EvidenceChipProps) {
  const [open, setOpen] = useState(false);
  const accent = side === "for" ? "for" : "against";

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          accent === "for"
            ? "border-for/30 text-for hover:bg-for/10"
            : "border-against/30 text-against hover:bg-against/10"
        )}
      >
        <span>Evidence {index}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <blockquote
              className={cn(
                "mt-2 rounded-md border-l-2 p-3 text-sm italic text-foreground/90",
                accent === "for" ? "border-for/40 bg-for-muted/50" : "border-against/40 bg-against-muted/50"
              )}
            >
              &ldquo;{quote}&rdquo;
              {sourceContent && sourceContent !== quote && (
                <div className="mt-2 max-h-40 overflow-y-auto rounded border border-border/60 bg-card/60 p-2 text-xs not-italic text-muted-foreground">
                  {sourceContent}
                </div>
              )}
            </blockquote>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
