import type { AsrConfig, AsrProviderId, TtsConfig, TtsProviderId } from "./types";

export function normalizeTtsConfig(config: TtsConfig): Required<TtsConfig> {
  if (config.provider === "kokoro") {
    return {
      provider: "kokoro",
      model: config.model ?? "onnx-community/Kokoro-82M-v1.0-ONNX",
      voice: config.voice ?? "af_bella",
      dtype: config.dtype ?? "fp32",
      device: config.device ?? "webgpu",
      speed: config.speed ?? 1.2
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
      speed: config.speed ?? 1,
      seed: config.seed,
      languageCode: config.languageCode,
      applyTextNormalization: config.applyTextNormalization
    } as Required<TtsConfig>;
  }

  if (config.provider === "deepgram") {
    return {
      provider: "deepgram",
      credential: config.credential ?? "",
      baseUrl: config.baseUrl ?? "https://api.deepgram.com/v1",
      voice: config.voice ?? config.model ?? "aura-asteria-en",
      model: config.model ?? config.voice ?? "aura-asteria-en"
    } as Required<TtsConfig>;
  }

  if (config.provider === "openai") {
    return {
      provider: "openai",
      credential: config.credential ?? "",
      baseUrl: config.baseUrl ?? "https://api.openai.com/v1",
      model: config.model ?? "gpt-4o-mini-tts",
      voice: config.voice ?? "coral",
      speed: config.speed,
      instructions: config.instructions,
      responseFormat: config.responseFormat ?? "pcm"
    } as Required<TtsConfig>;
  }

  if (config.provider === "google") {
    return {
      provider: "google",
      credential: config.credential ?? "",
      baseUrl: config.baseUrl ?? "https://generativelanguage.googleapis.com",
      model: config.model ?? "gemini-3.1-flash-tts-preview",
      voice: config.voice ?? "Kore"
    } as Required<TtsConfig>;
  }

  if (config.provider === "xai") {
    return {
      provider: "xai",
      credential: config.credential ?? "",
      baseUrl: config.baseUrl ?? "https://api.x.ai/v1",
      model: config.model ?? "",
      voice: config.voice ?? "eve"
    } as Required<TtsConfig>;
  }

  if (config.provider === "deepinfra") {
    return {
      provider: "deepinfra",
      credential: config.credential ?? "",
      baseUrl: config.baseUrl ?? "https://api.deepinfra.com/v1/openai",
      model: config.model ?? "hexgrad/Kokoro-82M",
      voice: config.voice ?? "af_alloy"
    } as Required<TtsConfig>;
  }

  if (config.provider === "openrouter") {
    return {
      provider: "openrouter",
      credential: config.credential ?? "",
      baseUrl: config.baseUrl ?? "https://openrouter.ai/api/v1",
      model: config.model ?? "hexgrad/kokoro-82m",
      voice: config.voice ?? "af_alloy"
    } as Required<TtsConfig>;
  }

  if (config.provider === "inworld") {
    return {
      provider: "inworld",
      credential: config.credential ?? "",
      baseUrl: config.baseUrl ?? "https://api.inworld.ai",
      model: config.model ?? "inworld-tts-1.5-max",
      voice: config.voice ?? "Sarah"
    } as Required<TtsConfig>;
  }

  if (config.provider === "minimax") {
    return {
      provider: "minimax",
      credential: config.credential ?? "",
      baseUrl: config.baseUrl ?? "https://api.minimax.io",
      model: config.model ?? "speech-2.8-hd",
      voice: config.voice ?? "English_expressive_narrator",
      speed: config.speed ?? 1.0,
      vol: config.vol ?? 1.0,
      pitch: config.pitch ?? 0
    } as Required<TtsConfig>;
  }

  if (config.provider === "gradium") {
    return {
      provider: "gradium",
      credential: config.credential ?? "",
      baseUrl: config.baseUrl ?? "https://api.gradium.ai",
      model: config.model ?? "",
      voice: config.voice ?? "YTpq7expH9539ERJ"
    } as Required<TtsConfig>;
  }

  if (config.provider === "vydra") {
    return {
      provider: "vydra",
      credential: config.credential ?? "",
      baseUrl: config.baseUrl ?? "https://www.vydra.ai/api/v1",
      model: config.model ?? "elevenlabs/tts",
      voice: config.voice ?? "21m00Tcm4TlvDq8ikWAM"
    } as Required<TtsConfig>;
  }

  if (config.provider === "xiaomi") {
    return {
      provider: "xiaomi",
      credential: config.credential ?? "",
      baseUrl: config.baseUrl ?? "https://api.xiaomimimo.com/v1",
      model: config.model ?? "mimo-v2.5-tts",
      voice: config.voice ?? "mimo_default"
    } as Required<TtsConfig>;
  }

  if (config.provider === "azure-speech") {
    return {
      provider: "azure-speech",
      credential: config.credential ?? "",
      baseUrl: config.baseUrl ?? "https://eastus.tts.speech.microsoft.com",
      model: config.model ?? "",
      voice: config.voice ?? "en-US-JennyNeural"
    } as Required<TtsConfig>;
  }

  if (config.provider === "microsoft") {
    return {
      provider: "microsoft",
      credential: config.credential ?? "",
      baseUrl: config.baseUrl ?? "http://localhost:5000",
      model: config.model ?? "",
      voice: config.voice ?? "en-US-MichelleNeural"
    } as Required<TtsConfig>;
  }

  // volcengine (default / fallthrough)
  return {
    provider: "volcengine",
    credential: (config as { credential?: string }).credential ?? "",
    baseUrl: (config as { baseUrl?: string }).baseUrl ?? "https://voice.ap-southeast-1.bytepluses.com",
    model: (config as { model?: string }).model ?? "",
    voice: (config as { voice?: string }).voice ?? "en_female_anna_mars_bigtts"
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
      prompt: config.prompt,
      autoSend: config.autoSend ?? false
    } as Required<AsrConfig>;
  }

  if (config.provider === "elevenlabs") {
    return {
      provider: "elevenlabs",
      credential: config.credential ?? "",
      baseUrl: config.baseUrl ?? "https://api.elevenlabs.io/v1",
      model: config.model ?? "scribe_v2",
      language: config.language ?? "en",
      prompt: config.prompt,
      autoSend: config.autoSend ?? false
    } as Required<AsrConfig>;
  }

  if (config.provider === "openai") {
    return {
      provider: "openai",
      credential: config.credential ?? "",
      baseUrl: config.baseUrl ?? "https://api.openai.com/v1",
      model: config.model ?? "gpt-4o-transcribe",
      language: config.language ?? "en",
      prompt: config.prompt,
      autoSend: config.autoSend ?? false
    } as Required<AsrConfig>;
  }

  if (config.provider === "xai") {
    return {
      provider: "xai",
      credential: config.credential ?? "",
      baseUrl: config.baseUrl ?? "https://api.x.ai/v1",
      model: config.model ?? "grok-stt",
      language: config.language ?? "en",
      prompt: config.prompt,
      autoSend: config.autoSend ?? false
    } as Required<AsrConfig>;
  }

  // mistral (default / fallthrough)
  return {
    provider: "mistral",
    credential: (config as { credential?: string }).credential ?? "",
    baseUrl: (config as { baseUrl?: string }).baseUrl ?? "https://api.mistral.ai/v1",
    model: (config as { model?: string }).model ?? "voxtral-mini-latest",
    language: (config as { language?: string }).language ?? "en",
    prompt: (config as { prompt?: string }).prompt,
    autoSend: (config as { autoSend?: boolean }).autoSend ?? false
  } as Required<AsrConfig>;
}

