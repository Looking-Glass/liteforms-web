import { normalizeAsrConfig } from "./config";
import type { AsrConfig, AsrProviderId } from "./types";

export type CloudRealtimeAsrProviderId = Exclude<AsrProviderId, "distil-whisper">;
export type CloudRealtimeEncoding = "linear16" | "mulaw" | "alaw" | "pcm_s16le" | "pcm_mulaw" | "pcm_alaw";

export type AsrRelayClientMessage =
  | { type: "start"; provider: CloudRealtimeAsrProviderId; config: CloudRealtimeAsrConfig }
  | { type: "audio"; audio: ArrayBuffer | Uint8Array | string }
  | { type: "finalize" }
  | { type: "close" };

export type AsrRelayServerMessage =
  | { type: "ready" }
  | { type: "partial"; text: string }
  | { type: "transcript"; text: string }
  | { type: "speech_start" }
  | { type: "error"; error: string }
  | { type: "closed" };

export type CloudRealtimeAsrConfig = {
  provider: CloudRealtimeAsrProviderId;
  credential: string;
  baseUrl: string;
  model: string;
  language?: string;
  prompt?: string;
  sampleRate: number;
  encoding: CloudRealtimeEncoding;
  endpointingMs: number;
  interimResults: boolean;
  vadThreshold?: number;
};

export type ProviderRealtimeSession = {
  connect(): Promise<void>;
  sendAudio(audio: Uint8Array): void;
  close(): void;
  isConnected(): boolean;
};

export type ProviderWebSocket = {
  readyState: number;
  send(data: string | ArrayBuffer | Uint8Array): void;
  close(): void;
  addEventListener(type: "open" | "message" | "error" | "close", handler: (event: unknown) => void): void;
};

export type ProviderWebSocketConstructor = new (
  url: string,
  protocols?: string | string[],
  options?: { headers?: Record<string, string> }
) => ProviderWebSocket;

export const CLOUD_REALTIME_ASR_PROVIDERS: CloudRealtimeAsrProviderId[] = [
  "deepgram",
  "elevenlabs",
  "openai",
  "mistral",
  "xai"
];

export function isCloudRealtimeAsrProvider(provider: AsrProviderId): provider is CloudRealtimeAsrProviderId {
  return (CLOUD_REALTIME_ASR_PROVIDERS as string[]).includes(provider);
}

export function normalizeCloudRealtimeAsrConfig(config: AsrConfig): CloudRealtimeAsrConfig | null {
  const normalized = normalizeAsrConfig(config);
  if (!isCloudRealtimeAsrProvider(normalized.provider)) return null;
  const realtime = normalized as Extract<Required<AsrConfig>, { provider: CloudRealtimeAsrProviderId }>;
  const common = {
    provider: realtime.provider,
    credential: realtime.credential,
    baseUrl: realtime.baseUrl,
    language: realtime.language || undefined,
    prompt: realtime.prompt,
    endpointingMs: realtime.endpointingMs ?? 800,
    interimResults: realtime.interimResults ?? true
  };

  if (normalized.provider === "deepgram") {
    return {
      ...common,
      model: realtime.model || "nova-3",
      sampleRate: realtime.sampleRate ?? 8000,
      encoding: normalizeTelephonyEncoding(realtime.encoding, "mulaw")
    };
  }
  if (normalized.provider === "elevenlabs") {
    return {
      ...common,
      model: realtime.model === "scribe_v2" ? "scribe_v2_realtime" : realtime.model || "scribe_v2_realtime",
      sampleRate: realtime.sampleRate ?? 8000,
      encoding: normalizeTelephonyEncoding(realtime.encoding, "mulaw")
    };
  }
  if (normalized.provider === "openai") {
    return {
      ...common,
      model: realtime.model || "gpt-4o-transcribe",
      sampleRate: realtime.sampleRate ?? 8000,
      encoding: "mulaw",
      vadThreshold: 0.5
    };
  }
  if (normalized.provider === "mistral") {
    return {
      ...common,
      baseUrl: realtime.baseUrl || "wss://api.mistral.ai",
      model: realtime.model === "voxtral-mini-latest" ? "voxtral-mini-transcribe-realtime-2602" : realtime.model,
      sampleRate: realtime.sampleRate ?? 8000,
      encoding: normalizeMistralEncoding(realtime.encoding)
    };
  }
  return {
    ...common,
    model: realtime.model || "grok-stt",
    sampleRate: realtime.sampleRate ?? 8000,
    encoding: normalizeTelephonyEncoding(realtime.encoding, "mulaw")
  };
}

