"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export const LOADING_STAGES = [
  "Reading your source",
  "Extracting claims",
  "Gathering evidence",
  "Cross-examining",
  "Delivering verdict",
] as const;

export function LoadingStages({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="flex flex-col items-center gap-10 py-20">
      <motion.div
        className="h-9 w-9 rounded-full border-2 border-foreground/15 border-t-foreground/60"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}
        aria-hidden
      />
      <ol className="flex flex-col gap-3" aria-live="polite">
        {LOADING_STAGES.map((stage, i) => {
          const state = i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
          return (
            <li key={stage} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.65rem]",
                  state === "done" && "border-foreground/40 bg-foreground/10 text-foreground",
                  state === "active" && "border-foreground text-foreground",
                  state === "pending" && "border-foreground/20 text-foreground/30"
                )}
                aria-hidden
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              <span
                className={cn(
                  "font-serif text-base transition-colors",
                  state === "active" && "text-foreground",
                  state === "done" && "text-foreground/70",
                  state === "pending" && "text-foreground/30"
                )}
              >
                {stage}
                {state === "active" ? "…" : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
