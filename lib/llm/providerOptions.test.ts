import { describe, expect, it } from "vitest";
import { CREDENTIAL_PROVIDER_IDS, LLM_PROVIDER_OPTIONS } from "./providerOptions";

describe("LLM_PROVIDER_OPTIONS", () => {
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
});