export function buildProviderWsRequest(config: CloudRealtimeAsrConfig): {
  url: string;
  headers: Record<string, string>;
  readyOnOpen: boolean;
} {
  if (config.provider === "deepgram") {
    const url = new URL(trimSlash(config.baseUrl) || "https://api.deepgram.com/v1");
    url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/listen`;
    url.searchParams.set("model", config.model);
    url.searchParams.set("encoding", config.encoding === "mulaw" ? "mulaw" : config.encoding);
    url.searchParams.set("sample_rate", String(config.sampleRate));
    url.searchParams.set("channels", "1");
    url.searchParams.set("interim_results", String(config.interimResults));
    url.searchParams.set("endpointing", String(config.endpointingMs));
    if (config.language) url.searchParams.set("language", config.language);
    return { url: url.toString(), headers: { Authorization: `Token ${config.credential}` }, readyOnOpen: true };
  }
  if (config.provider === "elevenlabs") {
    const base = trimSlash(config.baseUrl).replace(/^http:/, "ws:").replace(/^https:/, "wss:").replace(/\/v1$/, "");
    const url = new URL(`${base}/v1/speech-to-text/realtime`);
    url.searchParams.set("model_id", config.model);
    url.searchParams.set("audio_format", config.encoding === "mulaw" ? "ulaw_8000" : String(config.encoding));
    url.searchParams.set("commit_strategy", "vad");
    url.searchParams.set("include_timestamps", "false");
    url.searchParams.set("include_language_detection", "false");
    if (config.language) url.searchParams.set("language_code", config.language);
    return { url: url.toString(), headers: { "xi-api-key": config.credential }, readyOnOpen: false };
  }
  if (config.provider === "openai") {
    return {
      url: "wss://api.openai.com/v1/realtime?intent=transcription",
      headers: { Authorization: `Bearer ${config.credential}`, "OpenAI-Beta": "realtime=v1" },
      readyOnOpen: true
    };
  }
  if (config.provider === "mistral") {
    const base = normalizeWsBase(config.baseUrl || "wss://api.mistral.ai").replace(/\/v1$/, "");
    const url = new URL(`${trimSlash(base)}/v1/audio/transcriptions/realtime`);
    url.searchParams.set("model", config.model);
    url.searchParams.set("target_streaming_delay_ms", String(config.endpointingMs));
    return { url: url.toString(), headers: { Authorization: `Bearer ${config.credential}` }, readyOnOpen: false };
  }
  const url = new URL(normalizeWsBase(config.baseUrl || "https://api.x.ai/v1"));
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/stt`;
  url.searchParams.set("sample_rate", String(config.sampleRate));
  url.searchParams.set("encoding", config.encoding === "mulaw" ? "mulaw" : config.encoding);
  url.searchParams.set("interim_results", String(config.interimResults));
  url.searchParams.set("endpointing", String(config.endpointingMs));
  if (config.language) url.searchParams.set("language", config.language);
  return { url: url.toString(), headers: { Authorization: `Bearer ${config.credential}` }, readyOnOpen: false };
}

export function mapProviderEvent(config: CloudRealtimeAsrConfig, event: unknown): AsrRelayServerMessage[] {
  const record = readRecord(event);
  if (!record) return [];
  if (config.provider === "deepgram") return mapDeepgramEvent(record);
  if (config.provider === "elevenlabs") return mapElevenLabsEvent(record);
  if (config.provider === "openai") return mapOpenAiEvent(record);
  if (config.provider === "mistral") return mapMistralEvent(record);
  return mapXaiEvent(record);
}

export function buildProviderAudioMessage(config: CloudRealtimeAsrConfig, audio: Uint8Array): string | Uint8Array {
  if (config.provider === "elevenlabs") {
    return JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: toBase64(audio), sample_rate: config.sampleRate });
  }
  if (config.provider === "openai") {
    return JSON.stringify({ type: "input_audio_buffer.append", audio: toBase64(audio) });
  }
  if (config.provider === "mistral") {
    return JSON.stringify({ type: "input_audio.append", audio: toBase64(audio) });
  }
  return audio;
}

