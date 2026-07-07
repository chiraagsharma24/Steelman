"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CredibilityScore } from "./CredibilityScore";
import { DistributionBar } from "./DistributionBar";
import { ConsensusSummary } from "./ConsensusSummary";
import { SourceBadge } from "./SourceBadge";
import { ClaimFilters, type ClaimFilterTab } from "./ClaimFilters";
import { ClaimRow } from "./ClaimRow";
import type { SourceMode } from "./InputComposer";
import type { RunAnalysisResult } from "@/lib/analyze/run";

export function AnalysisResults({
  result,
  documentId,
  sourceMode,
  onReset,
}: {
  result: RunAnalysisResult;
  documentId?: string;
  sourceMode: SourceMode;
  onReset: () => void;
}) {
  const [tab, setTab] = useState<ClaimFilterTab>("all");
  const [technique, setTechnique] = useState<string | null>(null);

  const checkedClaims = result.claims.filter((c) => c.checkable && c.status === "DONE");
  const uncertainShare =
    checkedClaims.length > 0
      ? ((result.distribution.UNVERIFIABLE ?? 0) + (result.distribution.NEEDS_CONTEXT ?? 0)) / 100
      : 0;

  const techniques = Object.keys(result.framingCounts).sort(
    (a, b) => result.framingCounts[b] - result.framingCounts[a]
  );

  const consensusCounts = checkedClaims.reduce(
    (acc, c) => {
      const agreement = c.consensus?.agreement;
      if (agreement === "UNANIMOUS") acc.unanimous += 1;
      else if (agreement === "MAJORITY") acc.majority += 1;
      else if (agreement === "SPLIT") acc.split += 1;
      return acc;
    },
    { unanimous: 0, majority: 0, split: 0 }
  );

  const filteredClaims = useMemo(() => {
    return result.claims.filter((c) => {
      if (technique && !c.framing.includes(technique)) return false;
      if (tab === "flagged") {
        return c.factVerdict === "MISLEADING" || c.factVerdict === "FALSE";
      }
      if (tab === "factual") {
        return c.claimType === "FACTUAL";
      }
      return true;
    });
  }, [result.claims, tab, technique]);

  const flaggedCount = result.claims.filter(
    (c) => c.factVerdict === "MISLEADING" || c.factVerdict === "FALSE"
  ).length;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-col items-start justify-between gap-3 border-b border-border/70 pb-5 sm:flex-row sm:items-end">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <SourceBadge mode={sourceMode} />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Credibility analysis
            </p>
          </div>
          <h1 className="font-serif text-2xl italic text-foreground sm:text-3xl">{result.title}</h1>
        </div>
        <Button variant="outline" onClick={onReset}>
          Analyze another source
        </Button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="mb-5 rounded-xl border border-border bg-card p-5 sm:p-6"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:divide-x sm:divide-border">
          <div className="flex shrink-0 items-center justify-center sm:pr-6">
            <CredibilityScore score={result.credibilityScore} />
          </div>

          <div className="flex-1 sm:pl-6 sm:pr-6">
            <p className="mb-2.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Verdict distribution
            </p>
            <DistributionBar distribution={result.distribution} />
            {checkedClaims.length > 0 && uncertainShare >= 0.5 && (
              <p className="mt-3 text-sm italic text-muted-foreground">
                Much of this couldn&rsquo;t be verified against available evidence — treat it with
                caution rather than as confirmed.
              </p>
            )}
            {checkedClaims.length === 0 && (
              <p className="mt-2 text-sm italic text-muted-foreground">
                No empirically checkable factual claims were found in this source.
              </p>
            )}
          </div>

          <div className="sm:w-52 sm:shrink-0 sm:pl-6">
            <p className="mb-2.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Cross-model consensus
            </p>
            <ConsensusSummary
              unanimous={consensusCounts.unanimous}
              majority={consensusCounts.majority}
              split={consensusCounts.split}
              total={checkedClaims.length}
            />
          </div>
        </div>
      </motion.div>

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ClaimFilters
          activeTab={tab}
          onTabChange={setTab}
          activeTechnique={technique}
          onTechniqueChange={setTechnique}
          techniques={techniques}
        />
        <p className="text-xs text-muted-foreground">
          {result.claims.length} claim{result.claims.length === 1 ? "" : "s"} · {flaggedCount} flagged
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {filteredClaims.length === 0 ? (
          <p className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            No claims match this filter.
          </p>
        ) : (
          filteredClaims.map((claim, i) => (
            <motion.div
              key={claim.claimId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut", delay: Math.min(i * 0.05, 0.4) }}
            >
              <ClaimRow claim={claim} documentId={documentId} />
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
