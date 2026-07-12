// Injected into the active tab via chrome.scripting.executeScript (see
// popup.js). Runs in the page's context, once, and returns a plain object —
// no persistent content script, no listeners, nothing left behind.
function steelmanExtractPage() {
  const isYouTube =
    /(^|\.)youtube\.com$/.test(location.hostname) && location.pathname === "/watch";

  if (isYouTube) {
    const titleEl = document.querySelector(
      "h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string"
    );
    return {
      kind: "youtube",
      url: location.href,
      title: (titleEl && titleEl.textContent.trim()) || document.title.replace(/ - YouTube$/, ""),
    };
  }

  // Deliberately simple: innerText (not a Readability-style extraction) —
  // this runs in the browser, not serverless, so "simple and working" wins
  // over precision. The server-side pipeline already handles noisy text
  // fine (same claim-classification step every source type goes through).
  const text = document.body ? document.body.innerText.trim() : "";
  return {
    kind: "article",
    url: location.href,
    title: document.title,
    text,
  };
}