export function buildProviderFinalizeMessages(config: CloudRealtimeAsrConfig): Array<string | Uint8Array> {
  if (config.provider === "deepgram") return [JSON.stringify({ type: "Finalize" })];
  if (config.provider === "elevenlabs") {
    return [JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: "", sample_rate: config.sampleRate, commit: true })];
  }
  if (config.provider === "mistral") {
    return [JSON.stringify({ type: "input_audio.flush" }), JSON.stringify({ type: "input_audio.end" })];
  }
  if (config.provider === "xai") return [JSON.stringify({ type: "audio.done" })];
  return [];
}

export function createProviderRealtimeSession({
  config,
  WebSocketCtor,
  onMessage,
  onError,
  maxQueuedBytes = 2 * 1024 * 1024,
  connectTimeoutMs = 10_000
}: {
  config: CloudRealtimeAsrConfig;
  WebSocketCtor: ProviderWebSocketConstructor;
  onMessage: (message: AsrRelayServerMessage) => void;
  onError?: (error: Error) => void;
  maxQueuedBytes?: number;
  connectTimeoutMs?: number;
}): ProviderRealtimeSession {
  let ws: ProviderWebSocket | null = null;
  let connected = false;
  let ready = false;
  let queue: Uint8Array[] = [];
  let queuedBytes = 0;
  const request = buildProviderWsRequest(config);

  const flush = () => {
    if (!ws || !ready) return;
    for (const audio of queue) ws.send(buildProviderAudioMessage(config, audio));
    queue = [];
    queuedBytes = 0;
  };

  return {
    connect() {
      return new Promise<void>((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          const error = new Error(`${config.provider} realtime transcription connection timeout`);
          onError?.(error);
          reject(error);
        }, connectTimeoutMs);
        const markReady = () => {
          ready = true;
          onMessage({ type: "ready" });
          flush();
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve();
          }
        };
        ws = new WebSocketCtor(request.url, undefined, { headers: request.headers });
        ws.addEventListener("open", () => {
          connected = true;
          if (config.provider === "openai") {
            ws?.send(JSON.stringify({
              type: "transcription_session.update",
              session: {
                input_audio_format: "g711_ulaw",
                input_audio_transcription: { model: config.model, ...(config.language ? { language: config.language } : {}), ...(config.prompt ? { prompt: config.prompt } : {}) },
                turn_detection: { type: "server_vad", threshold: config.vadThreshold ?? 0.5, prefix_padding_ms: 300, silence_duration_ms: config.endpointingMs }
              }
            }));
          }
          if (request.readyOnOpen) markReady();
        });
        ws.addEventListener("message", (event) => {
          const data = (event as MessageEvent).data;
          const text = typeof data === "string" ? data : "";
          const parsed = text ? JSON.parse(text) : data;
          for (const message of mapProviderEvent(config, parsed)) {
            if (message.type === "ready") markReady();
            else onMessage(message);
          }
        });
        ws.addEventListener("error", (event) => {
          const error = event instanceof Error ? event : new Error(`${config.provider} realtime transcription error`);
          onError?.(error);
          if (!settled) reject(error);
        });
        ws.addEventListener("close", () => {
          connected = false;
          ready = false;
          onMessage({ type: "closed" });
        });
      });
    },
    sendAudio(audio) {
      if (!audio.byteLength) return;
      if (ws && ready) {
        ws.send(buildProviderAudioMessage(config, audio));
        return;
      }
      queuedBytes += audio.byteLength;
      queue.push(audio);
      while (queuedBytes > maxQueuedBytes && queue.length > 0) {
        queuedBytes -= queue.shift()?.byteLength ?? 0;
      }
    },
    close() {
      if (!ws) return;
      for (const message of buildProviderFinalizeMessages(config)) ws.send(message);
      ws.close();
    },
    isConnected() {
      return connected && ready;
    }
  };
}

function mapDeepgramEvent(event: Record<string, unknown>): AsrRelayServerMessage[] {
  if (event.type === "SpeechStarted") return [{ type: "speech_start" }];
  if (event.type === "Error" || event.type === "error") return [{ type: "error", error: readError(event) }];
  if (event.type !== "Results") return [];
  const text = readNestedTranscript(event, ["channel", "alternatives", "0", "transcript"]);
  if (!text) return [];
  return event.is_final || event.speech_final ? [{ type: "transcript", text }] : [{ type: "partial", text }];
}

