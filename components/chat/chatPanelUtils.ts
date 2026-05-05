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
  return providerId === "ollama" ||
    providerId === "browser-local-gemma" ||
    providerId === "browser-local-qwen"
    ? "native"
    : "openai-compatible";
}

export function isModelCacheName(name: string): boolean {
  return name.includes("transformers") || name.includes("liteforms");
}

/**
 * Hugging Face Transformers progress_callback often uses a 0–1 fraction; map to 0–100 for UI.
 * Values already above 1 are treated as percent (e.g. 50 → 50%).
 */
export function normalizeHuggingfaceProgress(progress: number | undefined): number | undefined {
  if (progress === undefined || Number.isNaN(progress)) return undefined;
  if (progress > 0 && progress <= 1) {
    return Math.min(100, progress * 100);
  }
  return progress;
}

/**
 * Returns the progress value to store after a worker progress update.
 *
 * Keep each local model's loading progress monotonic. Transformers.js may emit
 * progress for individual files or newly discovered totals, which can otherwise
 * make the same model appear to move backward while it is still loading.
 */
export function clampModelProgress(
  currentProgress: number,
  currentStatus: string,
  patchProgress: number | undefined,
  patchStatus: string | undefined
): number {
  if (patchProgress === undefined) return currentProgress;

  const nextProgress = Math.max(0, Math.min(100, patchProgress));
  if (patchStatus === "error") return nextProgress;
  if (currentStatus === "loading" && (patchStatus === undefined || patchStatus === "loading")) {
    return Math.max(currentProgress, nextProgress);
  }
  return nextProgress;
}

/**
 * While a worker preload is in flight, Transformers/cache may report 100% before
 * weights/init actually finish. Cap UI at 99% until the preload promise resolves
 * and the caller sets progress to 100 with ready status.
 */
export function capPreloadUiProgress(progress: number | undefined): number | undefined {
  if (progress === undefined) return undefined;
  return Math.min(99, progress);
}
