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
      "https://api.deepgram.com/v1/listen?model=nova-3",
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
  it("calls OpenAI STT with Bearer auth at /audio/transcriptions using multipart form", async () => {
    const fetchMock = vi.fn(async () => Response.json({ text: "hello world" }));
    const adapter = createAsrAdapter({ config: { provider: "openai", credential: "sk-key" }, fetch: fetchMock });

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
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("model")).toBe("gpt-4o-transcribe");
  });

  it("calls xAI STT via OpenAI-compatible endpoint with Bearer auth", async () => {
    const fetchMock = vi.fn(async () => Response.json({ text: "xai heard you" }));
    const adapter = createAsrAdapter({ config: { provider: "xai", credential: "xai-key" }, fetch: fetchMock });

    await expect(adapter.transcribe(new Blob(["audio"]))).resolves.toMatchObject({ text: "xai heard you" });
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.x.ai/v1/audio/transcriptions");
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe("Bearer xai-key");
  });

  it("calls Mistral STT via OpenAI-compatible endpoint with Bearer auth", async () => {
    const fetchMock = vi.fn(async () => Response.json({ text: "mistral heard you" }));
    const adapter = createAsrAdapter({ config: { provider: "mistral", credential: "mist-key" }, fetch: fetchMock });

    await expect(adapter.transcribe(new Blob(["audio"]))).resolves.toMatchObject({ text: "mistral heard you" });
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mistral.ai/v1/audio/transcriptions");
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe("Bearer mist-key");
    const body = opts.body as FormData;
    expect(body.get("model")).toBe("voxtral-mini-transcribe-realtime-2602");
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
