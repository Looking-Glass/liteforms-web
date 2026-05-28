import { describe, expect, it } from "vitest";
import { getDefaultProviderConfig, providerConfigSchema } from "./config";

describe("LLM provider config", () => {
  it("defaults LLM generation to the Liteforms hosted proxy", () => {
    expect(getDefaultProviderConfig()).toEqual({
      provider: "liteforms-proxy",
      model: "gpt-4o",
      endpointMode: "native"
    });
  });

  it("normalizes direct browser endpoint defaults for hosted and local providers", () => {
    expect(providerConfigSchema.parse({ provider: "liteforms-proxy", model: "gpt-4o" })).toMatchObject({
      baseUrl: "https://blocks.glass/api/liteforms/chat_proxy_stream",
      endpointMode: "native"
    });
    expect(providerConfigSchema.parse({ provider: "openai", model: "gpt-4.1-mini", credential: "sk" })).toMatchObject({
      baseUrl: "https://api.openai.com/v1"
    });
    expect(providerConfigSchema.parse({ provider: "ollama", model: "llama3.2" })).toMatchObject({
      baseUrl: "http://localhost:11434",
      endpointMode: "native"
    });
    expect(providerConfigSchema.parse({ provider: "openclaw", model: "openclaw/default" })).toMatchObject({
      baseUrl: "http://127.0.0.1:18789/v1",
      endpointMode: "openai-compatible"
    });
    expect(providerConfigSchema.parse({ provider: "openai-codex", model: "gpt-5.5" })).toMatchObject({
      baseUrl: "https://chatgpt.com/backend-api/codex",
      endpointMode: "openai-compatible"
    });
    expect(providerConfigSchema.parse({ provider: "claude-cli", model: "claude-opus-4-7" })).toMatchObject({
      baseUrl: "http://127.0.0.1:1456",
      endpointMode: "openai-compatible"
    });
    expect(providerConfigSchema.parse({ provider: "google-live", model: "gemini-2.5-flash-native-audio-preview-12-2025" })).toMatchObject({
      baseUrl: "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent",
      endpointMode: "native"
    });
  });

  it("migrates legacy subscription connector ids to OpenClaw provider names", () => {
    expect(providerConfigSchema.parse({ provider: "chatgpt-subscription", model: "gpt-5.5" })).toMatchObject({
      provider: "openai-codex",
      baseUrl: "https://chatgpt.com/backend-api/codex"
    });
    expect(providerConfigSchema.parse({ provider: "claude-subscription", model: "claude-opus-4-7" })).toMatchObject({
      provider: "claude-cli",
      baseUrl: "http://127.0.0.1:1456"
    });
  });

  it("allows the built-in Liteforms proxy provider to use the Liteforms API URL", () => {
    expect(
      providerConfigSchema.parse({
        provider: "liteforms-proxy",
        model: "gpt-4o",
        baseUrl: "https://blocks.glass/api/liteforms/chat_proxy_stream"
      })
    ).toMatchObject({ provider: "liteforms-proxy" });
  });

  it("normalizes stale Liteforms proxy model placeholders to the current proxy contract model", () => {
    expect(
      providerConfigSchema.parse({
        provider: "liteforms-proxy",
        model: "liteforms/default"
      })
    ).toMatchObject({
      provider: "liteforms-proxy",
      model: "gpt-4o"
    });
  });

  it("rejects Liteforms API URLs for user-configured LLM traffic", () => {
    expect(() =>
      providerConfigSchema.parse({
        provider: "openai",
        model: "gpt-4.1-mini",
        credential: "sk",
        baseUrl: "/api/liteforms/llm"
      })
    ).toThrow(/Liteforms proxy/i);
  });
});
