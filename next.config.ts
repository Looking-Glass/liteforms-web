import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_LITEFORMS_VERCEL_DEPLOYMENT: process.env.VERCEL === "1" ? "1" : "0"
  },
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
