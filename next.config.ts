import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@huggingface/transformers": path.resolve(process.cwd(), "node_modules/@huggingface/transformers/dist/transformers.web.js")
    };

    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /@auth0\/nextjs-auth0\/dist\/utils\/dpopUtils\.js/,
        message: /Critical dependency: the request of a dependency is an expression/
      }
    ];

    return config;
  }
};

export default nextConfig;
