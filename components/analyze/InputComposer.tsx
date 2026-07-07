"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SourceMode = "TEXT" | "URL" | "YOUTUBE" | "FILE";
export interface ComposerSubmission {
  mode: SourceMode;
  text?: string;
  url?: string;
  file?: File;
}

const MODES: { key: SourceMode; label: string }[] = [
  { key: "TEXT", label: "Paste text" },
  { key: "URL", label: "From a URL" },
  { key: "YOUTUBE", label: "YouTube link" },
  { key: "FILE", label: "Upload PDF" },
];

export function InputComposer({
  onSubmit,
  disabled,
}: {
  onSubmit: (submission: ComposerSubmission) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<SourceMode>("TEXT");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const canSubmit =
    !disabled &&
    ((mode === "TEXT" && text.trim().length > 20) ||
      (mode === "URL" && url.trim().length > 0) ||
      (mode === "YOUTUBE" && youtubeUrl.trim().length > 0) ||
      (mode === "FILE" && file !== null));

  function handleSubmit() {
    if (!canSubmit) return;
    if (mode === "TEXT") onSubmit({ mode, text });
    else if (mode === "URL") onSubmit({ mode, url });
    else if (mode === "YOUTUBE") onSubmit({ mode, url: youtubeUrl });
    else if (mode === "FILE" && file) onSubmit({ mode, file });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="mx-auto w-full max-w-2xl"
    >
      <div className="text-center">
        <h1 className="font-serif text-5xl italic tracking-tight text-foreground sm:text-6xl">Steelman</h1>
        <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground sm:text-lg">
          Every claim, cross-examined against the evidence.
        </p>
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm sm:p-7">
        <div className="mb-4 flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                mode === m.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === "TEXT" && (
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste an article, essay, or argument to cross-examine…"
            className="min-h-[180px] font-serif text-base"
          />
        )}
        {mode === "URL" && (
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/article"
            className="font-serif text-base"
          />
        )}
        {mode === "YOUTUBE" && (
          <>
            <Input
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              className="font-serif text-base"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Uses the video&rsquo;s English captions. Videos without English captions
              aren&rsquo;t supported yet.
            </p>
          </>
        )}
        {mode === "FILE" && (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border py-10 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
            <span>{file ? file.name : "Click to choose a PDF"}</span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        )}

        <Button onClick={handleSubmit} disabled={!canSubmit} className="mt-5 w-full text-base" size="lg">
          Cross-examine
        </Button>
      </div>
    </motion.div>
  );
}
