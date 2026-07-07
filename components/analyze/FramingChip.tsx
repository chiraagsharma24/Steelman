export function FramingChip({ technique }: { technique: string }) {
  return (
    <span className="inline-flex items-center rounded border border-border bg-secondary px-2 py-0.5 text-[0.7rem] text-secondary-foreground">
      {technique}
    </span>
  );
}
