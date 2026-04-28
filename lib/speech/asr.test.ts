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
