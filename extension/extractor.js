// Injected into the active tab via chrome.scripting.executeScript (see
// popup.js). Runs in the page's context, once, and returns a plain object —
// no persistent content script, no listeners, nothing left behind.
//
// YouTube transcripts are extracted here, client-side, on purpose: the
// server-side fetch (youtube-transcript-plus, in lib/ingest/youtube.ts)
// works from a developer's home IP but gets blocked by YouTube when called
// from Vercel's datacenter IPs. The transcript data itself is public and
// loads fine in the user's own browser — so the extension grabs it directly
// instead of asking the deployed API to fetch it server-side.
async function steelmanExtractPage() {
  const isYouTube =
    /(^|\.)youtube\.com$/.test(location.hostname) && location.pathname === "/watch";

  if (isYouTube) {
    const titleEl = document.querySelector(
      "h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string"
    );
    const title = (titleEl && titleEl.textContent.trim()) || document.title.replace(/ - YouTube$/, "");

    const transcript = await steelmanGetYouTubeTranscript();
    return { kind: "youtube", url: location.href, title, transcript };
  }

  // Deliberately simple: innerText (not a Readability-style extraction) —
  // this runs in the browser, not serverless, so "simple and working" wins
  // over precision. The server-side pipeline already handles noisy text
  // fine (same claim-classification step every source type goes through).
  const text = document.body ? document.body.innerText.trim() : "";
  return { kind: "article", url: location.href, title: document.title, text };
}

const STRIP_ANNOTATIONS_RE = /\[[^\]]{1,30}\]/g; // [Music], [Applause], [♪], etc.

function steelmanCleanTranscriptText(raw) {
  return raw
    .replace(STRIP_ANNOTATIONS_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function steelmanGetYouTubeTranscript() {
  const fromCaptionTrack = await steelmanTranscriptFromCaptionTrack().catch(() => null);
  if (fromCaptionTrack) return fromCaptionTrack;

  const fromPanel = await steelmanTranscriptFromPanel().catch(() => null);
  if (fromPanel) return fromPanel;

  return null;
}

// --- Method 1 (primary): read the caption track YouTube already loaded for
// the player, and fetch its timedtext XML directly. No UI interaction, no
// waiting on rendering — just the page's own data, fetched same-origin so
// it runs on the user's IP, not the server's. ---
async function steelmanTranscriptFromCaptionTrack() {
  const playerResponse = steelmanFindPlayerResponse();
  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks) || tracks.length === 0) return null;

  const english = tracks.filter((t) => (t.languageCode || "").toLowerCase().startsWith("en"));
  const pool = english.length > 0 ? english : tracks;
  // Prefer a human-authored track over YouTube's auto-generated ("asr") one when both exist.
  const track = [...pool].sort((a, b) => (a.kind === "asr" ? 1 : 0) - (b.kind === "asr" ? 1 : 0))[0];
  if (!track || !track.baseUrl) return null;

  const res = await fetch(track.baseUrl);
  if (!res.ok) return null;
  const xmlText = await res.text();
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  const nodes = Array.from(doc.getElementsByTagName("text"));
  if (nodes.length === 0) return null;

  const joined = nodes
    .map((n) => n.textContent || "")
    .filter(Boolean)
    .join(" ");
  return steelmanCleanTranscriptText(joined);
}

function steelmanFindPlayerResponse() {
  if (window.ytInitialPlayerResponse) return window.ytInitialPlayerResponse;
  const scripts = document.querySelectorAll("script");
  for (const script of scripts) {
    const text = script.textContent || "";
    if (!text.includes("ytInitialPlayerResponse")) continue;
    const match = text.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\})\s*;/s);
    if (!match) continue;
    try {
      return JSON.parse(match[1]);
    } catch {
      continue;
    }
  }
  return null;
}

// --- Method 2 (fallback): open YouTube's own transcript panel and scrape
// the rendered segment text. Only used if the caption track wasn't
// reachable above (e.g. player data shape changed). ---
async function steelmanTranscriptFromPanel() {
  if (!document.querySelector("ytd-transcript-segment-renderer")) {
    const opened = steelmanOpenTranscriptPanel();
    if (!opened) return null;
    const appeared = await steelmanWaitFor(
      () => document.querySelectorAll("ytd-transcript-segment-renderer").length > 0,
      6000
    );
    if (!appeared) return null;
  }

  const segments = Array.from(document.querySelectorAll("ytd-transcript-segment-renderer"));
  if (segments.length === 0) return null;

  const joined = segments
    .map((seg) => {
      const textEl = seg.querySelector(".segment-text");
      if (textEl) return textEl.textContent || "";
      // Fallback if the class name has changed: strip a leading "0:00"-style
      // timestamp off the segment's full text instead.
      return (seg.textContent || "").replace(/^\s*\d{1,2}:\d{2}(:\d{2})?\s*/, "");
    })
    .filter(Boolean)
    .join(" ");

  return steelmanCleanTranscriptText(joined);
}

function steelmanOpenTranscriptPanel() {
  const buttons = Array.from(document.querySelectorAll("button"));
  const button = buttons.find((b) => {
    const label = (b.getAttribute("aria-label") || b.textContent || "").toLowerCase();
    return label.includes("transcript");
  });
  if (!button) return false;
  button.click();
  return true;
}

function steelmanWaitFor(predicate, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) return resolve(true);
      if (Date.now() - start >= timeoutMs) return resolve(false);
      setTimeout(tick, 200);
    };
    tick();
  });
}
