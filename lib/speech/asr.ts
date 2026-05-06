import { normalizeAsrConfig } from "./config";
import { DistilWhisperWorkerClient } from "./workerClient";
import type { FetchLike } from "@/lib/llm";
import type { AsrAdapter, AsrConfig, AsrResult, AsrWorkerLike } from "./types";

type CreateAsrAdapterInput = {
  config: AsrConfig;
  fetch?: FetchLike;
  worker?: AsrWorkerLike;
};

export function createAsrAdapter(input: CreateAsrAdapterInput): AsrAdapter {
  const config = normalizeAsrConfig(input.config);
  const fetchImpl = input.fetch ?? fetch;

  if (config.provider === "distil-whisper") {
    const worker = input.worker ?? new DistilWhisperWorkerClient();
    return {
      provider: "distil-whisper",
      async transcribe(audio) {
        return worker.transcribe({ ...config, audio: await decodeAudioBlob(audio) });
      }
    };
  }

  if (config.provider === "deepgram") {
    return {
      provider: "deepgram",
      transcribe(audio) {
        return transcribeDeepgram(audio, config, fetchImpl);
      }
    };
  }

  if (config.provider === "elevenlabs") {
    return {
      provider: "elevenlabs",
      transcribe(audio) {
        return transcribeElevenLabs(audio, config, fetchImpl);
      }
    };
  }

  if (config.provider === "openai") {
    return {
      provider: "openai",
      transcribe(audio) {
        return transcribeOpenAiCompatible(audio, config, fetchImpl);
      }
    };
  }

  if (config.provider === "google") {
    return {
      provider: "google",
      transcribe(audio) {
        return transcribeGoogle(audio, config, fetchImpl);
      }
    };
  }

  if (config.provider === "xai") {
    return {
      provider: "xai",
      transcribe(audio) {
        return transcribeXai(audio, config, fetchImpl);
      }
    };
  }

  // mistral (default / fallthrough)
  return {
    provider: "mistral",
    transcribe(audio) {
      return transcribeOpenAiCompatible(audio, config, fetchImpl);
    }
  };
}

// ── Deepgram ──────────────────────────────────────────────────────────────────

async function transcribeDeepgram(
  audio: Blob,
  config: Extract<ReturnType<typeof normalizeAsrConfig>, { provider: "deepgram" }>,
  fetchImpl: FetchLike
): Promise<AsrResult> {
  const url = new URL(`${trimSlash(config.baseUrl)}/listen`);
  url.searchParams.set("model", config.model);
  const language = normalizeOptionalString(config.language);
  if (language) url.searchParams.set("language", language);
  const audioBytes = new Uint8Array(await audio.arrayBuffer());
  const response = await fetchImpl(
    url.toString(),
    {
      method: "POST",
      headers: {
        Authorization: `Token ${config.credential}`,
        "Content-Type": audio.type || "application/octet-stream"
      },
      body: audioBytes
    }
  );
  if (!response.ok) {
    throw new Error(`Deepgram STT failed with ${response.status}`);
  }
  const body = await response.json();
  return {
    text: body?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "",
    language: config.language
  };
}

// ── ElevenLabs ────────────────────────────────────────────────────────────────

async function transcribeElevenLabs(
  audio: Blob,
  config: Extract<ReturnType<typeof normalizeAsrConfig>, { provider: "elevenlabs" }>,
  fetchImpl: FetchLike
): Promise<AsrResult> {
  const formData = new FormData();
  appendFormField(formData, "model_id", config.model);
  appendFormField(formData, "language_code", config.language);
  appendFormField(formData, "prompt", config.prompt);
  formData.set("file", audio, inferRecordingFileName(audio));

  const response = await fetchImpl(`${trimSlash(config.baseUrl)}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": config.credential },
    body: formData
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs STT failed with ${response.status}`);
  }
  const body = await response.json();
  return {
    text: body?.text ?? "",
    language: body?.language_code ?? config.language
  };
}

// ── OpenAI-compatible (openai, mistral) ────────────────────────────────────────

