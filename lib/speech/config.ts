import type { AsrConfig, AsrProviderId, TtsConfig, TtsProviderId } from "./types";

export function normalizeTtsConfig(config: TtsConfig): Required<TtsConfig> {
  if (config.provider === "kokoro") {
    return {
      provider: "kokoro",
      model: config.model ?? "onnx-community/Kokoro-82M-v1.0-ONNX",
      voice: config.voice ?? "af_bella",
      dtype: config.dtype ?? "fp32",
      device: config.device ?? "webgpu",
      speed: config.speed ?? 1
    } as Required<TtsConfig>;
  }

  if (config.provider === "elevenlabs") {
    return {
      provider: "elevenlabs",
      credential: config.credential ?? "",
      baseUrl: config.baseUrl ?? "https://api.elevenlabs.io/v1",
      voiceId: config.voiceId ?? "Rachel",
      modelId: config.modelId ?? "eleven_multilingual_v2",
      stability: config.stability ?? 0.5,
      similarityBoost: config.similarityBoost ?? 0.75,
      style: config.style ?? 0,
      useSpeakerBoost: config.useSpeakerBoost ?? true,
      speed: config.speed ?? 1
    } as Required<TtsConfig>;
  }

  return {
    provider: "deepgram",
    credential: config.credential ?? "",
    baseUrl: config.baseUrl ?? "https://api.deepgram.com/v1",
    voice: config.voice ?? config.model ?? "aura-asteria-en",
    model: config.model ?? config.voice ?? "aura-asteria-en"
  } as Required<TtsConfig>;
}

export function normalizeAsrConfig(config: AsrConfig): Required<AsrConfig> {
  if (config.provider === "distil-whisper") {
    return {
      provider: "distil-whisper",
      model: config.model ?? "onnx-community/distil-small.en",
      device: config.device ?? "webgpu",
      dtype: config.dtype ?? "q4",
      language: config.language ?? "en",
      autoSend: config.autoSend ?? false
    } as Required<AsrConfig>;
  }

  if (config.provider === "deepgram") {
    return {
      provider: "deepgram",
      credential: config.credential ?? "",
      baseUrl: config.baseUrl ?? "https://api.deepgram.com/v1",
      model: config.model ?? "nova-3",
      language: config.language ?? "en",
      autoSend: config.autoSend ?? false
    } as Required<AsrConfig>;
  }

  return {
    provider: "elevenlabs",
    credential: config.credential ?? "",
    baseUrl: config.baseUrl ?? "https://api.elevenlabs.io/v1",
    model: config.model ?? "scribe_v1",
    language: config.language ?? "en",
    autoSend: config.autoSend ?? false
  } as Required<AsrConfig>;
}

export function speechProviderNeedsCredential(provider: TtsProviderId | AsrProviderId) {
  return provider === "elevenlabs" || provider === "deepgram";
}

export function getTtsProviderLabel(provider: TtsProviderId) {
  return {
    kokoro: "Kokoro local",
    elevenlabs: "ElevenLabs",
    deepgram: "Deepgram"
  }[provider];
}

export function getAsrProviderLabel(provider: AsrProviderId) {
  return {
    "distil-whisper": "Distil-Whisper local",
    elevenlabs: "ElevenLabs",
    deepgram: "Deepgram"
  }[provider];
}
