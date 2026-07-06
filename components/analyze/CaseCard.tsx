"use client";

import { motion } from "framer-motion";
import { VerdictBadge } from "./VerdictBadge";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { ArgumentColumn } from "./ArgumentColumn";
import type { ClaimResult } from "@/lib/debate/run";

export function CaseCard({ claim, index }: { claim: ClaimResult; index: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay: index * 0.1 }}
      className="rounded-xl border border-border bg-card p-6 shadow-sm md:p-8"
    >
      {claim.status === "failed" ? <FailedCase claim={claim} /> : <DoneCase claim={claim} />}
    </motion.article>
  );
}

function FailedCase({ claim }: { claim: ClaimResult }) {
  return (
    <div>
      <p className="font-serif text-lg leading-snug text-foreground">{claim.claimText}</p>
      <div className="mt-4 rounded-md border border-unsupported/30 bg-unsupported/5 px-4 py-3 text-sm">
        <p className="font-medium text-unsupported">This claim&rsquo;s analysis didn&rsquo;t complete.</p>
        {claim.error && <p className="mt-1 text-unsupported/80">{claim.error}</p>}
      </div>
    </div>
  );
}

function DoneCase({ claim }: { claim: ClaimResult }) {
  const { verdict, prosecutor, defender, evidence } = claim;
  if (!verdict || !prosecutor || !defender) return null;

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-border/70 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <p className="font-serif text-xl leading-snug text-foreground sm:max-w-[70%] sm:text-2xl">
          {claim.claimText}
        </p>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: "easeOut", delay: 0.15 }}
          >
            <VerdictBadge verdict={verdict.verdict} />
          </motion.div>
          <ConfidenceMeter confidence={verdict.confidence} />
        </div>
      </div>

      {evidence && evidence.length === 0 && (
        <p className="mt-4 text-sm italic text-muted-foreground">
          No matching evidence was found in the source for this claim.
        </p>
      )}

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <ArgumentColumn side="for" argument={defender} evidenceChunks={evidence ?? []} />
        <ArgumentColumn side="against" argument={prosecutor} evidenceChunks={evidence ?? []} />
      </div>

      <div className="mt-6 rounded-lg border border-border/70 bg-secondary/40 p-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Verdict</p>
        <p className="text-sm leading-relaxed text-foreground">{verdict.reasoning}</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-for">
              Strongest for point
            </dt>
            <dd className="mt-1 text-sm text-foreground/90">{verdict.forSummary}</dd>
          </div>
          <div>
            <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-against">
              Strongest against point
            </dt>
            <dd className="mt-1 text-sm text-foreground/90">{verdict.againstSummary}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
