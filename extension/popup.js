const VERDICT_ORDER = ["SUPPORTED", "NEEDS_CONTEXT", "UNVERIFIABLE", "MISLEADING", "FALSE"];
const VERDICT_LABELS = {
  SUPPORTED: "Supported",
  NEEDS_CONTEXT: "Needs context",
  UNVERIFIABLE: "Unverifiable",
  MISLEADING: "Misleading",
  FALSE: "False",
};
// Mirrors components/analyze/DistributionBar.tsx's bg-for / bg-contested /
// bg-contested/50 / bg-against/70 / bg-against mapping, in raw HSL since the
// extension has no Tailwind.
const BAR_COLORS = {
  SUPPORTED: "hsl(155 30% 24%)",
  NEEDS_CONTEXT: "hsl(38 62% 47%)",
  UNVERIFIABLE: "hsl(38 62% 47% / 0.5)",
  MISLEADING: "hsl(355 42% 30% / 0.7)",
  FALSE: "hsl(355 42% 30%)",
};

const els = {
  loading: document.getElementById("state-loading"),
  error: document.getElementById("state-error"),
  result: document.getElementById("state-result"),
  loadingText: document.getElementById("loading-text"),
  loadingProgress: document.getElementById("loading-progress"),
  errorText: document.getElementById("error-text"),
  retryButton: document.getElementById("retry-button"),
  scoreBadge: document.getElementById("score-badge"),
  scoreNumber: document.getElementById("score-number"),
  headline: document.getElementById("headline"),
  coverage: document.getElementById("coverage"),
  distributionBar: document.getElementById("distribution-bar"),
  distributionLegend: document.getElementById("distribution-legend"),
  claimsList: document.getElementById("claims-list"),
};

function showState(name) {
  for (const key of ["loading", "error", "result"]) {
    els[key].classList.toggle("hidden", key !== name);
  }
}

function showLoading(text, progress) {
  els.loadingText.textContent = text;
  els.loadingProgress.textContent = progress || "";
  showState("loading");
}

function showError(message) {
  els.errorText.textContent = message;
  showState("error");
}

async function apiFetch(path, options) {
  const res = await fetch(STEELMAN_API_BASE + path, {
    ...options,
    headers: { "content-type": "application/json", ...(options && options.headers) },
  });

  // Check status BEFORE parsing — a server crash (Vercel's platform error
  // page, a proxy timeout page, etc.) comes back as HTML with a non-2xx
  // status, and res.json() throwing on that would surface as a confusing
  // "unexpected response" with no indication anything was actually wrong
  // server-side. Read it as text first so a real error is at least visible.
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    let message = `The Steelman API returned an error (HTTP ${res.status}).`;
    try {
      const parsed = JSON.parse(bodyText);
      if (parsed && parsed.error && parsed.error.message) message = parsed.error.message;
    } catch {
      // Non-JSON error body (e.g. an HTML error page) — keep the status-based message,
      // but log the raw body so it's visible in the extension's console for debugging.
      console.error(`[steelman] ${path} -> HTTP ${res.status}, non-JSON body:`, bodyText.slice(0, 500));
    }
    throw new Error(message);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("The Steelman API returned a response that wasn't valid JSON.");
  }
  if (!data.ok) {
    throw new Error((data.error && data.error.message) || "The Steelman API returned an error.");
  }
  return data;
}

async function extractActivePage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error("Couldn't find the active tab.");
  if (!/^https?:\/\//.test(tab.url || "")) {
    throw new Error("Steelman can only analyze regular web pages (http/https).");
  }

  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["extractor.js"] });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => steelmanExtractPage(),
  });
  return result;
}

function buildIngestBody(page) {
  if (page.kind === "youtube") {
    return { sourceType: "YOUTUBE", url: page.url };
  }
  const text = (page.text || "").slice(0, MAX_TEXT_CHARS);
  if (text.trim().length < 20) {
    throw new Error("Couldn't find enough readable text on this page to analyze.");
  }
  return { sourceType: "TEXT", text, title: page.title || undefined };
}

async function pollAnalysis(analysisId) {
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const data = await apiFetch(`/api/analyze/${analysisId}`, { method: "GET" });
    showLoading("Cross-examining this page…", `${data.doneCount}/${data.totalClaims} claims checked`);
    if (data.status === "DONE") return data;
    if (data.status === "FAILED") throw new Error("This analysis failed to complete.");
  }
  throw new Error("This is taking longer than expected. Try again in a moment.");
}

