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

  return {
    provider: "elevenlabs",
    transcribe(audio) {
      return transcribeElevenLabs(audio, config, fetchImpl);
    }
  };
}

async function transcribeDeepgram(audio: Blob, config: Extract<ReturnType<typeof normalizeAsrConfig>, { provider: "deepgram" }>, fetchImpl: FetchLike): Promise<AsrResult> {
  const response = await fetchImpl(`${trimTrailingSlash(config.baseUrl)}/listen?model=${encodeURIComponent(config.model)}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${config.credential}`,
      "Content-Type": audio.type || "application/octet-stream"
    },
    body: audio
  });
  if (!response.ok) {
    throw new Error(`Deepgram STT failed with ${response.status}`);
  }
  const body = await response.json();
  return {
    text: body?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "",
    language: config.language
  };
}

async function transcribeElevenLabs(audio: Blob, config: Extract<ReturnType<typeof normalizeAsrConfig>, { provider: "elevenlabs" }>, fetchImpl: FetchLike): Promise<AsrResult> {
  const formData = new FormData();
  formData.set("model_id", config.model);
  formData.set("file", audio, "recording.webm");

  const response = await fetchImpl(`${trimTrailingSlash(config.baseUrl)}/speech-to-text`, {
    method: "POST",
    headers: {
      "xi-api-key": config.credential
    },
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

function trimTrailingSlash(input: string) {
  return input.replace(/\/+$/, "");
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
