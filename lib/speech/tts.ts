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

  return {
    provider: "deepgram",
    synthesize(text) {
      return synthesizeDeepgram(text, config, fetchImpl);
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

async function synthesizeElevenLabs(text: string, config: Extract<ReturnType<typeof normalizeTtsConfig>, { provider: "elevenlabs" }>, fetchImpl: FetchLike) {
  const response = await fetchImpl(`${trimTrailingSlash(config.baseUrl)}/text-to-speech/${encodeURIComponent(config.voiceId)}/stream`, {
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
  });
  return audioResponse(response);
}

async function synthesizeDeepgram(text: string, config: Extract<ReturnType<typeof normalizeTtsConfig>, { provider: "deepgram" }>, fetchImpl: FetchLike) {
  const response = await fetchImpl(`${trimTrailingSlash(config.baseUrl)}/speak?model=${encodeURIComponent(config.model)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/wav",
      Authorization: `Token ${config.credential}`
    },
    body: JSON.stringify({ text })
  });
  return audioResponse(response);
}

async function audioResponse(response: Response): Promise<TtsResult> {
  if (!response.ok) {
    throw new Error(`TTS provider request failed with ${response.status}`);
  }
  return {
    audio: await response.arrayBuffer(),
    mimeType: response.headers.get("content-type") ?? "application/octet-stream"
  };
}

function trimTrailingSlash(input: string) {
  return input.replace(/\/+$/, "");
}
