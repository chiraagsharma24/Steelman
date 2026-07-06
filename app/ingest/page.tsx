"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type SourceType = "TEXT" | "URL" | "FILE";

interface IngestSuccess {
  ok: true;
  documentId: string;
  title: string;
  chunkCount: number;
}
interface ApiFailure {
  ok: false;
  error: { code: string; message: string };
}

interface SearchResult {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
}
interface SearchSuccess {
  ok: true;
  results: SearchResult[];
}

export default function IngestPage() {
  const [sourceType, setSourceType] = useState<SourceType>("TEXT");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [ingestStatus, setIngestStatus] = useState<"idle" | "loading" | "done">("idle");
  const [ingestResult, setIngestResult] = useState<IngestSuccess | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "done">("idle");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  async function handleIngest() {
    setIngestStatus("loading");
    setIngestResult(null);
    setIngestError(null);
    try {
      let res: Response;
      if (sourceType === "FILE") {
        if (!file) {
          setIngestError("Choose a PDF file first.");
          setIngestStatus("done");
          return;
        }
        const form = new FormData();
        form.set("file", file);
        res = await fetch("/api/ingest", { method: "POST", body: form });
      } else {
        res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            sourceType === "TEXT" ? { sourceType, text, title: title || undefined } : { sourceType, url }
          ),
        });
      }
      const data = (await res.json()) as IngestSuccess | ApiFailure;
      if (data.ok) {
        setIngestResult(data);
      } else {
        setIngestError(`${data.error.code}: ${data.error.message}`);
      }
    } catch {
      setIngestError("Could not reach the server.");
    } finally {
      setIngestStatus("done");
    }
  }

  async function handleSearch() {
    setSearchStatus("loading");
    setSearchError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = (await res.json()) as SearchSuccess | ApiFailure;
      if (data.ok) {
        setResults(data.results);
      } else {
        setSearchError(`${data.error.code}: ${data.error.message}`);
        setResults([]);
      }
    } catch {
      setSearchError("Could not reach the server.");
    } finally {
      setSearchStatus("done");
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <h1 className="font-serif text-3xl italic text-foreground">Ingestion playground</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Paste text, point at a URL, or upload a PDF — it gets chunked, embedded, and stored.
        Then search to confirm retrieval works.
      </p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Ingest a source</CardTitle>
          <CardDescription>Pick one source type.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {(["TEXT", "URL", "FILE"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSourceType(t)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  sourceType === t
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background text-foreground hover:bg-accent"
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {sourceType === "TEXT" && (
            <div className="space-y-3">
              <Input
                placeholder="Title (optional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Textarea
                placeholder="Paste text to ingest…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          )}

          {sourceType === "URL" && (
            <Input
              placeholder="https://example.com/article"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          )}

          {sourceType === "FILE" && (
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium file:text-secondary-foreground"
            />
          )}

          <Button onClick={handleIngest} disabled={ingestStatus === "loading"}>
            {ingestStatus === "loading" ? "Ingesting…" : "Ingest"}
          </Button>

          {ingestResult && (
            <div className="rounded-md border border-border bg-secondary px-4 py-3 text-sm text-secondary-foreground">
              <p className="font-medium">{ingestResult.title}</p>
              <p className="text-muted-foreground">
                {ingestResult.chunkCount} chunks · document {ingestResult.documentId}
              </p>
            </div>
          )}
          {ingestError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {ingestError}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Search</CardTitle>
          <CardDescription>Semantic search across all ingested chunks.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search query…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={searchStatus === "loading" || !query.trim()}>
              {searchStatus === "loading" ? "Searching…" : "Search"}
            </Button>
          </div>

          {searchError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {searchError}
            </div>
          )}

          {results.length > 0 && (
            <ul className="space-y-3">
              {results.map((r) => (
                <li key={r.chunkId} className="rounded-md border border-border bg-card p-3 text-sm">
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>doc {r.documentId.slice(0, 8)}…</span>
                    <span>score {r.score.toFixed(3)}</span>
                  </div>
                  <p className="text-foreground">{r.content}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
