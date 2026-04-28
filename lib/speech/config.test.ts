import { describe, expect, it } from "vitest";
import { normalizeAsrConfig, normalizeTtsConfig, speechProviderNeedsCredential } from "./config";
import type { TtsProviderId, AsrProviderId } from "./types";

describe("speech provider config", () => {
  it("defaults to local Kokoro TTS and local Distil-Whisper ASR", () => {
    expect(normalizeTtsConfig({ provider: "kokoro" })).toMatchObject({
      provider: "kokoro",
      voice: "af_bella",
      model: "onnx-community/Kokoro-82M-v1.0-ONNX",
      device: "webgpu",
      dtype: "fp32",
      speed: 1.2
    });

    expect(normalizeAsrConfig({ provider: "distil-whisper" })).toMatchObject({
      provider: "distil-whisper",
      model: "onnx-community/distil-small.en",
      device: "webgpu",
      dtype: "q4",
      language: "en",
      autoSend: false
    });
  });

  it("normalizes hosted speech provider endpoints and credential requirements", () => {
    expect(normalizeTtsConfig({ provider: "elevenlabs", credential: "el", voiceId: "voice" })).toMatchObject({
      provider: "elevenlabs",
      baseUrl: "https://api.elevenlabs.io/v1",
      modelId: "eleven_multilingual_v2"
    });
    expect(normalizeTtsConfig({ provider: "deepgram", credential: "dg", voice: "aura-asteria-en" })).toMatchObject({
      provider: "deepgram",
      baseUrl: "https://api.deepgram.com/v1",
      model: "aura-asteria-en"
    });
    expect(normalizeAsrConfig({ provider: "deepgram", credential: "dg" })).toMatchObject({
      provider: "deepgram",
      baseUrl: "https://api.deepgram.com/v1",
      model: "nova-3"
    });
    expect(normalizeAsrConfig({ provider: "elevenlabs", credential: "el" })).toMatchObject({
      provider: "elevenlabs",
      baseUrl: "https://api.elevenlabs.io/v1",
      model: "scribe_v1"
    });

    expect(speechProviderNeedsCredential("kokoro")).toBe(false);
    expect(speechProviderNeedsCredential("distil-whisper")).toBe(false);
    expect(speechProviderNeedsCredential("elevenlabs")).toBe(true);
    expect(speechProviderNeedsCredential("deepgram")).toBe(true);
  });
});

// ── New TTS provider normalization ─────────────────────────────────────────────

describe("new TTS provider config normalization", () => {
  const cases: Array<[TtsProviderId, string, string, string]> = [
    ["openai", "https://api.openai.com/v1", "gpt-4o-mini-tts", "coral"],
    ["google", "https://generativelanguage.googleapis.com", "gemini-3.1-flash-tts-preview", "Kore"],
    ["xai", "https://api.x.ai/v1", "", "eve"],
    ["deepinfra", "https://api.deepinfra.com/v1/openai", "hexgrad/Kokoro-82M", "af_alloy"],
    ["openrouter", "https://openrouter.ai/api/v1", "hexgrad/kokoro-82m", "af_alloy"],
    ["inworld", "https://api.inworld.ai", "inworld-tts-1.5-max", "Sarah"],
    ["minimax", "https://api.minimax.io", "speech-2.8-hd", "English_expressive_narrator"],
    ["gradium", "https://api.gradium.ai", "", "YTpq7expH9539ERJ"],
    ["vydra", "https://www.vydra.ai/api/v1", "elevenlabs/tts", "21m00Tcm4TlvDq8ikWAM"],
    ["xiaomi", "https://api.xiaomimimo.com/v1", "mimo-v2.5-tts", "mimo_default"],
    ["azure-speech", "https://eastus.tts.speech.microsoft.com", "", "en-US-JennyNeural"],
    ["microsoft", "http://localhost:5000", "", "en-US-MichelleNeural"],
    ["volcengine", "https://voice.ap-southeast-1.bytepluses.com", "", "en_female_anna_mars_bigtts"]
  ];

  it.each(cases)("normalizes %s config with correct defaults", (provider, expectedBaseUrl, expectedModel, expectedVoice) => {
    const result = normalizeTtsConfig({ provider, credential: "key" } as Parameters<typeof normalizeTtsConfig>[0]);
    expect(result.provider).toBe(provider);
    expect((result as Record<string, unknown>).baseUrl).toBe(expectedBaseUrl);
    if (expectedModel) expect((result as Record<string, unknown>).model).toBe(expectedModel);
    if (expectedVoice) expect((result as Record<string, unknown>).voice).toBe(expectedVoice);
  });

  it("all new cloud TTS providers require a credential", () => {
    const cloudProviders: TtsProviderId[] = [
      "openai", "google", "xai", "deepinfra", "openrouter",
      "inworld", "minimax", "gradium", "vydra", "xiaomi",
      "azure-speech", "volcengine"
    ];
    for (const id of cloudProviders) {
      expect(speechProviderNeedsCredential(id)).toBe(true);
    }
  });

  it("microsoft Edge TTS does not require a credential", () => {
    expect(speechProviderNeedsCredential("microsoft")).toBe(false);
  });
});

// ── New STT provider normalization ─────────────────────────────────────────────

describe("new STT provider config normalization", () => {
  it("normalizes OpenAI STT config with default base URL and model", () => {
    expect(normalizeAsrConfig({ provider: "openai", credential: "sk-key" })).toMatchObject({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-transcribe"
    });
  });

  it("normalizes xAI STT config with default base URL", () => {
    expect(normalizeAsrConfig({ provider: "xai", credential: "xai-key" })).toMatchObject({
      provider: "xai",
      baseUrl: "https://api.x.ai/v1"
    });
  });

  it("normalizes Mistral STT config with default base URL and model", () => {
    expect(normalizeAsrConfig({ provider: "mistral", credential: "mist-key" })).toMatchObject({
      provider: "mistral",
      baseUrl: "https://api.mistral.ai/v1",
      model: "voxtral-mini-transcribe-realtime-2602"
    });
  });

  it("all new STT providers require a credential", () => {
    const newProviders: AsrProviderId[] = ["openai", "xai", "mistral"];
    for (const id of newProviders) {
      expect(speechProviderNeedsCredential(id)).toBe(true);
    }
  });
});
