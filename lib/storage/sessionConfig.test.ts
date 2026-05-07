import { beforeEach, describe, expect, it } from "vitest";
import { clearSessionConfig, loadSessionConfig, saveSessionConfig, SESSION_CONFIG_KEY } from "./sessionConfig";

// Lightweight localStorage stub
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = value;
  },
  removeItem: (key: string) => {
    delete store[key];
  }
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
});

describe("loadSessionConfig", () => {
  it("returns null when nothing is stored", () => {
    expect(loadSessionConfig()).toBeNull();
  });

  it("returns null for corrupted JSON", () => {
    store[SESSION_CONFIG_KEY] = "not-json{{{";
    expect(loadSessionConfig()).toBeNull();
  });

  it("returns null when version field is wrong", () => {
    store[SESSION_CONFIG_KEY] = JSON.stringify({
      version: 2,
      llm: { provider: "openai", model: "gpt-4o" },
      tts: { provider: "openai" },
      asr: { provider: "openai" }
    });
    expect(loadSessionConfig()).toBeNull();
  });

  it("returns null when llm.provider is missing", () => {
    store[SESSION_CONFIG_KEY] = JSON.stringify({
      version: 1,
      llm: { model: "gpt-4o" },
      tts: { provider: "openai" },
      asr: { provider: "openai" }
    });
    expect(loadSessionConfig()).toBeNull();
  });
});

describe("saveSessionConfig + loadSessionConfig round-trip", () => {
  it("persists and restores an OpenAI cloud config with credential", () => {
    saveSessionConfig({
      llm: { provider: "openai", model: "gpt-4o", credential: "sk-test-key" },
      tts: { provider: "openai", credential: "sk-test-key" },
      asr: { provider: "openai", model: "whisper-1" }
    });

    const loaded = loadSessionConfig();

    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(1);
    expect(loaded!.llm.provider).toBe("openai");
    expect(loaded!.llm.model).toBe("gpt-4o");
    expect(loaded!.llm.credential).toBe("sk-test-key");
    expect(loaded!.tts.provider).toBe("openai");
    expect(loaded!.asr.provider).toBe("openai");
  });

  it("persists and restores a builtin local-model config", () => {
    saveSessionConfig({
      llm: { provider: "browser-local-gemma", model: "onnx-community/gemma-4-E2B-it-ONNX" },
      tts: { provider: "kokoro" },
      asr: { provider: "distil-whisper" }
    });

    const loaded = loadSessionConfig();

    expect(loaded!.llm.provider).toBe("browser-local-gemma");
    expect(loaded!.tts.provider).toBe("kokoro");
    expect(loaded!.asr.provider).toBe("distil-whisper");
  });

  it("persists and restores optional realtime voice config", () => {
    saveSessionConfig({
      llm: { provider: "google", model: "gemini-3.1-pro-preview" },
      tts: { provider: "google", credential: "google-key" },
      asr: { provider: "distil-whisper" },
      realtimeVoice: { provider: "google-live", credential: "google-key", model: "gemini-live", voice: "Kore" }
    });

    const loaded = loadSessionConfig();

    expect(loaded!.realtimeVoice).toMatchObject({
      provider: "google-live",
      credential: "google-key",
      model: "gemini-live"
    });
  });

  it("overwrites an existing entry on repeated saves", () => {
    saveSessionConfig({
      llm: { provider: "openai", model: "gpt-4o" },
      tts: { provider: "kokoro" },
      asr: { provider: "distil-whisper" }
    });
    saveSessionConfig({
      llm: { provider: "anthropic", model: "claude-opus-4-7", credential: "sk-ant" },
      tts: { provider: "elevenlabs", credential: "el-key" },
      asr: { provider: "deepgram", model: "nova-2" }
    });

    const loaded = loadSessionConfig();

    expect(loaded!.llm.provider).toBe("anthropic");
    expect(loaded!.llm.credential).toBe("sk-ant");
  });

  it("silently ignores localStorage failures without throwing", () => {
    const failing = {
      getItem: () => { throw new Error("storage unavailable"); },
      setItem: () => { throw new Error("storage unavailable"); },
      removeItem: () => { throw new Error("storage unavailable"); }
    };
    Object.defineProperty(globalThis, "localStorage", { value: failing, writable: true });

    expect(() => saveSessionConfig({ llm: { provider: "openai", model: "gpt-4o" }, tts: { provider: "kokoro" }, asr: { provider: "distil-whisper" } })).not.toThrow();
    expect(loadSessionConfig()).toBeNull();
    expect(() => clearSessionConfig()).not.toThrow();

    Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });
  });
});

describe("clearSessionConfig", () => {
  it("removes the stored config so loadSessionConfig returns null", () => {
    saveSessionConfig({
      llm: { provider: "openai", model: "gpt-4o" },
      tts: { provider: "kokoro" },
      asr: { provider: "distil-whisper" }
    });

    clearSessionConfig();

    expect(loadSessionConfig()).toBeNull();
  });

  it("does not throw when nothing was stored", () => {
    expect(() => clearSessionConfig()).not.toThrow();
  });
});
