"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { InputComposer, type ComposerSubmission, type SourceMode } from "./InputComposer";
import { LoadingStages, LOADING_STAGES } from "./LoadingStages";
import { AnalysisResults } from "./AnalysisResults";
import type { RunAnalysisResult } from "@/lib/analyze/run";

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
interface AnalyzeSuccess extends RunAnalysisResult {
  ok: true;
}

const STAGE_ADVANCE_MS = 3200;

const SOURCE_TYPE_BY_MODE: Record<SourceMode, string> = {
  TEXT: "TEXT",
  URL: "URL",
  YOUTUBE: "YOUTUBE",
  FILE: "FILE",
};

export function AnalyzeFlow() {
  const [stage, setStage] = useState<Stage>("input");
  const [loadingIndex, setLoadingIndex] = useState(0);
  const [result, setResult] = useState<AnalyzeSuccess | null>(null);
  const [documentId, setDocumentId] = useState<string | undefined>(undefined);
  const [sourceMode, setSourceMode] = useState<SourceMode>("TEXT");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopAdvancing() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  async function handleSubmit(submission: ComposerSubmission) {
    setStage("loading");
    setLoadingIndex(0);
    setErrorMessage(null);
    setSourceMode(submission.mode);

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

      setLoadingIndex(1);
      let i = 1;
      intervalRef.current = setInterval(() => {
        i = Math.min(i + 1, LOADING_STAGES.length - 1);
        setLoadingIndex(i);
      }, STAGE_ADVANCE_MS);

      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId: ingestData.documentId }),
      });
      const analyzeData = (await analyzeRes.json()) as AnalyzeSuccess | ApiFailure;

      stopAdvancing();

      if (!analyzeData.ok) {
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
            <LoadingStages activeIndex={loadingIndex} />
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
