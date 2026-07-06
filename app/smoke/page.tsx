"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SmokeSuccess {
  ok: true;
  reply: string | null;
  tokens: number | null;
  embedding: { model: string; dimensions: number | null };
}

interface SmokeFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    requestId?: string;
    retryAfterSeconds?: number;
  };
}

type SmokeResult = SmokeSuccess | SmokeFailure;
type Status = "idle" | "loading" | "done";

export default function SmokePage() {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<SmokeResult | null>(null);

  async function testConnection() {
    setStatus("loading");
    setResult(null);
    try {
      const res = await fetch("/api/smoke");
      const data = (await res.json()) as SmokeResult;
      setResult(data);
    } catch {
      setResult({
        ok: false,
        error: { code: "unknown", message: "Could not reach the server." },
      });
    } finally {
      setStatus("done");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <Card className="w-full max-w-md border-border/80 shadow-sm">
        <CardContent className="flex flex-col items-center gap-6 p-10 text-center">
          <div>
            <h1 className="font-serif text-5xl italic tracking-tight text-foreground">
              Steelman
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Dev diagnostic — Mesh connection smoke test.
            </p>
          </div>

          <Button
            onClick={testConnection}
            disabled={status === "loading"}
            className="w-full"
          >
            {status === "loading" ? "Testing…" : "Test Mesh Connection"}
          </Button>

          <AnimatePresence mode="wait">
            {result && (
              <motion.div
                key={result.ok ? "success" : "error"}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className={cn(
                  "w-full rounded-md border px-4 py-3 text-left text-sm",
                  result.ok
                    ? "border-border bg-secondary text-secondary-foreground"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                )}
              >
                {result.ok ? (
                  <div className="space-y-1">
                    <p className="font-medium">Mesh reply: {result.reply ?? "—"}</p>
                    <p className="text-muted-foreground">
                      tokens: {result.tokens ?? "—"} · embedding dims:{" "}
                      {result.embedding.dimensions ?? "—"} ({result.embedding.model})
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="font-medium">
                      {result.error.code}: {result.error.message}
                    </p>
                    {result.error.requestId && (
                      <p className="text-destructive/70">
                        request id: {result.error.requestId}
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </main>
  );
}
