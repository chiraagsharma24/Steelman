"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function CredibilityScore({ score }: { score: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const colorClass = score >= 70 ? "text-for" : score >= 40 ? "text-contested" : "text-against";

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
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: "easeOut", delay: 0.1 }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={cn("font-serif text-3xl sm:text-4xl", colorClass)}>{score}</span>
        <span className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">Credibility</span>
      </div>
    </div>
  );
}
