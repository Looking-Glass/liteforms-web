import { describe, expect, it } from "vitest";
import {
  CREDENTIAL_PROVIDER_IDS,
  getAuditedLlmProviderOptions,
  getVisibleLlmProviderOptions,
  LLM_PROVIDER_OPTIONS,
  LLM_PROVIDER_VERCEL_AUDIT
} from "./providerOptions";

describe("LLM_PROVIDER_OPTIONS", () => {
  it("matches OpenClaw's ChatGPT subscription provider naming", () => {
    const option = LLM_PROVIDER_OPTIONS.find((provider) => provider.id === "openai-codex");
    expect(option).toMatchObject({
      label: "OpenAI Codex",
      defaultModel: "gpt-5.5",
      defaultBaseUrl: "https://chatgpt.com/backend-api/codex"
    });
    expect(option?.models?.map((model) => model.id)).toEqual(expect.arrayContaining([
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro"
    ]));
    expect(CREDENTIAL_PROVIDER_IDS).not.toContain("openai-codex");
  });

  it("matches OpenClaw's Claude CLI connector naming", () => {
    const option = LLM_PROVIDER_OPTIONS.find((provider) => provider.id === "claude-cli");
    expect(option).toMatchObject({
      label: "Claude CLI",
      defaultModel: "claude-opus-4-7",
      defaultBaseUrl: "http://127.0.0.1:1456"
    });
    expect(option?.models?.map((model) => model.id)).toEqual(expect.arrayContaining([
      "claude-opus-4-7",
      "claude-sonnet-4-6",
      "claude-opus-4-6",
      "claude-opus-4-5",
      "claude-sonnet-4-5"
    ]));
    expect(CREDENTIAL_PROVIDER_IDS).not.toContain("claude-cli");
  });

  it("registers Google Live as an end-to-end LLM provider", () => {
    const option = LLM_PROVIDER_OPTIONS.find((provider) => provider.id === "google-live");
    expect(option).toMatchObject({
      label: "Google Live (includes TTS and STT)",
      defaultModel: "gemini-2.5-flash-native-audio-preview-12-2025",
      defaultVoice: "Kore"
    });
    expect(option?.defaultBaseUrl).toContain("generativelanguage.googleapis.com/ws/");
    expect(option?.models?.map((model) => model.id)).toEqual(expect.arrayContaining([
      "gemini-2.5-flash-native-audio-preview-12-2025",
      "gemini-live-2.5-flash-preview",
      "gemini-2.0-flash-live-001"
    ]));
    expect(option?.voices?.length).toBe(30);
    expect(option?.voices?.map((voice) => voice.id)).toEqual(expect.arrayContaining(["Kore", "Aoede", "Zephyr"]));
    expect(CREDENTIAL_PROVIDER_IDS).toContain("google-live");
  });

  it("audits every provider for Vercel deployment support", () => {
    expect(Object.keys(LLM_PROVIDER_VERCEL_AUDIT).sort()).toEqual(
      LLM_PROVIDER_OPTIONS.map((provider) => provider.id).sort()
    );
    expect(getAuditedLlmProviderOptions().every((provider) => provider.vercelSupport)).toBe(true);
  });

  it("flags providers that depend on local auth, CLIs, or localhost services as Vercel local-only", () => {
    expect(LLM_PROVIDER_VERCEL_AUDIT["openai-codex"].support).toBe("local-only");
    expect(LLM_PROVIDER_VERCEL_AUDIT["claude-cli"].support).toBe("local-only");
    expect(LLM_PROVIDER_VERCEL_AUDIT.ollama.support).toBe("local-only");
    expect(LLM_PROVIDER_VERCEL_AUDIT.lmstudio.support).toBe("local-only");
    expect(LLM_PROVIDER_VERCEL_AUDIT.openclaw.support).toBe("local-only");
  });

  it("keeps browser-local and hosted API providers visible in Vercel deployments", () => {
    const visibleIds = getVisibleLlmProviderOptions({ isVercelDeployment: true }).map((provider) => provider.id);
    expect(visibleIds).toEqual(expect.arrayContaining([
      "browser-local-gemma",
      "browser-local-qwen",
      "anthropic",
      "openai",
      "google-live"
    ]));
  });

  it("hides Vercel local-only providers from Vercel deployments", () => {
    const visibleIds = getVisibleLlmProviderOptions({ isVercelDeployment: true }).map((provider) => provider.id);
    expect(visibleIds).not.toEqual(expect.arrayContaining([
      "openai-codex",
      "claude-cli",
      "ollama",
      "lmstudio",
      "openclaw"
    ]));
  });

  it("keeps all providers visible when running outside Vercel", () => {
    expect(getVisibleLlmProviderOptions({ isVercelDeployment: false }).map((provider) => provider.id)).toEqual(
      LLM_PROVIDER_OPTIONS.map((provider) => provider.id)
    );
  });
});
