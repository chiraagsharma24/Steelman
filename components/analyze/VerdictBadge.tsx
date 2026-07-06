import { cn } from "@/lib/utils";
import type { RefereeVerdict } from "@/lib/debate/schemas";

type Verdict = RefereeVerdict["verdict"];

const STYLES: Record<Verdict, string> = {
  SUPPORTED: "border-for/30 bg-for/10 text-for",
  CONTESTED: "border-contested/40 bg-contested/15 text-contested",
  UNSUPPORTED: "border-unsupported/30 bg-unsupported/10 text-unsupported",
};

const LABELS: Record<Verdict, string> = {
  SUPPORTED: "Supported",
  CONTESTED: "Contested",
  UNSUPPORTED: "Unsupported",
};

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
        STYLES[verdict],
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {LABELS[verdict]}
    </span>
  );
}
