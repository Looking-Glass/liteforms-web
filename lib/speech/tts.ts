import { normalizeTtsConfig } from "./config";
import { KokoroWorkerClient } from "./workerClient";
import type { FetchLike } from "@/lib/llm";
import type { TtsAdapter, TtsConfig, TtsResult, TtsWorkerLike } from "./types";

type CreateTtsAdapterInput = {
  config: TtsConfig;
  fetch?: FetchLike;
  worker?: TtsWorkerLike;
};

export function createTtsAdapter(input: CreateTtsAdapterInput): TtsAdapter {
  const config = normalizeTtsConfig(input.config);
  const fetchImpl = input.fetch ?? fetch;

  if (config.provider === "kokoro") {
    const worker = input.worker ?? new KokoroWorkerClient();
    return {
      provider: "kokoro",
      synthesize(text) {
        return worker.synthesize({ ...config, text });
      }
    };
  }

  if (config.provider === "elevenlabs") {
    return {
      provider: "elevenlabs",
      synthesize(text) {
        return synthesizeElevenLabs(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "deepgram") {
    return {
      provider: "deepgram",
      synthesize(text) {
        return synthesizeDeepgram(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "openai") {
    return {
      provider: "openai",
      synthesize(text) {
        return synthesizeOpenAiCompatible(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "google") {
    return {
      provider: "google",
      synthesize(text) {
        return synthesizeGoogle(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "xai") {
    return {
      provider: "xai",
      synthesize(text) {
        return synthesizeOpenAiCompatible(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "deepinfra") {
    return {
      provider: "deepinfra",
      synthesize(text) {
        return synthesizeOpenAiCompatible(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "openrouter") {
    return {
      provider: "openrouter",
      synthesize(text) {
        return synthesizeOpenAiCompatible(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "inworld") {
    return {
      provider: "inworld",
      synthesize(text) {
        return synthesizeInworld(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "minimax") {
    return {
      provider: "minimax",
      synthesize(text) {
        return synthesizeMiniMax(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "gradium") {
    return {
      provider: "gradium",
      synthesize(text) {
        return synthesizeElevenLabsCompat(text, config, "xi-api-key", fetchImpl);
      }
    };
  }

  if (config.provider === "vydra") {
    return {
      provider: "vydra",
      synthesize(text) {
        return synthesizeElevenLabsCompat(text, config, "xi-api-key", fetchImpl);
      }
    };
  }

  if (config.provider === "xiaomi") {
    return {
      provider: "xiaomi",
      synthesize(text) {
        return synthesizeOpenAiCompatible(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "azure-speech") {
    return {
      provider: "azure-speech",
      synthesize(text) {
        return synthesizeAzureSpeech(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "microsoft") {
    return {
      provider: "microsoft",
      synthesize(text) {
        return synthesizeOpenAiCompatible(text, config, fetchImpl);
      }
    };
  }

  // volcengine
  return {
    provider: "volcengine",
    synthesize(text) {
      return synthesizeVolcengine(text, config, fetchImpl);
    }
  };
}

export function splitSpeakableText(text: string) {
  const chunks: string[] = [];
  let remainder = text;
  const sentencePattern = /[^.!?]+[.!?]+(?:\s+|$)/g;
  const matches = text.match(sentencePattern) ?? [];
  for (const match of matches) {
    const chunk = match.trim();
    if (chunk) {
      chunks.push(chunk);
    }
  }
  if (chunks.length > 0) {
    const consumed = matches.join("").length;
    remainder = text.slice(consumed).trimStart();
  }
  return { chunks, remainder };
}

export async function speakTextChunks(chunks: string[], adapter: TtsAdapter, play: (result: TtsResult) => Promise<void>) {
  for (const chunk of chunks) {
    const result = await adapter.synthesize(chunk);
    await play(result);
  }
}

// ── ElevenLabs ────────────────────────────────────────────────────────────────

async function synthesizeElevenLabs(
  text: string,
  config: Extract<ReturnType<typeof normalizeTtsConfig>, { provider: "elevenlabs" }>,
  fetchImpl: FetchLike
) {
  const response = await fetchImpl(
    `${trimSlash(config.baseUrl)}/text-to-speech/${encodeURIComponent(config.voiceId)}/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
        "xi-api-key": config.credential
      },
      body: JSON.stringify({
        text,
        model_id: config.modelId,
        voice_settings: {
          stability: config.stability,
          similarity_boost: config.similarityBoost,
          style: config.style,
          use_speaker_boost: config.useSpeakerBoost,
          speed: config.speed
        }
      })
    }
  );
  return audioResponse(response);
}

// ── Deepgram ──────────────────────────────────────────────────────────────────

async function synthesizeDeepgram(
  text: string,
  config: Extract<ReturnType<typeof normalizeTtsConfig>, { provider: "deepgram" }>,
  fetchImpl: FetchLike
) {
  const response = await fetchImpl(
    `${trimSlash(config.baseUrl)}/speak?model=${encodeURIComponent(config.model)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/wav",
        Authorization: `Token ${config.credential}`
      },
      body: JSON.stringify({ text })
    }
  );
  return audioResponse(response);
}

// ── OpenAI-compatible (openai, xai, deepinfra, openrouter, xiaomi, microsoft) ─

async function synthesizeOpenAiCompatible(
  text: string,
  config: { credential: string; baseUrl: string; model: string; voice: string },
  fetchImpl: FetchLike
): Promise<TtsResult> {
  const response = await fetchImpl(`${trimSlash(config.baseUrl)}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.credential}`
    },
    body: JSON.stringify({ model: config.model, input: text, voice: config.voice })
  });
  return audioResponse(response);
}

// ── Google Gemini TTS ──────────────────────────────────────────────────────────

async function synthesizeGoogle(
  text: string,
  config: { credential: string; baseUrl: string; model: string; voice: string },
  fetchImpl: FetchLike
): Promise<TtsResult> {
  const url = `${trimSlash(config.baseUrl)}/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.credential)}`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voice } } }
      }
    })
  });
  if (!response.ok) {
    throw new Error(`Google TTS failed with ${response.status}`);
  }
  const data = await response.json();
  const part = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData as
    | { mimeType: string; data: string }
    | undefined;
  if (!part) throw new Error("Google TTS: no audio in response");
  const audio = Uint8Array.from(atob(part.data), (c) => c.charCodeAt(0)).buffer;
  return { audio, mimeType: part.mimeType ?? "audio/wav" };
}

// ── Inworld ───────────────────────────────────────────────────────────────────

async function synthesizeInworld(
  text: string,
  config: { credential: string; baseUrl: string; model: string; voice: string },
  fetchImpl: FetchLike
): Promise<TtsResult> {
  const response = await fetchImpl(`${trimSlash(config.baseUrl)}/studio/v1/tts:synthesize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.credential}`
    },
    body: JSON.stringify({
      text,
      config: { modelId: config.model },
      voice: { name: config.voice }
    })
  });
  if (!response.ok) throw new Error(`Inworld TTS failed with ${response.status}`);
  const data = await response.json();
  const b64 = (data?.audio ?? data?.data) as string | undefined;
  if (!b64) throw new Error("Inworld TTS: no audio in response");
  const audio = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
  return { audio, mimeType: "audio/wav" };
}

// ── MiniMax ───────────────────────────────────────────────────────────────────

async function synthesizeMiniMax(
  text: string,
  config: { credential: string; baseUrl: string; model: string; voice: string },
  fetchImpl: FetchLike
): Promise<TtsResult> {
  const response = await fetchImpl(`${trimSlash(config.baseUrl)}/v1/t2a_pro`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.credential}`
    },
    body: JSON.stringify({
      model: config.model,
      text,
      stream: false,
      voice_setting: { voice_id: config.voice, speed: 1.0, vol: 1.0, pitch: 0 },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 }
    })
  });
  if (!response.ok) throw new Error(`MiniMax TTS failed with ${response.status}`);
  const data = await response.json();
  const hexAudio = data?.data?.audio as string | undefined;
  if (!hexAudio) throw new Error("MiniMax TTS: no audio in response");
  const bytes = new Uint8Array(hexAudio.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
  return { audio: bytes.buffer, mimeType: "audio/mpeg" };
}

// ── ElevenLabs-compatible (gradium, vydra) ────────────────────────────────────

async function synthesizeElevenLabsCompat(
  text: string,
  config: { credential: string; baseUrl: string; model: string; voice: string },
  authHeader: "xi-api-key" | "bearer",
  fetchImpl: FetchLike
): Promise<TtsResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "audio/mpeg"
  };
  if (authHeader === "xi-api-key") {
    headers["xi-api-key"] = config.credential;
  } else {
    headers["Authorization"] = `Bearer ${config.credential}`;
  }
  const response = await fetchImpl(
    `${trimSlash(config.baseUrl)}/text-to-speech/${encodeURIComponent(config.voice)}/stream`,
    { method: "POST", headers, body: JSON.stringify({ text, model_id: config.model }) }
  );
  return audioResponse(response);
}

// ── Azure Speech ──────────────────────────────────────────────────────────────

async function synthesizeAzureSpeech(
  text: string,
  config: { credential: string; baseUrl: string; voice: string },
  fetchImpl: FetchLike
): Promise<TtsResult> {
  const escaped = text.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] ?? c
  );
  const ssml = `<speak version="1.0" xml:lang="en-US"><voice name="${config.voice}">${escaped}</voice></speak>`;
  const response = await fetchImpl(`${trimSlash(config.baseUrl)}/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/ssml+xml",
      "Ocp-Apim-Subscription-Key": config.credential,
      "X-Microsoft-OutputFormat": "audio-16khz-32kbitrate-mono-mp3"
    },
    body: ssml
  });
  return audioResponse(response);
}

// ── Volcengine ────────────────────────────────────────────────────────────────

async function synthesizeVolcengine(
  text: string,
  config: { credential: string; baseUrl: string; voice: string },
  fetchImpl: FetchLike
): Promise<TtsResult> {
  const response = await fetchImpl(`${trimSlash(config.baseUrl)}/api/v3/tts/unidirectional`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.credential}`
    },
    body: JSON.stringify({
      app: { cluster: "volcano_tts" },
      user: { uid: "liteforms" },
      audio: { voice_type: config.voice, encoding: "mp3" },
      request: { text, reqid: Date.now().toString(), operation: "query" }
    })
  });
  if (!response.ok) throw new Error(`Volcengine TTS failed with ${response.status}`);
  const data = await response.json();
  const b64 = data?.data?.audio as string | undefined;
  if (!b64) throw new Error("Volcengine TTS: no audio in response");
  const audio = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
  return { audio, mimeType: "audio/mpeg" };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function audioResponse(response: Response): Promise<TtsResult> {
  if (!response.ok) {
    throw new Error(`TTS provider request failed with ${response.status}`);
  }
  return {
    audio: await response.arrayBuffer(),
    mimeType: response.headers.get("content-type") ?? "application/octet-stream"
  };
}

function trimSlash(input: string) {
  return input.replace(/\/+$/, "");
}
