import { describe, expect, it, vi } from "vitest";
import {
  buildProviderFinalizeMessages,
  buildProviderWsRequest,
  createProviderRealtimeSession,
  mapProviderEvent,
  normalizeCloudRealtimeAsrConfig,
  type CloudRealtimeAsrConfig
} from "./asrRealtimeRelay";

class MockProviderWebSocket {
  static latest: MockProviderWebSocket | null = null;
  static OPEN = 1;

  readyState = MockProviderWebSocket.OPEN;
  sent: Array<string | ArrayBuffer | Uint8Array> = [];
  handlers: Record<string, Array<(event: unknown) => void>> = {};

  constructor(
    public readonly url: string,
    _protocols?: string | string[],
    public readonly options?: { headers?: Record<string, string> }
  ) {
    MockProviderWebSocket.latest = this;
  }

  addEventListener(type: "open" | "message" | "error" | "close", handler: (event: unknown) => void) {
    this.handlers[type] ??= [];
    this.handlers[type].push(handler);
  }

  send(data: string | ArrayBuffer | Uint8Array) {
    this.sent.push(data);
  }

  close() {
    this.handlers.close?.forEach((handler) => handler({}));
  }

  emit(type: string, event: unknown = {}) {
    this.handlers[type]?.forEach((handler) => handler(event));
  }
}

const baseConfig: CloudRealtimeAsrConfig = {
  provider: "deepgram",
  credential: "key",
  baseUrl: "https://api.deepgram.com/v1",
  model: "nova-3",
  language: "en",
  sampleRate: 8000,
  encoding: "mulaw",
  endpointingMs: 800,
  interimResults: true
};

describe("cloud realtime ASR relay parity", () => {
  it("normalizes OpenClaw realtime defaults for STT-only providers", () => {
    expect(normalizeCloudRealtimeAsrConfig({ provider: "deepgram", credential: "dg" })).toMatchObject({
      provider: "deepgram",
      model: "nova-3",
      sampleRate: 8000,
      encoding: "mulaw",
      endpointingMs: 800
    });
    expect(normalizeCloudRealtimeAsrConfig({ provider: "elevenlabs", credential: "el" })).toMatchObject({
      provider: "elevenlabs",
      model: "scribe_v2_realtime",
      sampleRate: 8000,
      encoding: "mulaw"
    });
    expect(normalizeCloudRealtimeAsrConfig({ provider: "openai", credential: "oa" })).toMatchObject({
      provider: "openai",
      model: "gpt-4o-transcribe",
      sampleRate: 8000,
      encoding: "mulaw"
    });
    expect(normalizeCloudRealtimeAsrConfig({ provider: "mistral", credential: "mi" })).toMatchObject({
      provider: "mistral",
      model: "voxtral-mini-transcribe-realtime-2602",
      sampleRate: 8000,
      encoding: "pcm_mulaw"
    });
    expect(normalizeCloudRealtimeAsrConfig({ provider: "xai", credential: "x" })).toMatchObject({
      provider: "xai",
      sampleRate: 8000,
      encoding: "mulaw"
    });
  });

  it("builds provider websocket URLs with server-side auth headers", () => {
    expect(buildProviderWsRequest(baseConfig)).toMatchObject({
      url: expect.stringContaining("wss://api.deepgram.com/v1/listen?"),
      headers: { Authorization: "Token key" },
      readyOnOpen: true
    });
    expect(buildProviderWsRequest({ ...baseConfig, provider: "elevenlabs", baseUrl: "https://api.elevenlabs.io/v1", model: "scribe_v2_realtime" })).toMatchObject({
      url: expect.stringContaining("wss://api.elevenlabs.io/v1/speech-to-text/realtime?"),
      headers: { "xi-api-key": "key" }
    });
    expect(buildProviderWsRequest({ ...baseConfig, provider: "openai" })).toMatchObject({
      url: "wss://api.openai.com/v1/realtime?intent=transcription",
      headers: { Authorization: "Bearer key", "OpenAI-Beta": "realtime=v1" }
    });
  });

  it("maps provider partial and final events into normalized relay messages", () => {
    expect(mapProviderEvent(baseConfig, { type: "Results", channel: { alternatives: [{ transcript: "hello" }] } })).toEqual([
      { type: "partial", text: "hello" }
    ]);
    expect(mapProviderEvent(baseConfig, { type: "Results", is_final: true, channel: { alternatives: [{ transcript: "done" }] } })).toEqual([
      { type: "transcript", text: "done" }
    ]);
    expect(mapProviderEvent({ ...baseConfig, provider: "openai" }, { type: "conversation.item.input_audio_transcription.completed", transcript: "final" })).toEqual([
      { type: "transcript", text: "final" }
    ]);
    expect(mapProviderEvent({ ...baseConfig, provider: "mistral" }, { type: "session.created" })).toEqual([{ type: "ready" }]);
    expect(mapProviderEvent({ ...baseConfig, provider: "xai" }, { type: "transcript.done", text: "x final" })).toEqual([
      { type: "transcript", text: "x final" },
      { type: "closed" }
    ]);
  });

  it("bounds queued audio before provider readiness and flushes once ready", async () => {
    const messages: unknown[] = [];
    const session = createProviderRealtimeSession({
      config: { ...baseConfig, provider: "elevenlabs", baseUrl: "https://api.elevenlabs.io/v1", model: "scribe_v2_realtime" },
      WebSocketCtor: MockProviderWebSocket,
      onMessage: (message) => messages.push(message),
      maxQueuedBytes: 5
    });

    const connecting = session.connect();
    MockProviderWebSocket.latest!.emit("open");
    session.sendAudio(new Uint8Array([1, 2, 3, 4]));
    session.sendAudio(new Uint8Array([5, 6, 7, 8]));
    expect(MockProviderWebSocket.latest!.sent).toHaveLength(0);

    MockProviderWebSocket.latest!.emit("message", { data: JSON.stringify({ message_type: "session_started" }) });
    await connecting;

    expect(messages).toContainEqual({ type: "ready" });
    expect(MockProviderWebSocket.latest!.sent).toHaveLength(1);
    expect(String(MockProviderWebSocket.latest!.sent[0])).toContain("audio_base_64");
  });

  it("sends provider-specific finalize messages on close", () => {
    expect(buildProviderFinalizeMessages(baseConfig).map(String)).toEqual(['{"type":"Finalize"}']);
    expect(buildProviderFinalizeMessages({ ...baseConfig, provider: "mistral" }).map(String)).toEqual([
      '{"type":"input_audio.flush"}',
      '{"type":"input_audio.end"}'
    ]);
    expect(buildProviderFinalizeMessages({ ...baseConfig, provider: "xai" }).map(String)).toEqual(['{"type":"audio.done"}']);
  });

  it("surfaces upstream connection errors", async () => {
    const onError = vi.fn();
    const session = createProviderRealtimeSession({
      config: baseConfig,
      WebSocketCtor: MockProviderWebSocket,
      onMessage: vi.fn(),
      onError
    });
    const connecting = session.connect();
    MockProviderWebSocket.latest!.emit("error", new Error("upstream failed"));
    await expect(connecting).rejects.toThrow("upstream failed");
    expect(onError).toHaveBeenCalled();
  });
});
