import { cn } from "@/lib/utils";
import type { Grounding } from "@/lib/analyze/schemas";

export function GroundingBadge({ grounding, className }: { grounding: Grounding; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-[0.7rem] font-medium",
        grounding === "WEB"
          ? "border-for/25 bg-for/5 text-for"
          : "border-border bg-muted text-muted-foreground",
        className
      )}
    >
      {grounding === "WEB" ? "Verified against live web" : "Based on model knowledge (not live web)"}
    </span>
  );
}
