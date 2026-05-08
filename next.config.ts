import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Required for WebXR / SharedArrayBuffer used by the Looking Glass polyfill
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@huggingface/transformers": path.resolve(process.cwd(), "node_modules/@huggingface/transformers/dist/transformers.web.js")
    };

    return config;
  }
};

export default nextConfig;
