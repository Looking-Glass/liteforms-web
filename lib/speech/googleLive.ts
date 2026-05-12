import type { OpenAiRealtimeVoiceConfig } from "./openAiRealtime";

export type GoogleLiveVoiceConfig = {
  provider: "google-live";
  credential?: string;
  model?: string;
  voice?: string;
  language?: string;
  instructions?: string;
  websocketUrl?: string;
  ephemeralToken?: string;
};

export type RealtimeVoiceConfig = { provider: "none" } | GoogleLiveVoiceConfig | OpenAiRealtimeVoiceConfig;

export type GoogleLiveClientMessage =
  | { type: "setup"; config: ReturnType<typeof normalizeGoogleLiveVoiceConfig> }
  | { type: "audio"; audio: string }
  | { type: "text"; text: string }
  | { type: "close" };

export type GoogleLiveServerEvent =
  | { type: "user_transcript"; text: string; final: boolean }
  | { type: "assistant_transcript"; text: string; final: boolean }
  | { type: "audio"; audio: string; mimeType: string }
  | { type: "error"; error: string }
  | { type: "closed" };

export type GoogleLiveBrowserSession = {
  start(stream: MediaStream): void;
  stop(): void;
  isActive(): boolean;
  sendText(text: string): void;
};

export type CreateGoogleLiveBrowserSessionInput = {
  config: GoogleLiveVoiceConfig;
  onUserTranscript?: (text: string, final: boolean) => void;
  onAssistantTranscript?: (text: string, final: boolean) => void;
  onAudio?: (audio: Blob) => void;
  onError?: (error: Error) => void;
  WebSocketCtor?: typeof WebSocket;
};

export const GOOGLE_LIVE_DEFAULT_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";
export const GOOGLE_LIVE_DEFAULT_VOICE = "Kore";
export const GOOGLE_LIVE_DEFAULT_WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
export const GOOGLE_LIVE_EPHEMERAL_WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";

const GOOGLE_LIVE_ALLOWED_HOSTS = new Set(["generativelanguage.googleapis.com"]);
const GOOGLE_LIVE_ALLOWED_PATH =
  /^\/ws\/google\.ai\.generativelanguage\.v[0-9a-z]+\.GenerativeService\.BidiGenerateContent(?:Constrained)?$/;

export function normalizeGoogleLiveVoiceConfig(config: GoogleLiveVoiceConfig) {
  return {
    provider: "google-live" as const,
    credential: config.credential ?? "",
    model: config.model ?? GOOGLE_LIVE_DEFAULT_MODEL,
    voice: config.voice ?? GOOGLE_LIVE_DEFAULT_VOICE,
    language: config.language ?? "en-US",
    instructions: config.instructions ?? "Keep spoken replies brief and natural.",
    websocketUrl: config.websocketUrl ?? GOOGLE_LIVE_DEFAULT_WS_URL,
    ephemeralToken: config.ephemeralToken
  };
}

