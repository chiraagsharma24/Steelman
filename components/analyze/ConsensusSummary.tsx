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
  if (total === 0) {
    return <p className="text-sm italic text-muted-foreground">No claims were fact-checked.</p>;
  }

  return (
    <div className="flex flex-col gap-1.5 text-sm text-foreground">
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
      <p className="mt-1 text-xs leading-snug text-muted-foreground">
        Each claim judged independently by 3 models (OpenAI, Anthropic, Google).
      </p>
    </div>
  );
}
