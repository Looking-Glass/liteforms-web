import { describe, expect, it } from "vitest";
import {
  capPreloadUiProgress,
  clampModelProgress,
  formatBytes,
  formatCacheUsage,
  isModelCacheName,
  normalizeHuggingfaceProgress,
  updateEndpointMode
} from "./chatPanelUtils";
import type { CacheUsage } from "./chatPanelUtils";

describe("formatBytes", () => {
  it("formats raw bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1023)).toBe("1023.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1024 * 1024 * 512)).toBe("512.0 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB");
    expect(formatBytes(1024 * 1024 * 1024 * 2.5)).toBe("2.50 GB");
  });
});

describe("formatCacheUsage", () => {
  it("passes through the status string when not ready", () => {
    const notReady: CacheUsage = { status: "Checking cache", bytes: 0, fileCount: 0, unknownCount: 0 };
    expect(formatCacheUsage(notReady)).toBe("Checking cache");

    const empty: CacheUsage = { status: "Empty", bytes: 0, fileCount: 0, unknownCount: 0 };
    expect(formatCacheUsage(empty)).toBe("Empty");
  });

  it("formats ready cache with byte size and file count", () => {
    const ready: CacheUsage = { status: "Ready", bytes: 1024 * 1024 * 256, fileCount: 12, unknownCount: 0 };
    expect(formatCacheUsage(ready)).toBe("256.0 MB / 12 files");
  });

  it("appends unknown file count when some sizes are missing", () => {
    const withUnknown: CacheUsage = { status: "Ready", bytes: 1024 * 50, fileCount: 5, unknownCount: 2 };
    expect(formatCacheUsage(withUnknown)).toBe("50.0 KB / 5 files + 2 unknown");
  });
});

describe("updateEndpointMode", () => {
  it("returns native for browser-local and native-protocol providers", () => {
    expect(updateEndpointMode("browser-local-gemma")).toBe("native");
    expect(updateEndpointMode("ollama")).toBe("native");
    expect(updateEndpointMode("openclaw")).toBe("native");
  });

  it("returns openai-compatible for all hosted API providers", () => {
    expect(updateEndpointMode("openai")).toBe("openai-compatible");
    expect(updateEndpointMode("anthropic")).toBe("openai-compatible");
    expect(updateEndpointMode("openrouter")).toBe("openai-compatible");
    expect(updateEndpointMode("chatgpt-subscription")).toBe("openai-compatible");
    expect(updateEndpointMode("claude-subscription")).toBe("openai-compatible");
    expect(updateEndpointMode("lmstudio")).toBe("openai-compatible");
  });
});

describe("clampModelProgress", () => {
  it("allows any value when model is not currently loading (idle start)", () => {
    expect(clampModelProgress(0, "idle", 60, "loading")).toBe(60);
    expect(clampModelProgress(0, "idle", 0, "loading")).toBe(0);
  });

  it("never lets progress go backward while a model is loading", () => {
    // 60% reached, then a 0% cache-miss probe arrives: stays at 60.
    expect(clampModelProgress(60, "loading", 0, "loading")).toBe(60);
    // Partial regression also blocked when watermark never reached phantom heights
    expect(clampModelProgress(75, "loading", 40, "loading")).toBe(75);
  });

  it("keeps the high-water mark after Transformers revises aggregate progress downward", () => {
    expect(clampModelProgress(99, "loading", 50, "loading")).toBe(99);
    expect(clampModelProgress(95, "loading", 88, "loading")).toBe(95);
  });

  it("allows progress to increase while loading", () => {
    expect(clampModelProgress(40, "loading", 80, "loading")).toBe(80);
    expect(clampModelProgress(60, "loading", 100, "ready")).toBe(100);
  });

  it("allows progress to reset to 0 on an error", () => {
    expect(clampModelProgress(60, "loading", 0, "error")).toBe(0);
  });

  it("uses current progress when patch has no progress field", () => {
    expect(clampModelProgress(55, "loading", undefined, "loading")).toBe(55);
    expect(clampModelProgress(30, "idle", undefined, "loading")).toBe(30);
  });
});

describe("normalizeHuggingfaceProgress", () => {
  it("passes through undefined", () => {
    expect(normalizeHuggingfaceProgress(undefined)).toBeUndefined();
  });

  it("maps 0–1 fractions to percent", () => {
    expect(normalizeHuggingfaceProgress(0)).toBe(0);
    expect(normalizeHuggingfaceProgress(0.5)).toBe(50);
    expect(normalizeHuggingfaceProgress(1)).toBe(100);
    expect(normalizeHuggingfaceProgress(0.08428308271753886)).toBeCloseTo(8.428308271753886, 10);
  });

  it("leaves values above 1 unchanged (already percent)", () => {
    expect(normalizeHuggingfaceProgress(50)).toBe(50);
    expect(normalizeHuggingfaceProgress(99)).toBe(99);
  });
});

describe("capPreloadUiProgress", () => {
  it("passes through undefined", () => {
    expect(capPreloadUiProgress(undefined)).toBeUndefined();
  });

  it("caps values at 99", () => {
    expect(capPreloadUiProgress(50)).toBe(50);
    expect(capPreloadUiProgress(99)).toBe(99);
    expect(capPreloadUiProgress(99.5)).toBe(99);
    expect(capPreloadUiProgress(100)).toBe(99);
  });
});

describe("isModelCacheName", () => {
  it("matches transformers cache bucket names", () => {
    expect(isModelCacheName("transformers-cache")).toBe(true);
    expect(isModelCacheName("@huggingface/transformers/models")).toBe(true);
  });

  it("matches liteforms cache bucket names", () => {
    expect(isModelCacheName("liteforms-models")).toBe(true);
    expect(isModelCacheName("liteforms")).toBe(true);
  });

  it("ignores unrelated cache bucket names", () => {
    expect(isModelCacheName("next-data")).toBe(false);
    expect(isModelCacheName("workbox-precache-v2")).toBe(false);
    expect(isModelCacheName("")).toBe(false);
  });
});
