import { cn } from "@/lib/utils";
import type { SourceMode } from "./InputComposer";

const LABELS: Record<SourceMode, string> = {
  TEXT: "Text",
  URL: "URL",
  YOUTUBE: "YouTube",
  FILE: "PDF",
};

export function SourceBadge({ mode, className }: { mode: SourceMode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border border-border bg-secondary px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-secondary-foreground",
        className
      )}
    >
      {LABELS[mode]}
    </span>
  );
}
