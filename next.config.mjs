/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfjs-dist (via pdf-parse) breaks when webpack bundles it into the RSC
  // server build (`Object.defineProperty called on non-object` at module
  // init). jsdom has the same class of bundling issues. Run all of them
  // via native `require()` at runtime instead.
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "pdfjs-dist", "jsdom", "@mozilla/readability"],
  },
};

export default nextConfig;
