import { describe, expect, it } from "vitest";
import {
  buildGoogleLiveSetupMessage,
  buildGoogleLiveWebSocketUrl,
  mapGoogleLiveEvent,
  normalizeGoogleLiveVoiceConfig,
  validateGoogleLiveWebSocketUrl
} from "./googleLive";
import { STT_PROVIDER_OPTIONS } from "./providerOptions";

describe("Google Live realtime voice parity", () => {
  it("normalizes Google Live as a realtime voice capability", () => {
    expect(normalizeGoogleLiveVoiceConfig({ provider: "google-live", credential: "token" })).toMatchObject({
      provider: "google-live",
      model: "gemini-2.5-flash-native-audio-preview-12-2025",
      voice: "Kore",
      language: "en-US"
    });
    expect(buildGoogleLiveSetupMessage({ provider: "google-live", model: "gemini-live", voice: "Aoede" })).toMatchObject({
      setup: {
        model: "models/gemini-live",
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Aoede" }
            }
          }
        }
      }
    });
  });

  it("omits explicit language code for native audio models", () => {
    const setup = buildGoogleLiveSetupMessage({
      provider: "google-live",
      model: "gemini-2.5-flash-native-audio-preview-12-2025",
      voice: "Kore",
      language: "en-US"
    });
    expect(setup.setup.generationConfig.speechConfig).not.toHaveProperty("languageCode");
  });

  it("allows only trusted Google Live WebSocket endpoints and appends the browser token", () => {
    expect(
      buildGoogleLiveWebSocketUrl({
        provider: "google-live",
        ephemeralToken: "auth_tokens/browser-session",
        websocketUrl:
          "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?ignored=1"
      })
    ).toBe(
      "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=auth_tokens%2Fbrowser-session"
    );
    expect(() =>
      validateGoogleLiveWebSocketUrl("wss://attacker.test/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained")
    ).toThrow("Untrusted Google Live WebSocket host");
    expect(() => validateGoogleLiveWebSocketUrl("https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained")).toThrow(
      "Google Live WebSocket URL must use wss://"
    );
  });

  it("uses key auth for AI Studio API keys and access_token auth for browser session tokens", () => {
    expect(buildGoogleLiveWebSocketUrl({ provider: "google-live", credential: "AIza-test" })).toContain("?key=AIza-test");
    expect(buildGoogleLiveWebSocketUrl({ provider: "google-live", credential: "auth_tokens/session" })).toContain(
      "?access_token=auth_tokens%2Fsession"
    );
  });

  it("maps user transcript, assistant transcript, and audio events separately", () => {
    expect(
      mapGoogleLiveEvent({
        serverContent: {
          inputTranscription: { text: "hello" },
          outputTranscription: { text: "hi" },
          modelTurn: { parts: [{ inlineData: { data: "AAAA", mimeType: "audio/pcm" } }] },
          turnComplete: true
        }
      })
    ).toEqual([
      { type: "user_transcript", text: "hello", final: true },
      { type: "assistant_transcript", text: "hi", final: true },
      { type: "audio", audio: "AAAA", mimeType: "audio/pcm" },
      { type: "closed" }
    ]);
  });

  it("passes character persona instructions into the setup message", () => {
    const instructions = "You are Mira, a Liteforms avatar companion.\nPronouns: SHE.\nPersonality and behavior: Warm and encouraging.";
    const setup = buildGoogleLiveSetupMessage({ provider: "google-live", instructions });
    expect(setup.setup.systemInstruction.parts[0].text).toBe(instructions);
  });

  it("falls back to the default instructions when none are provided", () => {
    const setup = buildGoogleLiveSetupMessage({ provider: "google-live" });
    expect(setup.setup.systemInstruction.parts[0].text).toBe("Keep spoken replies brief and natural.");
  });

  it("does not register Google Live as an STT-only streaming provider", () => {
    expect(STT_PROVIDER_OPTIONS.map((option) => option.id)).not.toContain("google");
    expect(STT_PROVIDER_OPTIONS.map((option) => option.id)).not.toContain("google-live");
  });
});
