"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { FactVerdictChip } from "./FactVerdictChip";
import { AgreementBadge } from "./AgreementBadge";
import { FramingChip } from "./FramingChip";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { GroundingBadge } from "./GroundingBadge";
import type { ClaimAnalysisResult } from "@/lib/analyze/run";

const NON_CHECKABLE_COPY: Record<string, { label: string; sentence: string }> = {
  OPINION: { label: "Opinion", sentence: "This is an opinion, so it wasn’t fact-checked against evidence." },
  PREDICTION: {
    label: "Prediction",
    sentence: "This is a prediction about the future, so it wasn’t fact-checked against evidence.",
  },
  VALUE_JUDGMENT: {
    label: "Value judgment",
    sentence: "This is a value judgment, so it wasn’t fact-checked against evidence.",
  },
  FACTUAL: {
    label: "Too vague to verify",
    sentence: "This claim is too general to check against evidence, so it wasn’t fact-checked.",
  },
};

interface DebateOnDemandState {
  status: "idle" | "loading" | "done" | "error";
  prosecutor?: string;
  defender?: string;
  error?: string;
}

export function ClaimRow({
  claim,
  documentId,
}: {
  claim: ClaimAnalysisResult;
  documentId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [debateState, setDebateState] = useState<DebateOnDemandState>({ status: "idle" });
  const prefersReducedMotion = useReducedMotion();

  const isFlagged = claim.factVerdict === "MISLEADING" || claim.factVerdict === "FALSE";
  const isContested = Boolean(claim.consensus && claim.consensus.agreement !== "UNANIMOUS");

  async function runOnDemandDebate() {
    if (!documentId) return;
    setDebateState({ status: "loading" });
    try {
      const res = await fetch("/api/debate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId, question: claim.claimText }),
      });
      const data = await res.json();
      if (!data.ok) {
        setDebateState({ status: "error", error: data.error.message });
        return;
      }
      const first = data.claims?.[0];
      if (!first || first.status !== "done") {
        setDebateState({ status: "error", error: "Could not build a for/against debate for this claim." });
        return;
      }
      setDebateState({
        status: "done",
        prosecutor: first.prosecutor.argument,
        defender: first.defender.argument,
      });
    } catch {
      setDebateState({ status: "error", error: "Could not reach the server." });
    }
  }

  return (
    <motion.div
      className={cn(
        "rounded-lg border bg-card",
        isFlagged ? "border-against/35" : claim.factVerdict === "SUPPORTED" ? "border-for/25" : "border-border"
      )}
      // A brief accent pulse as a flagged claim lands, so the "catch" reads
      // as a catch rather than just another row appearing.
      animate={
        isFlagged && !prefersReducedMotion
          ? { boxShadow: ["0 0 0 0 hsl(var(--against) / 0)", "0 0 0 3px hsl(var(--against) / 0.18)", "0 0 0 0 hsl(var(--against) / 0)"] }
          : undefined
      }
      transition={isFlagged ? { duration: 1, delay: 0.4, ease: "easeOut", times: [0, 0.45, 1] } : undefined}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-2.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="font-serif text-base leading-snug text-foreground">{claim.claimText}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {claim.checkable && claim.factVerdict ? (
              <>
                <FactVerdictChip verdict={claim.factVerdict} />
                {claim.factConfidence && <ConfidenceMeter confidence={claim.factConfidence} />}
                {claim.consensus && (
                  <AgreementBadge
                    verdicts={claim.consensus.verdicts}
                    finalVerdict={claim.factVerdict}
                    agreement={claim.consensus.agreement}
                  />
                )}
                {claim.grounding && <GroundingBadge grounding={claim.grounding} />}
              </>
            ) : claim.status === "FAILED" ? (
              <span className="text-xs italic text-unsupported">Couldn&rsquo;t be checked</span>
            ) : claim.status === "PENDING" ? (
              <span className="text-xs italic text-muted-foreground">Checking…</span>
            ) : (
              <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {NON_CHECKABLE_COPY[claim.claimType]?.label ?? claim.claimType.replace("_", " ").toLowerCase()}
              </span>
            )}
            {claim.framing.map((f) => (
              <FramingChip key={f} technique={f} />
            ))}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/70 px-4 py-3.5">
              {claim.status === "FAILED" ? (
                <p className="text-sm text-unsupported">{claim.error}</p>
              ) : claim.status === "PENDING" ? (
                <p className="text-sm italic text-muted-foreground">Still being checked…</p>
              ) : claim.checkable ? (
                <div className="space-y-3.5">
                  {claim.factExplanation && (
                    <p className="text-sm leading-relaxed text-foreground">{claim.factExplanation}</p>
                  )}

                  {claim.correction && (
                    <div className="rounded-md border border-against/30 bg-against/5 p-3 text-sm">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-against">
                        More accurate version
                      </p>
                      <p className="text-foreground">{claim.correction}</p>
                    </div>
                  )}

                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {claim.grounding === "WEB" ? "Sources" : "Grounding"}
                    </p>
                    {claim.grounding === "WEB" && claim.sources && claim.sources.length > 0 ? (
                      <ul className="space-y-2">
                        {claim.sources.map((s, i) => (
                          <motion.li
                            key={i}
                            initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              duration: prefersReducedMotion ? 0 : 0.25,
                              ease: "easeOut",
                              delay: prefersReducedMotion ? 0 : i * 0.06,
                            }}
                            className="rounded-md border border-border/70 bg-secondary/40 p-2.5 text-sm"
                          >
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                            >
                              {s.title || s.url}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            {s.snippet && <p className="mt-1 text-xs text-muted-foreground">{s.snippet}</p>}
                          </motion.li>
                        ))}
                      </ul>
                    ) : claim.grounding === "WEB" ? (
                      <p className="text-xs italic text-muted-foreground">
                        A live web search ran for this claim, but returned no specific source
                        citations to link to.
                      </p>
                    ) : (
                      <p className="text-xs italic text-muted-foreground">
                        Based on model knowledge (not live web) — no web search results were available
                        for this claim, so this verdict rests on the models&rsquo; training knowledge
                        rather than a live source check.
                      </p>
                    )}
                  </div>

                  {isContested && documentId && (
                    <div className="border-t border-border/60 pt-3">
                      {debateState.status === "idle" && (
                        <button
                          type="button"
                          onClick={runOnDemandDebate}
                          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                        >
                          Models disagree — see the full for/against debate →
                        </button>
                      )}
                      {debateState.status === "loading" && (
                        <p className="text-xs text-muted-foreground">Building the debate…</p>
                      )}
                      {debateState.status === "error" && (
                        <p className="text-xs text-unsupported">{debateState.error}</p>
                      )}
                      {debateState.status === "done" && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-md border border-for/25 bg-for-muted/30 p-3">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-for">For</p>
                            <p className="text-sm text-foreground">{debateState.defender}</p>
                          </div>
                          <div className="rounded-md border border-against/25 bg-against-muted/30 p-3">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-against">
                              Against
                            </p>
                            <p className="text-sm text-foreground">{debateState.prosecutor}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  {NON_CHECKABLE_COPY[claim.claimType]?.sentence ??
                    "This claim wasn’t fact-checked against evidence."}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
