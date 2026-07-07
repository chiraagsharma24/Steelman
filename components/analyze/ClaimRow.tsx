"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { FactVerdictChip } from "./FactVerdictChip";
import { AgreementBadge } from "./AgreementBadge";
import { FramingChip } from "./FramingChip";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { GroundingBadge } from "./GroundingBadge";
import type { ClaimAnalysisResult } from "@/lib/analyze/run";

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
    <div
      className={cn(
        "rounded-lg border bg-card",
        isFlagged ? "border-against/35" : claim.factVerdict === "SUPPORTED" ? "border-for/25" : "border-border"
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="font-serif text-base leading-snug text-foreground">{claim.claimText}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
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
            ) : (
              <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {claim.claimType.replace("_", " ").toLowerCase()}
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
            <div className="border-t border-border/70 px-4 py-4">
              {claim.status === "FAILED" ? (
                <p className="text-sm text-unsupported">{claim.error}</p>
              ) : claim.checkable ? (
                <div className="space-y-4">
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
                          <li
                            key={i}
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
                          </li>
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
                  This is a {claim.claimType.replace("_", " ").toLowerCase()}, not an empirically checkable
                  factual claim — it wasn&rsquo;t fact-checked.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
