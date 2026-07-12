"use client";

import { useEffect, useState } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function CredibilityScore({ score, insufficientEvidence }: { score: number | null; insufficientEvidence: boolean }) {
  const prefersReducedMotion = useReducedMotion();
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const target = score ?? 0;
  const offset = circumference * (1 - target / 100);
  const colorClass = target >= 70 ? "text-for" : target >= 40 ? "text-contested" : "text-against";

  // Counts up alongside the ring rather than popping in — a resolving
  // instrument reading, not a static label.
  const [display, setDisplay] = useState(prefersReducedMotion ? target : 0);
  useEffect(() => {
    if (insufficientEvidence) return;
    if (prefersReducedMotion) {
      setDisplay(target);
      return;
    }
    const controls = animate(0, target, {
      duration: 0.9,
      delay: 0.1,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [target, insufficientEvidence, prefersReducedMotion]);

  if (insufficientEvidence) {
    return (
      <div
        className="flex h-28 w-28 shrink-0 flex-col items-center justify-center gap-1.5 rounded-full border-2 border-dashed border-muted-foreground/30 text-center sm:h-32 sm:w-32"
        role="img"
        aria-label="Insufficient evidence to score"
      >
        <HelpCircle className="h-6 w-6 text-muted-foreground" aria-hidden />
        <span className="px-3 text-[0.65rem] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
          Insufficient
          <br />
          evidence
        </span>
      </div>
    );
  }

  return (
    <div className="relative flex h-28 w-28 shrink-0 items-center justify-center sm:h-32 sm:w-32">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120" aria-hidden>
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-border"
        />
        <motion.circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          className={colorClass}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: prefersReducedMotion ? offset : circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.9,
            ease: "easeOut",
            delay: prefersReducedMotion ? 0 : 0.1,
          }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={cn("font-serif text-3xl sm:text-4xl", colorClass)}>{display}</span>
        <span className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">Credibility</span>
      </div>
    </div>
  );
}
