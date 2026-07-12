# Steelman

Steelman is an evidence-grounded adversarial argument analyzer. You give it a
claim or a source document; it runs a structured debate — a prosecutor model
arguing against, a defender model arguing for, and a referee model weighing
both against retrieved evidence — and returns a verdict with confidence,
not just an opinion.

All AI calls go through **MeshAPI**, an OpenAI-compatible model gateway, via
the `meshapi-node-sdk`. App data (documents, debates, verdicts, chunk
embeddings) lives in Postgres (Neon) via Prisma. Retrieval is built on our
own `Chunk` model + pgvector — the installed Mesh SDK (v0.1.0) has no
`rag` namespace, so embeddings are generated with `embed()` and stored/
searched ourselves.

## Stack

- Next.js 14 (App Router) + TypeScript (strict)
- Tailwind CSS + shadcn/ui (classic v3 recipe: Radix + CVA) + Framer Motion
- Prisma 5 + PostgreSQL (Neon), with the `pgvector` extension for chunk embeddings
- `meshapi-node-sdk` — chat, compare, and embeddings; wrapped in `lib/mesh.ts`

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment variables**

   Copy `.env.example` to `.env` (a placeholder `.env` already exists) and fill in:

   ```bash
   MESH_API_KEY=rsk_...       # your MeshAPI data-plane key
   MESH_BASE_URL=https://api.meshapi.ai
   DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
   ```

   `DATABASE_URL` should be a Neon Postgres connection string (the pooled
   connection string from your Neon dashboard works fine).

3. **Set up the database**

   ```bash
   npx prisma migrate dev --name init
   ```

   This creates `Document`, `Debate`, `Verdict`, and `Chunk` tables, enables
   the `vector` Postgres extension, and generates the Prisma Client. Neon
   supports `pgvector` natively — no extra setup needed on their end.

4. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Smoke-testing the Mesh integration

The home page has a "Test Mesh Connection" button that hits `GET /api/smoke`.
That route makes one real `chat.completions.create` call and one real
`embeddings.create` call — it's the fastest way to confirm your Mesh
credentials and network path actually work before building features on top.

You can also hit it directly:

```bash
curl http://localhost:3000/api/smoke
```

**Success** looks like:

```json
{
  "ok": true,
  "reply": "MESH OK",
  "tokens": 23,
  "embedding": { "model": "openai/text-embedding-3-small", "dimensions": 1536 }
}
```

**Failure** (e.g. missing/invalid key, rate limit, model unavailable) returns
a structured error instead of a crash:

```json
{
  "ok": false,
  "error": { "code": "unauthorized", "message": "Mesh rejected the request credentials. Check MESH_API_KEY." }
}
```

## Project structure

```
app/
  api/smoke/route.ts   # Mesh integration smoke test
  page.tsx             # home page
  layout.tsx
lib/
  mesh.ts              # Mesh client, chat/compare/embed helpers, AppError, model constants
  prisma.ts            # Prisma client singleton
  utils.ts             # cn() helper (shadcn)
components/ui/         # shadcn/ui primitives (Button, Card)
prisma/schema.prisma    # Document, Debate, Verdict, Chunk (+ pgvector)
```

Model IDs used by each debate role are defined once in `lib/mesh.ts`
(`EXTRACTOR_MODEL`, `PROSECUTOR_MODEL`, `DEFENDER_MODEL`, `REFEREE_MODEL`,
`EMBED_MODEL`) — change them there to swap models everywhere.