async function transcribeOpenAiCompatible(
  audio: Blob,
  config: { credential: string; baseUrl: string; model: string; language: string; prompt?: string },
  fetchImpl: FetchLike
): Promise<AsrResult> {
  const formData = new FormData();
  formData.set("file", audio, inferRecordingFileName(audio));
  appendFormField(formData, "model", config.model);
  appendFormField(formData, "language", config.language);
  appendFormField(formData, "prompt", config.prompt);

  const response = await fetchImpl(`${trimSlash(config.baseUrl)}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.credential}` },
    body: formData
  });
  if (!response.ok) {
    throw new Error(`STT provider failed with ${response.status}`);
  }
  const body = await response.json();
  return {
    text: body?.text ?? "",
    language: normalizeOptionalString(config.language)
  };
}

// ── xAI ────────────────────────────────────────────────────────────────────────

async function transcribeXai(
  audio: Blob,
  config: { credential: string; baseUrl: string; model: string; language: string },
  fetchImpl: FetchLike
): Promise<AsrResult> {
  const formData = new FormData();
  formData.set("file", audio, inferRecordingFileName(audio));
  appendFormField(formData, "model", config.model);
  appendFormField(formData, "language", config.language);

  const response = await fetchImpl(`${trimSlash(config.baseUrl)}/stt`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.credential}` },
    body: formData
  });
  if (!response.ok) {
    throw new Error(`xAI STT failed with ${response.status}`);
  }
  const body = await response.json();
  return {
    text: body?.text ?? "",
    language: normalizeOptionalString(config.language)
  };
}

// ── Google Gemini ──────────────────────────────────────────────────────────────

async function transcribeGoogle(
  audio: Blob,
  config: { credential: string; baseUrl: string; model: string; prompt: string },
  fetchImpl: FetchLike
): Promise<AsrResult> {
  const bytes = new Uint8Array(await audio.arrayBuffer());
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  const prompt = normalizeOptionalString(config.prompt) ?? "Transcribe the audio.";
  const response = await fetchImpl(
    `${trimSlash(config.baseUrl)}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.credential)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: audio.type || "audio/wav",
                  data: btoa(binary)
                }
              }
            ]
          }
        ]
      })
    }
  );
  if (!response.ok) {
    throw new Error(`Google STT failed with ${response.status}`);
  }
  const body = await response.json();
  const text = (body?.candidates?.[0]?.content?.parts ?? [])
    .map((part: { text?: unknown }) => (typeof part.text === "string" ? part.text.trim() : ""))
    .filter(Boolean)
    .join("\n");
  return { text };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function trimSlash(input: string) {
  return input.replace(/\/+$/, "");
}

function normalizeOptionalString(input: string | undefined) {
  const trimmed = input?.trim();
  return trimmed || undefined;
}

function appendFormField(formData: FormData, name: string, value: string | undefined) {
  const trimmed = normalizeOptionalString(value);
  if (trimmed) formData.set(name, trimmed);
}

function inferRecordingFileName(audio: Blob) {
  if (audio.type === "audio/wav") return "recording.wav";
  if (audio.type === "audio/mpeg") return "recording.mp3";
  if (audio.type === "audio/ogg") return "recording.ogg";
  if (audio.type === "audio/aac") return "recording.m4a";
  return "recording.webm";
}

async function decodeAudioBlob(audio: Blob) {
  const context = new AudioContext({ sampleRate: 16000 });
  try {
    const buffer = await context.decodeAudioData(await audio.arrayBuffer());
    return mixToMono(buffer);
  } finally {
    await context.close();
  }
}

function mixToMono(buffer: AudioBuffer) {
  const samples = new Float32Array(buffer.length);
  for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
    const channel = buffer.getChannelData(channelIndex);
    for (let sampleIndex = 0; sampleIndex < channel.length; sampleIndex += 1) {
      samples[sampleIndex] += channel[sampleIndex] / buffer.numberOfChannels;
    }
  }
  return samples;
}
