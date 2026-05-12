import { describe, expect, it } from "vitest";
import {
  getVisibleSttProviderOptions,
  getVisibleTtsProviderOptions,
  TTS_PROVIDER_OPTIONS,
  STT_PROVIDER_OPTIONS,
  SPEECH_CREDENTIAL_PROVIDER_IDS
} from "./providerOptions";

describe("TTS_PROVIDER_OPTIONS", () => {
  it("includes all 16 TTS providers", () => {
    const ids = TTS_PROVIDER_OPTIONS.map((p) => p.id);
    expect(ids).toContain("kokoro");
    expect(ids).toContain("elevenlabs");
    expect(ids).toContain("deepgram");
    expect(ids).toContain("openai");
    expect(ids).toContain("google");
    expect(ids).toContain("xai");
    expect(ids).toContain("deepinfra");
    expect(ids).toContain("openrouter");
    expect(ids).toContain("inworld");
    expect(ids).toContain("minimax");
    expect(ids).toContain("gradium");
    expect(ids).toContain("vydra");
    expect(ids).toContain("xiaomi");
    expect(ids).toContain("azure-speech");
    expect(ids).toContain("microsoft");
    expect(ids).toContain("volcengine");
  });

  it("OpenAI TTS has correct default model and voice with static lists", () => {
    const opt = TTS_PROVIDER_OPTIONS.find((p) => p.id === "openai")!;
    expect(opt.defaultModel).toBe("gpt-4o-mini-tts");
    expect(opt.defaultVoice).toBe("coral");
    expect(opt.models?.map((m) => m.id)).toContain("tts-1-hd");
    expect(opt.voices?.map((v) => v.id)).toContain("alloy");
    expect(opt.voices?.map((v) => v.id)).toContain("nova");
  });

  it("Google TTS has correct models and 30 voices", () => {
    const opt = TTS_PROVIDER_OPTIONS.find((p) => p.id === "google")!;
    expect(opt.defaultModel).toBe("gemini-3.1-flash-tts-preview");
    expect(opt.defaultVoice).toBe("Kore");
    expect(opt.models?.length).toBeGreaterThanOrEqual(3);
    expect(opt.voices?.length).toBeGreaterThanOrEqual(20);
    expect(opt.voices?.map((v) => v.id)).toContain("Zephyr");
    expect(opt.voices?.map((v) => v.id)).toContain("Aoede");
  });

  it("xAI TTS has correct static voice list", () => {
    const opt = TTS_PROVIDER_OPTIONS.find((p) => p.id === "xai")!;
    expect(opt.defaultVoice).toBe("eve");
    expect(opt.voices?.map((v) => v.id)).toEqual(expect.arrayContaining(["eve", "ara", "rex", "sal", "leo", "una"]));
  });

  it("MiniMax TTS has 9 models and 5 voices", () => {
    const opt = TTS_PROVIDER_OPTIONS.find((p) => p.id === "minimax")!;
    expect(opt.models?.length).toBeGreaterThanOrEqual(9);
    expect(opt.voices?.length).toBeGreaterThanOrEqual(5);
  });

  it("Gradium TTS has 7 named voices", () => {
    const opt = TTS_PROVIDER_OPTIONS.find((p) => p.id === "gradium")!;
    const names = opt.voices?.map((v) => v.label) ?? [];
    expect(names).toContain("Emma");
    expect(names).toContain("Arthur");
  });

  it("Volcengine TTS has 10 voices", () => {
    const opt = TTS_PROVIDER_OPTIONS.find((p) => p.id === "volcengine")!;
    expect(opt.voices?.length).toBe(10);
  });

  it("kokoro and microsoft have needsCredential false", () => {
    const kokoro = TTS_PROVIDER_OPTIONS.find((p) => p.id === "kokoro")!;
    const microsoft = TTS_PROVIDER_OPTIONS.find((p) => p.id === "microsoft")!;
    expect(kokoro.needsCredential).toBe(false);
    expect(microsoft.needsCredential).toBe(false);
  });

  it("all cloud TTS providers have needsCredential true", () => {
    const cloudIds = ["elevenlabs", "deepgram", "openai", "google", "xai", "deepinfra", "openrouter",
      "inworld", "minimax", "gradium", "vydra", "xiaomi", "azure-speech", "volcengine"];
    for (const id of cloudIds) {
      const opt = TTS_PROVIDER_OPTIONS.find((p) => p.id === id);
      expect(opt?.needsCredential, `Expected ${id} to need credential`).toBe(true);
    }
  });

  it("exposes only smoke-tested or manually tested TTS providers", () => {
    expect(getVisibleTtsProviderOptions().map((p) => p.id)).toEqual([
      "kokoro",
      "elevenlabs",
      "deepgram",
      "openai",
      "google",
      "openrouter"
    ]);
    expect(TTS_PROVIDER_OPTIONS.find((p) => p.id === "elevenlabs")?.tested).toBe(true);
  });
});

describe("STT_PROVIDER_OPTIONS", () => {
  it("includes STT-only providers and excludes Google realtime voice", () => {
    const ids = STT_PROVIDER_OPTIONS.map((p) => p.id);
    expect(ids).toContain("distil-whisper");
    expect(ids).toContain("deepgram");
    expect(ids).toContain("elevenlabs");
    expect(ids).toContain("openai");
    expect(ids).not.toContain("google");
    expect(ids).not.toContain("google-live");
    expect(ids).toContain("xai");
    expect(ids).toContain("mistral");
  });

  it("OpenAI STT has correct model list", () => {
    const opt = STT_PROVIDER_OPTIONS.find((p) => p.id === "openai")!;
    expect(opt.defaultModel).toBe("gpt-4o-transcribe");
    expect(opt.models?.map((m) => m.id)).toContain("gpt-4o-transcribe");
  });

  it("Mistral STT has correct default model", () => {
    const opt = STT_PROVIDER_OPTIONS.find((p) => p.id === "mistral")!;
    expect(opt.defaultModel).toBe("voxtral-mini-latest");
  });

  it("distil-whisper does not need a credential", () => {
    const opt = STT_PROVIDER_OPTIONS.find((p) => p.id === "distil-whisper")!;
    expect(opt.needsCredential).toBe(false);
  });

  it("exposes only smoke-tested or manually tested STT providers", () => {
    expect(getVisibleSttProviderOptions().map((p) => p.id)).toEqual([
      "distil-whisper",
      "deepgram",
      "elevenlabs",
      "openai"
    ]);
  });
});

describe("SPEECH_CREDENTIAL_PROVIDER_IDS", () => {
  it("includes all cloud speech providers but not local ones", () => {
    expect(SPEECH_CREDENTIAL_PROVIDER_IDS).toContain("elevenlabs");
    expect(SPEECH_CREDENTIAL_PROVIDER_IDS).toContain("deepgram");
    expect(SPEECH_CREDENTIAL_PROVIDER_IDS).toContain("openai");
    expect(SPEECH_CREDENTIAL_PROVIDER_IDS).toContain("google");
    expect(SPEECH_CREDENTIAL_PROVIDER_IDS).toContain("mistral");
    expect(SPEECH_CREDENTIAL_PROVIDER_IDS).not.toContain("kokoro");
    expect(SPEECH_CREDENTIAL_PROVIDER_IDS).not.toContain("distil-whisper");
    expect(SPEECH_CREDENTIAL_PROVIDER_IDS).not.toContain("microsoft");
  });
});
