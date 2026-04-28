import { describe, expect, it } from "vitest";
import { normalizeAsrConfig, normalizeTtsConfig, speechProviderNeedsCredential } from "./config";

describe("speech provider config", () => {
  it("defaults to local Kokoro TTS and local Distil-Whisper ASR", () => {
    expect(normalizeTtsConfig({ provider: "kokoro" })).toMatchObject({
      provider: "kokoro",
      voice: "af_bella",
      model: "onnx-community/Kokoro-82M-v1.0-ONNX",
      device: "webgpu",
      dtype: "fp32",
      speed: 1
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
