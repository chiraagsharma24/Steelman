export function ConsensusSummary({
  unanimous,
  majority,
  split,
  total,
}: {
  unanimous: number;
  majority: number;
  split: number;
  total: number;
}) {
  if (total === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-border/70 bg-secondary/30 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Cross-model consensus{" "}
        <span className="font-normal normal-case text-muted-foreground/80">
          — every checkable claim judged independently by 3 models (OpenAI, Anthropic, Google)
        </span>
      </p>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-for" aria-hidden />
          {unanimous} unanimous
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-contested" aria-hidden />
          {majority} majority
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-against" aria-hidden />
          {split} split
        </span>
      </div>
    </div>
  );
}
