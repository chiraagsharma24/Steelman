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

// Real web searches run as background jobs and can take a while, especially
// with several checkable claims queued behind each other. Once we've been on
// the last stage this long, reassure the user rather than leave them staring
// at an apparently-stuck spinner.
const LONG_WAIT_MS = 20_000;

export function LoadingStages({ activeIndex }: { activeIndex: number }) {
  const [showLongWaitNote, setShowLongWaitNote] = useState(false);

  useEffect(() => {
    setShowLongWaitNote(false);
    if (activeIndex < LOADING_STAGES.length - 1) return;
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