function mapElevenLabsEvent(event: Record<string, unknown>): AsrRelayServerMessage[] {
  if (event.message_type === "session_started") return [{ type: "ready" }];
  if (event.message_type === "partial_transcript" && typeof event.text === "string") return [{ type: "partial", text: event.text }];
  if ((event.message_type === "committed_transcript" || event.message_type === "committed_transcript_with_timestamps") && typeof event.text === "string") {
    return [{ type: "transcript", text: event.text }];
  }
  if (String(event.message_type ?? "").includes("error")) return [{ type: "error", error: readError(event) }];
  return [];
}

function mapOpenAiEvent(event: Record<string, unknown>): AsrRelayServerMessage[] {
  if (event.type === "input_audio_buffer.speech_started") return [{ type: "speech_start" }];
  if (event.type === "conversation.item.input_audio_transcription.delta" && typeof event.delta === "string") return [{ type: "partial", text: event.delta }];
  if (event.type === "conversation.item.input_audio_transcription.completed" && typeof event.transcript === "string") return [{ type: "transcript", text: event.transcript }];
  if (event.type === "error") return [{ type: "error", error: readError(event.error) }];
  return [];
}

function mapMistralEvent(event: Record<string, unknown>): AsrRelayServerMessage[] {
  if (event.type === "session.created") return [{ type: "ready" }];
  if (event.type === "transcription.text.delta" && typeof event.text === "string") return [{ type: "partial", text: event.text }];
  if ((event.type === "transcription.segment" || event.type === "transcription.done") && typeof event.text === "string") return [{ type: "transcript", text: event.text }];
  if (event.type === "error") return [{ type: "error", error: readError(event.error) }];
  return [];
}

function mapXaiEvent(event: Record<string, unknown>): AsrRelayServerMessage[] {
  if (event.type === "transcript.created") return [{ type: "ready" }];
  if (event.type === "transcript.partial") {
    const text = typeof event.text === "string" ? event.text : typeof event.transcript === "string" ? event.transcript : "";
    if (!text) return [];
    return event.is_final && event.speech_final ? [{ type: "transcript", text }] : [{ type: "partial", text }];
  }
  if (event.type === "transcript.done") {
    const text = typeof event.text === "string" ? event.text : typeof event.transcript === "string" ? event.transcript : "";
    return text ? [{ type: "transcript", text }, { type: "closed" }] : [{ type: "closed" }];
  }
  if (event.type === "error") return [{ type: "error", error: readError(event.error ?? event.message) }];
  return [];
}

function normalizeTelephonyEncoding(value: string | undefined, fallback: "mulaw" | "alaw" | "linear16"): "mulaw" | "alaw" | "linear16" {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["ulaw", "g711_ulaw", "g711-mulaw", "mulaw"].includes(normalized)) return "mulaw";
  if (["g711_alaw", "g711-alaw", "alaw"].includes(normalized)) return "alaw";
  if (["pcm", "pcm_s16le", "linear16"].includes(normalized)) return "linear16";
  return fallback;
}

function normalizeMistralEncoding(value: string | undefined): "pcm_mulaw" | "pcm_alaw" | "pcm_s16le" {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "pcm_mulaw";
  if (["mulaw", "ulaw", "g711_ulaw", "g711-mulaw", "pcm_mulaw"].includes(normalized)) return "pcm_mulaw";
  if (["alaw", "g711_alaw", "g711-alaw", "pcm_alaw"].includes(normalized)) return "pcm_alaw";
  return "pcm_s16le";
}

function trimSlash(input: string) {
  return input.replace(/\/+$/, "");
}

function normalizeWsBase(input: string) {
  return input.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function readNestedTranscript(record: Record<string, unknown>, path: string[]) {
  let current: unknown = record;
  for (const key of path) {
    if (Array.isArray(current)) current = current[Number(key)];
    else current = readRecord(current)?.[key];
  }
  return typeof current === "string" ? current.trim() : "";
}

function readError(value: unknown): string {
  if (typeof value === "string") return value;
  const record = readRecord(value);
  const message = record?.message;
  const code = record?.code;
  if (typeof message === "string") return message;
  if (typeof code === "string") return code;
  if (typeof code === "number") return String(code);
  return "Realtime transcription error";
}

function toBase64(audio: Uint8Array) {
  if (typeof Buffer !== "undefined") return Buffer.from(audio).toString("base64");
  let binary = "";
  for (const byte of audio) binary += String.fromCharCode(byte);
  return btoa(binary);
}