const CLOUD_TTS_CREDENTIAL_IDS: TtsProviderId[] = [
  "elevenlabs", "deepgram", "openai", "google", "xai", "deepinfra", "openrouter",
  "inworld", "minimax", "gradium", "vydra", "xiaomi", "azure-speech", "volcengine"
];

const CLOUD_ASR_CREDENTIAL_IDS: AsrProviderId[] = ["deepgram", "elevenlabs", "openai", "xai", "mistral"];

export function speechProviderNeedsCredential(provider: TtsProviderId | AsrProviderId) {
  return (CLOUD_TTS_CREDENTIAL_IDS as string[]).includes(provider) ||
    (CLOUD_ASR_CREDENTIAL_IDS as string[]).includes(provider);
}

export function getTtsProviderLabel(provider: TtsProviderId): string {
  const labels: Record<TtsProviderId, string> = {
    kokoro: "Kokoro local",
    elevenlabs: "ElevenLabs",
    deepgram: "Deepgram",
    openai: "OpenAI",
    google: "Google",
    xai: "xAI",
    deepinfra: "DeepInfra",
    openrouter: "OpenRouter",
    inworld: "Inworld",
    minimax: "MiniMax",
    gradium: "Gradium",
    vydra: "Vydra",
    xiaomi: "Xiaomi MiMo",
    "azure-speech": "Azure Speech",
    microsoft: "Microsoft Edge TTS",
    volcengine: "Volcengine"
  };
  return labels[provider] ?? provider;
}

export function getAsrProviderLabel(provider: AsrProviderId): string {
  const labels: Record<AsrProviderId, string> = {
    "distil-whisper": "Distil-Whisper local",
    elevenlabs: "ElevenLabs",
    deepgram: "Deepgram",
    openai: "OpenAI",
    xai: "xAI",
    mistral: "Mistral"
  };
  return labels[provider] ?? provider;
}
