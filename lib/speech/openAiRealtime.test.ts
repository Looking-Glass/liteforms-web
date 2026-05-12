import { describe, expect, it } from "vitest";
import {
  buildOpenAiRealtimeSessionUpdateMessage,
  buildOpenAiRealtimeWebSocketProtocols,
  buildOpenAiRealtimeWebSocketUrl,
  mapOpenAiRealtimeEvent,
  normalizeOpenAiRealtimeVoiceConfig,
  validateOpenAiRealtimeWebSocketUrl
} from "./openAiRealtime";

describe("OpenAI Realtime voice", () => {
  it("normalizes OpenAI as an end-to-end realtime voice capability", () => {
    expect(normalizeOpenAiRealtimeVoiceConfig({ provider: "openai-realtime", credential: "sk-test" })).toMatchObject({
      provider: "openai-realtime",
      model: "gpt-realtime-2",
      voice: "coral",
      language: "en-US",
      websocketUrl: "wss://api.openai.com/v1/realtime"
    });
  });

  it("builds a GA realtime session.update message for audio in and audio out", () => {
    expect(
      buildOpenAiRealtimeSessionUpdateMessage({
        provider: "openai-realtime",
        model: "gpt-realtime-2",
        voice: "marin",
        instructions: "Keep replies brief."
      })
    ).toMatchObject({
      type: "session.update",
      session: {
        type: "realtime",
        model: "gpt-realtime-2",
        output_modalities: ["audio"],
        instructions: "Keep replies brief.",
        audio: {
          input: {
            format: { type: "audio/pcm", rate: 24000 },
            transcription: { model: "gpt-4o-transcribe", language: "en" },
            turn_detection: { type: "server_vad" }
          },
          output: {
            format: { type: "audio/pcm", rate: 24000 },
            voice: "marin"
          }
        }
      }
    });
  });

  it("uses the browser WebSocket subprotocol auth shape documented by OpenAI", () => {
    expect(buildOpenAiRealtimeWebSocketUrl({ provider: "openai-realtime", model: "gpt-realtime-2" })).toBe(
      "wss://api.openai.com/v1/realtime?model=gpt-realtime-2"
    );
    expect(buildOpenAiRealtimeWebSocketProtocols({ provider: "openai-realtime", credential: "sk-test" })).toEqual([
      "realtime",
      "openai-insecure-api-key.sk-test"
    ]);
  });

  it("allows only trusted OpenAI Realtime WebSocket endpoints", () => {
    expect(() => validateOpenAiRealtimeWebSocketUrl("wss://attacker.test/v1/realtime")).toThrow("Untrusted OpenAI Realtime WebSocket host");
    expect(() => validateOpenAiRealtimeWebSocketUrl("https://api.openai.com/v1/realtime")).toThrow(
      "OpenAI Realtime WebSocket URL must use wss://"
    );
  });

  it("maps transcripts, audio, speech start, and errors from GA and compatibility event names", () => {
    expect(mapOpenAiRealtimeEvent({ type: "input_audio_buffer.speech_started" })).toEqual([{ type: "speech_start" }]);
    expect(mapOpenAiRealtimeEvent({ type: "conversation.item.input_audio_transcription.completed", transcript: "hello" })).toEqual([
      { type: "user_transcript", text: "hello", final: true }
    ]);
    expect(mapOpenAiRealtimeEvent({ type: "response.output_audio_transcript.delta", delta: "hi" })).toEqual([
      { type: "assistant_transcript", text: "hi", final: false }
    ]);
    expect(mapOpenAiRealtimeEvent({ type: "response.output_audio.delta", delta: "AAAA" })).toEqual([
      { type: "audio", audio: "AAAA", mimeType: "audio/pcm;rate=24000" }
    ]);
    expect(mapOpenAiRealtimeEvent({ type: "response.audio.delta", delta: "BBBB" })).toEqual([
      { type: "audio", audio: "BBBB", mimeType: "audio/pcm;rate=24000" }
    ]);
    expect(mapOpenAiRealtimeEvent({ type: "error", error: { message: "bad request" } })).toEqual([{ type: "error", error: "bad request" }]);
  });
});
