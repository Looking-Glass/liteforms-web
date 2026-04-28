import type { LlmProviderId } from "@/lib/llm";

export type CacheUsage = {
  status: string;
  bytes: number;
  fileCount: number;
  unknownCount: number;
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatCacheUsage(usage: CacheUsage): string {
  if (usage.status !== "Ready") return usage.status;
  const suffix = usage.unknownCount > 0 ? ` + ${usage.unknownCount} unknown` : "";
  return `${formatBytes(usage.bytes)} / ${usage.fileCount} files${suffix}`;
}

export function updateEndpointMode(providerId: LlmProviderId): "native" | "openai-compatible" {
  return providerId === "ollama" || providerId === "browser-local-gemma" || providerId === "openclaw"
    ? "native"
    : "openai-compatible";
}

export function isModelCacheName(name: string): boolean {
  return name.includes("transformers") || name.includes("liteforms");
}
