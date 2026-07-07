"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export const LOADING_STAGES = [
  "Reading the source",
  "Extracting claims",
  "Fact-checking against the web",
  "Cross-checking across models",
  "Scoring credibility",
] as const;

// Reassure the user once we've been in the (open-ended) claim-checking phase
// this long, rather than leaving them staring at an apparently-stuck spinner
// — real web searches run as background jobs and several claims queued
// behind each other (checked one at a time, see stepAnalysis in
// lib/analyze/run.ts) can genuinely take a while.
const LONG_WAIT_MS = 20_000;

export interface LoadingProgress {
  done: number;
  total: number;
}

function stageIndexFor(progress: LoadingProgress | null): number {
  if (!progress) return 0;
  if (progress.total === 0) return 1;
  if (progress.done >= progress.total) return 4;
  return progress.done === 0 ? 1 : 2;
}

export function LoadingStages({ progress }: { progress: LoadingProgress | null }) {
  const activeIndex = stageIndexFor(progress);
  const [showLongWaitNote, setShowLongWaitNote] = useState(false);

  useEffect(() => {
    setShowLongWaitNote(false);
    if (activeIndex < 2) return;
    const timer = setTimeout(() => setShowLongWaitNote(true), LONG_WAIT_MS);
    return () => clearTimeout(timer);
  }, [activeIndex]);

  return (
    <div className="flex flex-col items-center gap-8 py-16">
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
      {progress && progress.total > 0 && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {progress.done} of {progress.total} claim{progress.total === 1 ? "" : "s"} checked
        </p>
      )}
      {showLongWaitNote && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="max-w-xs text-center text-sm italic text-muted-foreground"
        >
          Real source checks can take a little longer, especially with several claims to verify.
          Still working — hang tight.
        </motion.p>
      )}
    </div>
  );
}