export function buildGoogleLiveSetupMessage(config: GoogleLiveVoiceConfig) {
  const normalized = normalizeGoogleLiveVoiceConfig(config);
  const usesNativeAudio = normalized.model.includes("native-audio");
  return {
    setup: {
      model: `models/${normalized.model}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: normalized.voice
            }
          },
          ...(usesNativeAudio ? {} : { languageCode: normalized.language })
        }
      },
      systemInstruction: {
        parts: [{ text: normalized.instructions }]
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {}
    }
  };
}

export function buildGoogleLiveWebSocketUrl(config: GoogleLiveVoiceConfig) {
  const normalized = normalizeGoogleLiveVoiceConfig(config);
  let wsUrl = normalized.websocketUrl;
  if (!normalized.ephemeralToken && normalized.credential) {
    const credential = normalized.credential.trim();
    const isEphemeral = credential.startsWith("auth_tokens/") || credential.startsWith("ya29.");
    // Migrate stale sessions: if a plain API key is paired with the Constrained (ephemeral-only)
    // endpoint, silently switch to the API-key-compatible v1beta endpoint.
    if (!isEphemeral && wsUrl === GOOGLE_LIVE_EPHEMERAL_WS_URL) {
      wsUrl = GOOGLE_LIVE_DEFAULT_WS_URL;
    }
  }
  const url = validateGoogleLiveWebSocketUrl(wsUrl);
  if (normalized.ephemeralToken) {
    url.searchParams.set("access_token", normalized.ephemeralToken);
  } else if (normalized.credential) {
    const credential = normalized.credential.trim();
    url.searchParams.set(credential.startsWith("auth_tokens/") || credential.startsWith("ya29.") ? "access_token" : "key", credential);
  }
  return url.toString();
}

export function validateGoogleLiveWebSocketUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Invalid Google Live WebSocket URL");
  }
  if (url.protocol !== "wss:") throw new Error("Google Live WebSocket URL must use wss://");
  if (!GOOGLE_LIVE_ALLOWED_HOSTS.has(url.hostname)) throw new Error("Untrusted Google Live WebSocket host");
  if (url.username || url.password) throw new Error("Google Live WebSocket URL must not include credentials");
  if (!GOOGLE_LIVE_ALLOWED_PATH.test(url.pathname)) throw new Error("Untrusted Google Live WebSocket path");
  url.search = "";
  return url;
}

export function mapGoogleLiveEvent(event: unknown): GoogleLiveServerEvent[] {
  const record = readRecord(event);
  if (!record) return [];
  const serverContent = readRecord(record.serverContent ?? record.server_content);
  const turnComplete = Boolean(serverContent?.turnComplete ?? serverContent?.turn_complete);
  const modelTurn = readRecord(serverContent?.modelTurn ?? serverContent?.model_turn);
  const inputTranscription = readRecord(serverContent?.inputTranscription ?? serverContent?.input_transcription);
  const outputTranscription = readRecord(serverContent?.outputTranscription ?? serverContent?.output_transcription);
  const events: GoogleLiveServerEvent[] = [];

  const userText = readText(inputTranscription);
  if (userText) events.push({ type: "user_transcript", text: userText, final: turnComplete });
  const assistantText = readText(outputTranscription);
  if (assistantText) events.push({ type: "assistant_transcript", text: assistantText, final: turnComplete });

  const parts = Array.isArray(modelTurn?.parts) ? modelTurn.parts : [];
  for (const part of parts) {
    const inlineData = readRecord(readRecord(part)?.inlineData ?? readRecord(part)?.inline_data);
    if (!inlineData) continue;
    const data = inlineData.data;
    if (typeof data === "string") {
      events.push({ type: "audio", audio: data, mimeType: typeof inlineData.mimeType === "string" ? inlineData.mimeType : "audio/pcm" });
    }
  }

  const error = readRecord(record.error);
  const errorMessage = typeof error?.message === "string" ? error.message : undefined;
  if (errorMessage) events.push({ type: "error", error: errorMessage });
  if (turnComplete) events.push({ type: "closed" });
  return events;
}

export function createGoogleLiveBrowserSession({
  config,
  onUserTranscript,
  onAssistantTranscript,
  onAudio,
  onError,
  WebSocketCtor = WebSocket
}: CreateGoogleLiveBrowserSessionInput): GoogleLiveBrowserSession {
  const normalized = normalizeGoogleLiveVoiceConfig(config);
  let socket: WebSocket | null = null;
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let processor: ScriptProcessorNode | null = null;
  let active = false;

  const emitError = (caught: unknown) => {
    onError?.(caught instanceof Error ? caught : new Error("Google Live session failed."));
  };

  const cleanupAudio = () => {
    processor?.disconnect();
    source?.disconnect();
    void context?.close?.();
    processor = null;
    source = null;
    context = null;
    active = false;
  };

  const sendJson = (message: unknown) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  return {
    start(stream) {
      if (active) return;
      try {
        const AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
        if (!AudioContextCtor) throw new Error("Web Audio capture is unavailable.");
        socket = new WebSocketCtor(buildGoogleLiveWebSocketUrl(normalized));
        socket.addEventListener("open", () => {
          sendJson(buildGoogleLiveSetupMessage(normalized));
        });
        socket.addEventListener("message", (event) => {
          const handle = (text: string) => {
            try {
              const parsed = JSON.parse(text);
              for (const mapped of mapGoogleLiveEvent(parsed)) {
                if (mapped.type === "user_transcript") onUserTranscript?.(mapped.text, mapped.final);
                if (mapped.type === "assistant_transcript") onAssistantTranscript?.(mapped.text, mapped.final);
                if (mapped.type === "audio") onAudio?.(base64PcmToWavBlob(mapped.audio, parseAudioSampleRate(mapped.mimeType)));
                if (mapped.type === "error") emitError(new Error(mapped.error));
              }
            } catch (caught) {
              emitError(caught);
            }
          };
          if (event.data instanceof Blob) {
            event.data.text().then(handle).catch(emitError);
          } else {
            handle(String(event.data));
          }
        });
        socket.addEventListener("error", () => emitError(new Error("Google Live WebSocket failed.")));
        socket.addEventListener("close", cleanupAudio);

        context = new AudioContextCtor();
        source = context.createMediaStreamSource(stream);
        processor = context.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (event) => {
          const samples = mixAndResampleInputBuffer(event.inputBuffer, 16000);
          sendJson({
            realtimeInput: {
              audio: {
                data: bytesToBase64(encodePcm16(samples)),
                mimeType: "audio/pcm;rate=16000"
              }
            }
          });
        };
        source.connect(processor);
        processor.connect(context.destination);
        active = true;
      } catch (caught) {
        cleanupAudio();
        emitError(caught);
      }
    },
    stop() {
      sendJson({ clientContent: { turnComplete: true } });
      socket?.close();
      cleanupAudio();
    },
    isActive() {
      return active;
    },
    sendText(text) {
      const trimmed = text.trim();
      if (!trimmed) return;
      sendJson({
        clientContent: {
          turns: [{ role: "user", parts: [{ text: trimmed }] }],
          turnComplete: true
        }
      });
    }
  };
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function readText(record: Record<string, unknown> | undefined) {
  const text = record?.text;
  return typeof text === "string" ? text.trim() : "";
}

function mixAndResampleInputBuffer(buffer: AudioBuffer, targetSampleRate: number) {
  const mono = new Float32Array(buffer.length);
  for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
    const channel = buffer.getChannelData(channelIndex);
    for (let sampleIndex = 0; sampleIndex < mono.length; sampleIndex += 1) {
      mono[sampleIndex] += channel[sampleIndex] / buffer.numberOfChannels;
    }
  }
  if (buffer.sampleRate === targetSampleRate) return mono;
  const outputLength = Math.max(1, Math.round((mono.length * targetSampleRate) / buffer.sampleRate));
  const output = new Float32Array(outputLength);
  const ratio = buffer.sampleRate / targetSampleRate;
  for (let outputIndex = 0; outputIndex < output.length; outputIndex += 1) {
    const sourceIndex = outputIndex * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(left + 1, mono.length - 1);
    const weight = sourceIndex - left;
    output[outputIndex] = mono[left] * (1 - weight) + mono[right] * weight;
  }
  return output;
}

function encodePcm16(samples: Float32Array) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(input: string) {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function parseAudioSampleRate(mimeType: string) {
  const match = /rate=(\d+)/.exec(mimeType);
  return match ? Number.parseInt(match[1], 10) : 24000;
}

function base64PcmToWavBlob(input: string, sampleRate: number) {
  const pcm = base64ToBytes(input);
  const buffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, pcm.byteLength, true);
  new Uint8Array(buffer, 44).set(pcm);
  return new Blob([buffer], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}

declare global {
  // Safari still exposes webkitAudioContext in some supported browser ranges.
  // eslint-disable-next-line no-var
  var webkitAudioContext: typeof AudioContext | undefined;
}
