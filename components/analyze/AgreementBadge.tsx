import { cn } from "@/lib/utils";
import type { Agreement, FactVerdictLabel } from "@/lib/analyze/schemas";

export function AgreementBadge({
  verdicts,
  finalVerdict,
  agreement,
  className,
}: {
  verdicts: { model: string; verdict: FactVerdictLabel }[];
  finalVerdict: FactVerdictLabel;
  agreement: Agreement;
  className?: string;
}) {
  const agreeing = verdicts.filter((v) => v.verdict === finalVerdict).length;
  const total = verdicts.length;

  const style =
    agreement === "UNANIMOUS"
      ? "border-for/25 bg-for/5 text-for"
      : agreement === "MAJORITY"
        ? "border-contested/30 bg-contested/10 text-contested"
        : "border-against/25 bg-against/5 text-against";

  return (
    <span
      title={verdicts.map((v) => `${v.model}: ${v.verdict}`).join(" · ")}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium",
        style,
        className
      )}
    >
      {agreeing}/{total} models agree
    </span>
  );
}
