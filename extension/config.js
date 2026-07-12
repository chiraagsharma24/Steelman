// Swap this to point the extension at a different deployment (e.g. localhost
// during development) — nothing else in the extension needs to change.
const STEELMAN_API_BASE = "https://steelman-six.vercel.app";

// Same cadence as the web app's polling loop (see POLL_INTERVAL_MS in
// components/analyze/AnalyzeFlow.tsx) — each poll does real work
// server-side (one claim fact-checked per call), so this is a work cadence.
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 90; // ~3 minutes ceiling before giving up

// Trims an oversized page's innerText before sending — keeps the request
// fast and bounds embedding cost. Well above what any real article needs.
const MAX_TEXT_CHARS = 20000;
