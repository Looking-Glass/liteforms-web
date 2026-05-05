import { describe, expect, it } from "vitest";
import { getDefaultProviderConfig, providerConfigSchema } from "./config";

describe("LLM provider config", () => {
  it("defaults browser-local generation to Gemma 4 E2B", () => {
    expect(getDefaultProviderConfig()).toEqual({
      provider: "browser-local-gemma",
      model: "onnx-community/gemma-4-E2B-it-ONNX",
      endpointMode: "native"
    });
  });

  it("normalizes direct browser endpoint defaults for hosted and local providers", () => {
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
  });

  it("rejects Liteforms API URLs for MVP LLM traffic", () => {
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
