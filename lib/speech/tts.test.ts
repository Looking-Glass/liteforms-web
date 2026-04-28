import { describe, expect, it, vi } from "vitest";
import { createTtsAdapter, splitSpeakableText } from "./tts";
import type { TtsWorkerLike } from "./types";

describe("TTS adapters", () => {
  it("splits streamed assistant text into speakable chunks", () => {
    expect(splitSpeakableText("Hello there. How are you? Fine")).toEqual({
      chunks: ["Hello there.", "How are you?"],
      remainder: "Fine"
    });
  });

  it("uses a Kokoro worker for local browser speech with word timings", async () => {
    const worker: TtsWorkerLike = {
      synthesize: vi.fn(async () => ({
        audio: new ArrayBuffer(4),
        sampleRate: 24000,
        mimeType: "audio/pcm",
        words: [{ word: "hello", start: 0, end: 0.25 }]
      }))
    };
    const adapter = createTtsAdapter({ config: { provider: "kokoro" }, worker });

    await expect(adapter.synthesize("hello")).resolves.toMatchObject({
      sampleRate: 24000,
      words: [{ word: "hello", start: 0, end: 0.25 }]
    });
    expect(worker.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ text: "hello", voice: "af_bella", device: "webgpu", dtype: "fp32" })
    );
  });

  it("calls ElevenLabs TTS directly from the browser", async () => {
    const fetchMock = vi.fn(async () => new Response(new ArrayBuffer(3), { headers: { "content-type": "audio/mpeg" } }));
    const adapter = createTtsAdapter({
      config: { provider: "elevenlabs", credential: "el-key", voiceId: "Rachel" },
      fetch: fetchMock
    });

    await expect(adapter.synthesize("Hi")).resolves.toMatchObject({ mimeType: "audio/mpeg" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/text-to-speech/Rachel/stream",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "xi-api-key": "el-key" })
      })
    );
  });

  it("calls Deepgram TTS directly from the browser", async () => {
    const fetchMock = vi.fn(async () => new Response(new ArrayBuffer(3), { headers: { "content-type": "audio/wav" } }));
    const adapter = createTtsAdapter({
      config: { provider: "deepgram", credential: "dg-key", voice: "aura-asteria-en" },
      fetch: fetchMock
    });

    await adapter.synthesize("Hi");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepgram.com/v1/speak?model=aura-asteria-en",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Token dg-key" })
      })
    );
  });
});
