import { describe, expect, it } from "vitest";
import { formatBytes, formatCacheUsage, isModelCacheName, updateEndpointMode } from "./chatPanelUtils";
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
