# Steelman

**Every claim, cross-examined.**

Steelman takes anything you're not sure you should believe — an article, a PDF,
a Word doc, pasted text, or a YouTube video — and puts every claim in it on trial.

It extracts each factual claim, then has **three different AI models (OpenAI,
Anthropic, and Google) independently judge it**, pulling live sources from the web
where it can. You get a verdict on every claim — `SUPPORTED`, `NEEDS_CONTEXT`,
`MISLEADING`, `FALSE`, or an honest `UNVERIFIABLE` — with corrections and the
models' own agreement or disagreement shown openly. When the models split on a
claim, Steelman shows you the split instead of faking confidence.

It's neutral by design: it judges claims, never the author, and holds every claim
to the same standard. And it ships with a **browser extension** so you can
cross-examine whatever page you're on without leaving the tab.

Built for the MeshAPI Hackathon (July 2026). **Every AI call routes through the
Mesh API** — remove Mesh and the product doesn't exist.

🔗 **Live:** https://steelman-six.vercel.app

---

## What it does

Give Steelman a source — **pasted text, a URL, a PDF, or a YouTube link** — and it
produces a credibility analysis:

- **Extracts and classifies every claim** (factual / opinion / prediction / value
  judgment), flagging only genuinely checkable factual claims for verification.
- **Fact-checks each checkable claim** and returns a calibrated verdict with a
  plain-language explanation and a corrected version when a claim is wrong.
- **Cross-model consensus:** every checkable claim is judged independently by three
  models from OpenAI, Anthropic, and Google. Steelman reports whether they were
  unanimous, majority, or split — and exposes the full for/against reasoning when
  they disagree.
- **Live web verification:** for key claims it pulls real sources from the web and
  cites them (with an honest fallback to model-knowledge grounding, clearly labeled).
- **Neutral framing detection:** flags rhetorical techniques objectively, with
  symmetric standards across viewpoints.
- **A scored credibility dashboard** with a verdict distribution and a claim-by-claim
  breakdown — plus a **Chrome extension** for one-click analysis of any page.

## How Mesh powers Steelman

Mesh is the entire reasoning engine, not a feature bolted on. Every AI call routes
through it, and all SDK calls are centralized in **`lib/mesh.ts`**:

| Capability | Mesh call | Location |
|---|---|---|
| Central Mesh client + model constants + error handling | `new MeshAPI(...)` | `lib/mesh.ts:120` (`getMeshClient`) |
| Claim extraction, classification & multi-model consensus fact-checking | `chat.completions.create` | `lib/mesh.ts:132` (`chat`) → used in `lib/analyze/*` |
| Chunk embeddings for semantic retrieval | `embeddings.create` | `lib/mesh.ts:155` (`embed`) → `lib/ingest/store.ts`, `lib/retrieve.ts` |
| Live web-grounded fact-checking | `responses.create` + `web_search_preview` | `lib/mesh.ts:206` (`responses`) → `lib/analyze/factcheck.ts` |
| Multi-model fanout (comparison probe) | `compare.create` | `lib/mesh.ts:144` (`compare`) |

The multi-model consensus — the core of the product — is only possible because Mesh
routes one codebase to three model providers through a single API.

## How it works (pipeline)

1. **Ingest** — text / URL / PDF / YouTube (transcript) → normalized text.
2. **Chunk & embed** — sentence-aware chunking → Mesh embeddings → Postgres + pgvector.
3. **Classify claims** — extract discrete, self-contained claims; mark which are checkable.
4. **Fact-check** — each checkable claim verified; live web grounding when available,
   model-knowledge fallback otherwise (labeled).
5. **Cross-model consensus** — three model families judge each claim independently.
6. **Score & present** — credibility score, verdict distribution, claim-by-claim dashboard.

## Stack

- **Next.js 14** (App Router) + **TypeScript** (strict)
- **Mesh API** via `meshapi-node-sdk` — all AI calls (chat, embeddings, responses, compare)
- **Postgres (Neon) + pgvector** + **Prisma** — app data and vector search
- **Tailwind CSS + shadcn/ui + Framer Motion** — editorial UI
- Ingestion: `youtube-transcript-plus`, `@mozilla/readability`, `pdf-parse`
- **Chrome extension** (Manifest V3) in `/extension` — one-click analysis of any page

## Setup

```bash
git clone <REPO_URL>
cd Steelman
npm install

# configure environment
cp .env.example .env
# set: MESH_API_KEY (rsk_...), MESH_BASE_URL=https://api.meshapi.ai, DATABASE_URL (Neon pooled)

npx prisma generate
npx prisma migrate deploy   # or `migrate dev` on a fresh DB

npm run dev
# open http://localhost:3000
```

> **Note on the vector index:** the pgvector HNSW index is defined in a hand-written
> migration (Prisma has no vector-index-type support). If you run `prisma migrate dev`,
> check the generated migration for a stray `DROP INDEX "Chunk_embedding_hnsw_idx"` and
> remove that line before applying.

> **Note on live web verification:** Steelman's web-grounded fact-checking activates
> when the Mesh account has balance for background research jobs; otherwise it cleanly
> falls back to model-knowledge grounding, honestly labeled on every claim. No code
> change is needed to switch between them.

## Browser extension

The `/extension` folder contains a Manifest V3 Chrome extension that analyzes the page
you're on (article text extracted in the browser, or a YouTube URL) by calling the
deployed Steelman API, and renders the verdict in place.

To load it:
1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select the `/extension` folder
3. Open any article, click the Steelman icon, and get a claim-by-claim verdict.

## Try it

Paste this to see a mixed result (true + false + needs-context):

> Coffee is one of the most studied beverages in the world. Drinking coffee stunts your
> growth and causes dehydration. Coffee was first discovered in Ethiopia. Decaffeinated
> coffee contains absolutely no caffeine. Finland consumes more coffee per capita than
> any other country.

Or paste any article URL, upload a PDF, or drop a YouTube link.

## License

MIT