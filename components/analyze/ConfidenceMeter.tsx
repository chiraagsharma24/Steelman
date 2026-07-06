import { cn } from "@/lib/utils";
import type { RefereeVerdict } from "@/lib/debate/schemas";

type Confidence = RefereeVerdict["confidence"];

const LEVELS: Confidence[] = ["LOW", "MEDIUM", "HIGH"];

export function ConfidenceMeter({
  confidence,
  className,
}: {
  confidence: Confidence;
  className?: string;
}) {
  const filled = LEVELS.indexOf(confidence) + 1;
  return (
    <div className={cn("flex items-center gap-2", className)} aria-label={`Confidence: ${confidence}`}>
      <span className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
        Confidence
      </span>
      <div className="flex items-center gap-0.5" aria-hidden>
        {LEVELS.map((level, i) => (
          <span
            key={level}
            className={cn("h-1.5 w-4 rounded-full", i < filled ? "bg-foreground/70" : "bg-foreground/15")}
          />
        ))}
      </div>
      <span className="text-[0.65rem] font-medium text-muted-foreground">{confidence}</span>
    </div>
  );
}
