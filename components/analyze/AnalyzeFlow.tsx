"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { InputComposer, type ComposerSubmission, type SourceMode } from "./InputComposer";
import { LoadingStages } from "./LoadingStages";
import { AnalysisResults } from "./AnalysisResults";
import type { AnalysisPollResult, RunAnalysisResult } from "@/lib/analyze/run";

type Stage = "input" | "loading" | "results" | "error";

interface ApiFailure {
  ok: false;
  error: { code: string; message: string };
}
interface IngestSuccess {
  ok: true;
  documentId: string;
  title: string;
  chunkCount: number;
}
interface AnalyzeStarted {
  ok: true;
  analysisId: string;
  title: string;
  totalClaims: number;
  checkableCount: number;
}
interface AnalyzePoll extends AnalysisPollResult {
  ok: true;
}
interface AnalyzeSuccess extends RunAnalysisResult {
  ok: true;
}

// How often the loading screen re-checks analysis progress. Each poll does
// real work server-side (one claim gets fact-checked per call — see
// stepAnalysis in lib/analyze/run.ts), so this is a work cadence, not just a
// UI refresh rate.
const POLL_INTERVAL_MS = 2000;

const SOURCE_TYPE_BY_MODE: Record<SourceMode, string> = {
  TEXT: "TEXT",
  URL: "URL",
  YOUTUBE: "YOUTUBE",
  FILE: "FILE",
};

export function AnalyzeFlow() {
  const [stage, setStage] = useState<Stage>("input");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<AnalyzeSuccess | null>(null);
  const [documentId, setDocumentId] = useState<string | undefined>(undefined);
  const [sourceMode, setSourceMode] = useState<SourceMode>("TEXT");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  function stopAdvancing() {
    cancelledRef.current = true;
  }

  async function pollUntilDone(analysisId: string): Promise<AnalyzeSuccess | ApiFailure> {
    // A single bad poll (network blip, a transient 500 from a serverless
    // DB cold-start reconnect) must not end the whole analysis — the
    // backend keeps the run alive and a retry a couple seconds later
    // almost always succeeds. Only give up after several in a row.
    const MAX_CONSECUTIVE_FAILURES = 5;
    let consecutiveFailures = 0;

    for (;;) {
      if (cancelledRef.current) return { ok: false, error: { code: "cancelled", message: "Cancelled." } };

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      if (cancelledRef.current) return { ok: false, error: { code: "cancelled", message: "Cancelled." } };

      let data: AnalyzePoll | ApiFailure;
      try {
        const res = await fetch(`/api/analyze/${analysisId}`);
        data = (await res.json()) as AnalyzePoll | ApiFailure;
      } catch {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          return { ok: false, error: { code: "unknown", message: "Could not reach the server. Check your connection and try again." } };
        }
        continue;
      }

      if (!data.ok) {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return data;
        continue;
      }
      consecutiveFailures = 0;

      setProgress({ done: data.doneCount, total: data.totalClaims });

      if (data.status === "FAILED") {
        return { ok: false, error: { code: "unknown", message: "This analysis failed to complete." } };
      }
      if (data.status === "DONE") {
        return {
          ok: true,
          analysisId: data.analysisId,
          title: data.title,
          credibilityScore: data.credibilityScore ?? null,
          insufficientEvidence: data.insufficientEvidence ?? false,
          checkableCount: data.checkableCount ?? 0,
          verifiedCount: data.verifiedCount ?? 0,
          distribution: data.distribution as RunAnalysisResult["distribution"],
          framingCounts: data.framingCounts as Record<string, number>,
          claims: data.claims,
        };
      }
      // status === "RUNNING": loop and poll again.
    }
  }

  async function handleSubmit(submission: ComposerSubmission) {
    setStage("loading");
    setProgress(null);
    setErrorMessage(null);
    setSourceMode(submission.mode);
    cancelledRef.current = false;

    try {
      let ingestRes: Response;
      if (submission.mode === "FILE" && submission.file) {
        const form = new FormData();
        form.set("file", submission.file);
        ingestRes = await fetch("/api/ingest", { method: "POST", body: form });
      } else {
        ingestRes = await fetch("/api/ingest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            submission.mode === "TEXT"
              ? { sourceType: "TEXT", text: submission.text }
              : { sourceType: SOURCE_TYPE_BY_MODE[submission.mode], url: submission.url }
          ),
        });
      }

      const ingestData = (await ingestRes.json()) as IngestSuccess | ApiFailure;
      if (!ingestData.ok) {
        setErrorMessage(ingestData.error.message);
        setStage("error");
        return;
      }
      setDocumentId(ingestData.documentId);

      const startRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId: ingestData.documentId }),
      });
      const startData = (await startRes.json()) as AnalyzeStarted | ApiFailure;
      if (!startData.ok) {
        setErrorMessage(startData.error.message);
        setStage("error");
        return;
      }
      setProgress({ done: 0, total: startData.totalClaims });

      const analyzeData = await pollUntilDone(startData.analysisId);

      if (!analyzeData.ok) {
        if (analyzeData.error.code === "cancelled") return;
        setErrorMessage(analyzeData.error.message);
        setStage("error");
        return;
      }

      setResult(analyzeData);
      setStage("results");
    } catch {
      stopAdvancing();
      setErrorMessage("Could not reach the server. Check your connection and try again.");
      setStage("error");
    }
  }

  function reset() {
    stopAdvancing();
    setResult(null);
    setDocumentId(undefined);
    setErrorMessage(null);
    setStage("input");
  }

  return (
    <main className="min-h-screen bg-background px-6 py-16 sm:py-24">
      <AnimatePresence mode="wait">
        {stage === "input" && (
          <motion.div
            key="input"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <InputComposer onSubmit={handleSubmit} />
          </motion.div>
        )}

        {stage === "loading" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <LoadingStages progress={progress} />
          </motion.div>
        )}

        {stage === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="mx-auto flex max-w-md flex-col items-center gap-5 rounded-xl border border-unsupported/30 bg-unsupported/5 px-8 py-12 text-center"
          >
            <p className="font-serif text-xl text-foreground">This analysis didn&rsquo;t go through.</p>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <Button onClick={reset}>Try again</Button>
          </motion.div>
        )}

        {stage === "results" && result && (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <AnalysisResults
              result={result}
              documentId={documentId}
              sourceMode={sourceMode}
              onReset={reset}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
