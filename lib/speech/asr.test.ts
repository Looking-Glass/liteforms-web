import { afterEach, describe, expect, it, vi } from "vitest";
import { createAsrAdapter } from "./asr";
import type { AsrWorkerLike } from "./types";

describe("ASR adapters", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses a Distil-Whisper worker for local transcription", async () => {
    const worker: AsrWorkerLike = {
      transcribe: vi.fn(async () => ({ text: "hello world", language: "en" }))
    };
    stubAudioContext();
    const adapter = createAsrAdapter({ config: { provider: "distil-whisper" }, worker });

    await expect(adapter.transcribe(new Blob(["audio"]))).resolves.toMatchObject({ text: "hello world" });
    expect(worker.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "onnx-community/distil-small.en",
        dtype: "q4",
        audio: expect.any(Float32Array)
      })
    );
  });

  it("calls Deepgram STT directly from the browser", async () => {
    const fetchMock = vi.fn(async () => Response.json({ results: { channels: [{ alternatives: [{ transcript: "hi" }] }] } }));
    const adapter = createAsrAdapter({ config: { provider: "deepgram", credential: "dg-key" }, fetch: fetchMock });

    await expect(adapter.transcribe(new Blob(["audio"], { type: "audio/webm" }))).resolves.toMatchObject({ text: "hi" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepgram.com/v1/listen?model=nova-3&language=en",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Authorization: "Token dg-key" }) })
    );
  });

  it("calls ElevenLabs STT directly from the browser", async () => {
    const fetchMock = vi.fn(async () => Response.json({ text: "hello from scribe" }));
    const adapter = createAsrAdapter({ config: { provider: "elevenlabs", credential: "el-key" }, fetch: fetchMock });

    await expect(adapter.transcribe(new Blob(["audio"], { type: "audio/webm" }))).resolves.toMatchObject({
      text: "hello from scribe"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/speech-to-text",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "xi-api-key": "el-key" }) })
    );
  });
});

// ── New STT adapters ───────────────────────────────────────────────────────────

describe("new STT adapters", () => {
  function mockFetch(fn: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>) {
    return vi.fn(fn);
  }

  function firstFetchCall(fetchMock: ReturnType<typeof mockFetch>): { url: string; init: RequestInit } {
    const [input, init] = fetchMock.mock.calls[0];
    expect(init).toBeDefined();
    return { url: String(input), init: init as RequestInit };
  }

  it("calls OpenAI STT with Bearer auth at /audio/transcriptions using multipart form", async () => {
    const fetchMock = mockFetch(async () => Response.json({ text: "hello world" }));
    const adapter = createAsrAdapter({ config: { provider: "openai", credential: "sk-key", language: " en ", prompt: " say names literally " }, fetch: fetchMock });

    await expect(adapter.transcribe(new Blob(["audio"], { type: "audio/webm" }))).resolves.toMatchObject({
      text: "hello world"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-key" })
      })
    );
    const body = firstFetchCall(fetchMock).init.body as FormData;
    expect(body.get("model")).toBe("gpt-4o-transcribe");
    expect(body.get("language")).toBe("en");
    expect(body.get("prompt")).toBe("say names literally");
  });

  it("calls xAI STT at /stt with Bearer auth and default model", async () => {
    const fetchMock = mockFetch(async () => Response.json({ text: "xai heard you" }));
    const adapter = createAsrAdapter({ config: { provider: "xai", credential: "xai-key" }, fetch: fetchMock });

    await expect(adapter.transcribe(new Blob(["audio"]))).resolves.toMatchObject({ text: "xai heard you" });
    const { url, init: opts } = firstFetchCall(fetchMock);
    expect(url).toBe("https://api.x.ai/v1/stt");
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe("Bearer xai-key");
    expect((opts.body as FormData).get("model")).toBe("grok-stt");
  });

  it("calls Mistral STT via OpenAI-compatible endpoint with Bearer auth", async () => {
    const fetchMock = mockFetch(async () => Response.json({ text: "mistral heard you" }));
    const adapter = createAsrAdapter({ config: { provider: "mistral", credential: "mist-key" }, fetch: fetchMock });

    await expect(adapter.transcribe(new Blob(["audio"]))).resolves.toMatchObject({ text: "mistral heard you" });
    const { url, init: opts } = firstFetchCall(fetchMock);
    expect(url).toBe("https://api.mistral.ai/v1/audio/transcriptions");
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe("Bearer mist-key");
    const body = opts.body as FormData;
    expect(body.get("model")).toBe("voxtral-mini-latest");
  });

  it("calls ElevenLabs STT with scribe_v2 plus language and prompt fields", async () => {
    const fetchMock = mockFetch(async () => Response.json({ text: "hello from scribe" }));
    const adapter = createAsrAdapter({
      config: { provider: "elevenlabs", credential: "el-key", language: " en ", prompt: " spell product names " },
      fetch: fetchMock
    });

    await adapter.transcribe(new Blob(["audio"], { type: "audio/webm" }));
    const { init } = firstFetchCall(fetchMock);
    const body = init.body as FormData;
    expect(body.get("model_id")).toBe("scribe_v2");
    expect(body.get("language_code")).toBe("en");
    expect(body.get("prompt")).toBe("spell product names");
  });

  it("calls Deepgram STT with language in URL and raw byte upload", async () => {
    const fetchMock = mockFetch(async () => Response.json({ results: { channels: [{ alternatives: [{ transcript: "hi" }] }] } }));
    const adapter = createAsrAdapter({ config: { provider: "deepgram", credential: "dg-key", language: " en " }, fetch: fetchMock });

    await adapter.transcribe(new Blob(["audio"], { type: "audio/webm" }));
    const { url, init } = firstFetchCall(fetchMock);
    expect(url).toBe("https://api.deepgram.com/v1/listen?model=nova-3&language=en");
    expect(init.body).toBeInstanceOf(Uint8Array);
  });

});

function stubAudioContext() {
  class FakeAudioContext {
    constructor(_options?: AudioContextOptions) {}

    async decodeAudioData(_audioData: ArrayBuffer) {
      return {
        length: 3,
        numberOfChannels: 2,
        getChannelData(channel: number) {
          return channel === 0 ? new Float32Array([1, 0, -1]) : new Float32Array([0.5, 0, -0.5]);
        }
      } as AudioBuffer;
    }

    async close() {}
  }

  vi.stubGlobal("AudioContext", FakeAudioContext);
}
