/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfjs-dist (via pdf-parse) breaks when webpack bundles it into the RSC
  // server build (`Object.defineProperty called on non-object` at module
  // init). jsdom has the same class of bundling issues. Run all of them
  // via native `require()` at runtime instead. html-encoding-sniffer and
  // @exodus/bytes are jsdom's own transitive deps (ESM-only) — external so
  // Node resolves them natively rather than through webpack's CJS interop.
  experimental: {
    serverComponentsExternalPackages: [
      "pdf-parse",
      "pdfjs-dist",
      "jsdom",
      "@mozilla/readability",
      "html-encoding-sniffer",
      "@exodus/bytes",
    ],
  },
};

export default nextConfig;