function scoreTone(insufficientEvidence, score) {
  if (insufficientEvidence || score === null || score === undefined) return "tone-unknown";
  if (score >= 70) return "tone-good";
  if (score >= 40) return "tone-mixed";
  return "tone-bad";
}

function renderResult(data) {
  const tone = scoreTone(data.insufficientEvidence, data.credibilityScore);
  els.scoreBadge.className = `score-badge ${tone}`;
  els.scoreNumber.textContent = data.insufficientEvidence || data.credibilityScore == null ? "?" : String(data.credibilityScore);

  if (data.insufficientEvidence) {
    els.headline.textContent = "Insufficient evidence to score";
    els.coverage.textContent = `We could verify ${data.verifiedCount} of ${data.checkableCount} claims against evidence — too few to summarize as a single percentage.`;
  } else {
    els.headline.textContent = `Credibility score: ${data.credibilityScore}/100`;
    els.coverage.textContent = `Verification coverage: ${data.verifiedCount} of ${data.checkableCount} claims verified`;
  }

  els.distributionBar.innerHTML = "";
  els.distributionBar.classList.remove("hidden");
  els.distributionLegend.innerHTML = "";
  const present = VERDICT_ORDER.filter((k) => (data.distribution || {})[k] > 0);
  if (present.length === 0) {
    els.distributionBar.classList.add("hidden");
    const note = document.createElement("p");
    note.className = "empty-note";
    note.style.margin = "0 0 8px";
    note.textContent = "No claims were checkable against evidence.";
    els.distributionLegend.appendChild(note);
  } else {
    for (const key of present) {
      const seg = document.createElement("div");
      seg.style.width = `${data.distribution[key]}%`;
      seg.style.background = BAR_COLORS[key];
      els.distributionBar.appendChild(seg);

      const legendItem = document.createElement("span");
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = BAR_COLORS[key];
      legendItem.appendChild(dot);
      legendItem.appendChild(document.createTextNode(`${VERDICT_LABELS[key]} ${data.distribution[key]}%`));
      els.distributionLegend.appendChild(legendItem);
    }
  }

  els.claimsList.innerHTML = "";
  if (!data.claims || data.claims.length === 0) {
    const note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = "No claims were found in this source.";
    els.claimsList.appendChild(note);
  } else {
    for (const claim of data.claims) {
      els.claimsList.appendChild(renderClaimRow(claim));
    }
  }

  showState("result");
}

function renderClaimRow(claim) {
  const row = document.createElement("div");
  const flagged = claim.factVerdict === "MISLEADING" || claim.factVerdict === "FALSE";
  row.className = flagged ? "claim-row flagged" : "claim-row";

  const text = document.createElement("p");
  text.className = "claim-text";
  text.textContent = claim.claimText;
  row.appendChild(text);

  const chip = document.createElement("span");
  if (claim.checkable && claim.factVerdict) {
    chip.className = `chip verdict-${claim.factVerdict}`;
    chip.textContent = VERDICT_LABELS[claim.factVerdict] || claim.factVerdict;
  } else if (claim.status === "FAILED") {
    chip.className = "chip non-checkable";
    chip.textContent = "Couldn't be checked";
  } else if (claim.status === "PENDING") {
    chip.className = "chip non-checkable";
    chip.textContent = "Checking…";
  } else {
    chip.className = "chip non-checkable";
    chip.textContent = (claim.claimType || "").replace("_", " ").toLowerCase() || "Not checkable";
  }
  row.appendChild(chip);

  if (claim.factExplanation) {
    const explanation = document.createElement("p");
    explanation.className = "claim-explanation";
    explanation.textContent = claim.factExplanation;
    row.appendChild(explanation);
  }

  return row;
}

async function run() {
  try {
    showLoading("Reading this page…");
    const page = await extractActivePage();

    showLoading(page.kind === "youtube" ? "Fetching the transcript…" : "Sending this page to Steelman…");
    const ingestBody = buildIngestBody(page);
    const ingestResult = await apiFetch("/api/ingest", {
      method: "POST",
      body: JSON.stringify(ingestBody),
    });

    showLoading("Classifying claims…");
    const startResult = await apiFetch("/api/analyze", {
      method: "POST",
      body: JSON.stringify({ documentId: ingestResult.documentId }),
    });

    showLoading("Cross-examining this page…", `0/${startResult.totalClaims} claims checked`);
    const finalResult = await pollAnalysis(startResult.analysisId);

    renderResult(finalResult);
  } catch (err) {
    showError(err instanceof Error ? err.message : "Something went wrong.");
  }
}

els.retryButton.addEventListener("click", run);
run();
