import { describe, expect, it, vi } from "vitest";
import { createTtsAdapter, extractGoogleInlineData, splitSpeakableText, IncrementalSpeechBuffer, rewriteDecimalsForTts } from "./tts";
import type { TtsWorkerLike } from "./types";

// ── IncrementalSpeechBuffer ────────────────────────────────────────────────────

describe("IncrementalSpeechBuffer", () => {
  it("returns no segments when text has no complete sentence yet", () => {
    const buf = new IncrementalSpeechBuffer();
    expect(buf.ingest("Hello there", false)).toEqual([]);
  });

  it("extracts a segment on a period boundary", () => {
    const buf = new IncrementalSpeechBuffer();
    expect(buf.ingest("Hello there.", false)).toEqual(["Hello there."]);
  });

  it("extracts a segment on a question mark boundary", () => {
    const buf = new IncrementalSpeechBuffer();
    expect(buf.ingest("How are you?", false)).toEqual(["How are you?"]);
  });

  it("extracts a segment on an exclamation mark boundary", () => {
    const buf = new IncrementalSpeechBuffer();
    expect(buf.ingest("Great!", false)).toEqual(["Great!"]);
  });

  it("extracts a segment on a newline boundary", () => {
    const buf = new IncrementalSpeechBuffer();
    expect(buf.ingest("First line\nSecond", false)).toEqual(["First line"]);
  });

  it("extracts multiple sentences from a single chunk", () => {
    const buf = new IncrementalSpeechBuffer();
    expect(buf.ingest("Hello there. How are you? Fine!", false)).toEqual([
      "Hello there.",
      "How are you?",
      "Fine!"
    ]);
  });

  it("accumulates text across multiple ingest calls", () => {
    const buf = new IncrementalSpeechBuffer();
    expect(buf.ingest("Hello th", false)).toEqual([]);
    expect(buf.ingest("ere. How are you?", false)).toEqual(["Hello there.", "How are you?"]);
  });

  it("does not re-emit already extracted text", () => {
    const buf = new IncrementalSpeechBuffer();
    buf.ingest("Hello there. ", false);
    expect(buf.ingest("How are you?", false)).toEqual(["How are you?"]);
  });

  it("does not split at abbreviation Dr.", () => {
    const buf = new IncrementalSpeechBuffer();
    expect(buf.ingest("Dr. Smith said hello.", false)).toEqual(["Dr. Smith said hello."]);
  });

  it("does not split at abbreviation Mr. within a sentence", () => {
    const buf = new IncrementalSpeechBuffer();
    expect(buf.ingest("Mr. Jones arrived. Good.", false)).toEqual(["Mr. Jones arrived.", "Good."]);
  });

  it("does not split at other common abbreviations", () => {
    const buf = new IncrementalSpeechBuffer();
    expect(buf.ingest("Prof. Lee and Mrs. Kim met. Done.", false)).toEqual([
      "Prof. Lee and Mrs. Kim met.",
      "Done."
    ]);
  });

  it("does not split at decimal numbers", () => {
    const buf = new IncrementalSpeechBuffer();
    expect(buf.ingest("The price is 18.5 dollars. Good deal!", false)).toEqual([
      "The price is 18.5 dollars.",
      "Good deal!"
    ]);
  });

  it("does not split at decimal numbers mid-stream", () => {
    const buf = new IncrementalSpeechBuffer();
    expect(buf.ingest("Pi is 3.14159 approximately", false)).toEqual([]);
  });

  it("skips text inside triple-backtick code fences and does not include it in segments", () => {
    const buf = new IncrementalSpeechBuffer();
    expect(buf.ingest("Here is code. ```\nprint('hi')\n``` Done.", false)).toEqual([
      "Here is code.",
      "Done."
    ]);
  });

  it("does not split at punctuation inside a code fence", () => {
    const buf = new IncrementalSpeechBuffer();
    // The "end." inside the fence should NOT produce a segment
    const segments = buf.ingest("See this. ```\nreturn x.end()\n``` That's all.", false);
    expect(segments).not.toContain("return x.end()");
    expect(segments.some((s) => s.includes("return"))).toBe(false);
  });

  it("extracts a soft-boundary segment after 256+ visible chars with whitespace", () => {
    const buf = new IncrementalSpeechBuffer();
    const longText = "a".repeat(257) + " continued text";
    const segments = buf.ingest(longText, false);
    expect(segments).toHaveLength(1);
    expect(segments[0].length).toBeGreaterThanOrEqual(257);
  });

  it("does not split below the 256-char soft boundary threshold", () => {
    const buf = new IncrementalSpeechBuffer();
    expect(buf.ingest("a".repeat(200) + " continued", false)).toEqual([]);
  });

  it("flushes remaining text when isFinal is true", () => {
    const buf = new IncrementalSpeechBuffer();
    expect(buf.ingest("No punctuation here", true)).toEqual(["No punctuation here"]);
  });

  it("flushes buffered partial text on a subsequent isFinal call", () => {
    const buf = new IncrementalSpeechBuffer();
    buf.ingest("First sentence. Remaining", false);
    expect(buf.ingest("", true)).toEqual(["Remaining"]);
  });

  it("returns empty array for empty isFinal flush when nothing is buffered", () => {
    const buf = new IncrementalSpeechBuffer();
    buf.ingest("All done.", false);
    expect(buf.ingest("", true)).toEqual([]);
  });

  it("reset clears buffer state for reuse", () => {
    const buf = new IncrementalSpeechBuffer();
    buf.ingest("Partial text", false);
    buf.reset();
    expect(buf.ingest("Fresh start.", false)).toEqual(["Fresh start."]);
  });
});

// ── rewriteDecimalsForTts ──────────────────────────────────────────────────────

describe("rewriteDecimalsForTts", () => {
  it("rewrites a standalone decimal number", () => {
    expect(rewriteDecimalsForTts("18.5")).toBe("18 point 5");
  });

  it("rewrites a decimal embedded in a sentence", () => {
    expect(rewriteDecimalsForTts("The temperature is 98.6 degrees.")).toBe(
      "The temperature is 98 point 6 degrees."
    );
  });

  it("rewrites multiple decimals in the same text", () => {
    expect(rewriteDecimalsForTts("Pi is 3.14 and e is 2.71.")).toBe(
      "Pi is 3 point 14 and e is 2 point 71."
    );
  });

  it("does not affect sentence-ending periods", () => {
    expect(rewriteDecimalsForTts("Hello. World.")).toBe("Hello. World.");
  });

  it("handles leading-zero decimals", () => {
    expect(rewriteDecimalsForTts("Only 0.5 left.")).toBe("Only 0 point 5 left.");
  });

  it("handles multi-digit fractional parts", () => {
    expect(rewriteDecimalsForTts("Pi is approximately 3.14159.")).toBe(
      "Pi is approximately 3 point 14159."
    );
  });

  it("does not rewrite a period that is not between digits", () => {
    expect(rewriteDecimalsForTts("Go to example.com today.")).toBe("Go to example.com today.");
  });
});

// ── Existing TTS adapter tests ─────────────────────────────────────────────────

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

// ── extractGoogleInlineData ────────────────────────────────────────────────────

describe("extractGoogleInlineData", () => {
  const b64 = btoa(String.fromCharCode(1, 2, 3));

  it("extracts camelCase inlineData from a well-formed response", () => {
    const payload = { candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/l16; rate=24000", data: b64 } }] } }] };
    const result = extractGoogleInlineData(payload);
    expect(result?.data).toBe(b64);
    expect(result?.mimeType).toBe("audio/l16; rate=24000");
  });

  it("extracts snake_case inline_data from response", () => {
    const payload = { candidates: [{ content: { parts: [{ inline_data: { mimeType: "audio/l16; rate=24000", data: b64 } }] } }] };
    expect(extractGoogleInlineData(payload)?.data).toBe(b64);
  });

  it("prefers inlineData over inline_data when both present", () => {
    const payload = { candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/wav", data: b64 }, inline_data: { mimeType: "audio/junk", data: "other" } }] } }] };
    expect(extractGoogleInlineData(payload)?.mimeType).toBe("audio/wav");
  });

  it("extracts snake_case mime_type from inline part", () => {
    const payload = { candidates: [{ content: { parts: [{ inlineData: { mime_type: "audio/l16; rate=24000", data: b64 } }] } }] };
    expect(extractGoogleInlineData(payload)?.mimeType).toBe("audio/l16; rate=24000");
  });

  it("skips parts with no data and returns the first part that has data", () => {
    const payload = { candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/wav", data: "" } }, { inlineData: { mimeType: "audio/wav", data: b64 } }] } }] };
    expect(extractGoogleInlineData(payload)?.data).toBe(b64);
  });

  it("returns undefined for empty candidates", () => {
    expect(extractGoogleInlineData({ candidates: [] })).toBeUndefined();
  });

  it("returns undefined when payload is null", () => {
    expect(extractGoogleInlineData(null)).toBeUndefined();
  });

  it("returns undefined when parts have no inlineData", () => {
    const payload = { candidates: [{ content: { parts: [{ text: "hello" }] } }] };
    expect(extractGoogleInlineData(payload)).toBeUndefined();
  });
});

// ── New TTS adapters ───────────────────────────────────────────────────────────

describe("new TTS adapters", () => {
  function audioResponse() {
    return new Response(new ArrayBuffer(4), { headers: { "content-type": "audio/mpeg" } });
  }

  /** Vitest's `vi.fn()` infers `mock.calls` as empty tuples unless the mock is typed like `fetch`. */
  function mockFetch(fn: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>) {
    return vi.fn(fn);
  }

  /** `Parameters<typeof fetch>` marks `init` optional; these tests always pass RequestInit. */
  function firstFetchCall(fetchMock: ReturnType<typeof mockFetch>): { url: string; init: RequestInit } {
    const [input, init] = fetchMock.mock.calls[0];
    expect(init).toBeDefined();
    return { url: String(input), init: init as RequestInit };
  }

  it("calls OpenAI TTS with Bearer auth at /audio/speech endpoint", async () => {
    const fetchMock = mockFetch(async () => audioResponse());
    const adapter = createTtsAdapter({
      config: { provider: "openai", credential: "sk-key", voice: "coral" },
      fetch: fetchMock
    });

    await adapter.synthesize("Hello");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/audio/speech",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-key" })
      })
    );
    const { init } = firstFetchCall(fetchMock);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: "gpt-4o-mini-tts", input: "Hello", voice: "coral" });
  });

  it("OpenAI TTS includes speed and instructions only when configured", async () => {
    const fetchMock = mockFetch(async () => audioResponse());
    const adapter = createTtsAdapter({
      config: {
        provider: "openai",
        credential: "sk-key",
        voice: "coral",
        speed: 1.25,
        instructions: "Speak warmly."
      },
      fetch: fetchMock
    });

    await adapter.synthesize("Hello");
    const configuredBody = JSON.parse(firstFetchCall(fetchMock).init.body as string);
    expect(configuredBody).toMatchObject({ speed: 1.25, instructions: "Speak warmly." });

    const fetchWithoutExtras = mockFetch(async () => audioResponse());
    const adapterWithoutExtras = createTtsAdapter({
      config: { provider: "openai", credential: "sk-key", voice: "coral" },
      fetch: fetchWithoutExtras
    });

    await adapterWithoutExtras.synthesize("Hello");
    const defaultBody = JSON.parse(firstFetchCall(fetchWithoutExtras).init.body as string);
    expect(defaultBody).not.toHaveProperty("speed");
    expect(defaultBody).not.toHaveProperty("instructions");
  });

  it("calls Google TTS with API key in URL and parses base64 audio from JSON", async () => {
    const b64 = btoa(String.fromCharCode(1, 2, 3));
    const fetchMock = mockFetch(async () =>
      Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/wav", data: b64 } }] } }] })
    );
    const adapter = createTtsAdapter({
      config: { provider: "google", credential: "goog-key", voice: "Kore" },
      fetch: fetchMock
    });

    const result = await adapter.synthesize("Hello");
    expect(result.mimeType).toBe("audio/wav");
    expect(result.audio.byteLength).toBe(3);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("key=goog-key");
    expect(url).toContain("gemini-3.1-flash-tts-preview");
  });

  it("Google TTS retries once after a transient server error", async () => {
    const b64 = btoa(String.fromCharCode(1, 2, 3));
    const fetchMock = mockFetch(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return new Response("temporary failure", { status: 500 });
      }
      return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/wav", data: b64 } }] } }] });
    });
    const adapter = createTtsAdapter({
      config: { provider: "google", credential: "goog-key", voice: "Kore" },
      fetch: fetchMock
    });

    const result = await adapter.synthesize("Hello");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.mimeType).toBe("audio/wav");
    expect(result.audio.byteLength).toBe(3);
  });

  it("Google TTS: normalises audio/l16 PCM mime type to audio/pcm with correct sampleRate", async () => {
    const b64 = btoa(String.fromCharCode(1, 2, 3));
    const fetchMock = mockFetch(async () =>
      Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/l16; rate=24000; channels=1", data: b64 } }] } }] })
    );
    const adapter = createTtsAdapter({
      config: { provider: "google", credential: "goog-key", voice: "Aoede" },
      fetch: fetchMock
    });

    const result = await adapter.synthesize("Hi");
    expect(result.mimeType).toBe("audio/pcm");
    expect(result.sampleRate).toBe(24000);
    expect(result.audio.byteLength).toBe(3);
  });

  it("Google TTS: accepts snake_case inline_data key from the API response", async () => {
    const b64 = btoa(String.fromCharCode(4, 5, 6));
    const fetchMock = mockFetch(async () =>
      Response.json({ candidates: [{ content: { parts: [{ inline_data: { mimeType: "audio/l16; rate=24000", data: b64 } }] } }] })
    );
    const adapter = createTtsAdapter({
      config: { provider: "google", credential: "goog-key", voice: "Kore" },
      fetch: fetchMock
    });

    const result = await adapter.synthesize("Hi");
    expect(result.mimeType).toBe("audio/pcm");
    expect(result.audio.byteLength).toBe(3);
  });

  it("Google TTS: accepts snake_case mime_type inside inlineData", async () => {
    const b64 = btoa(String.fromCharCode(7, 8, 9));
    const fetchMock = mockFetch(async () =>
      Response.json({ candidates: [{ content: { parts: [{ inlineData: { mime_type: "audio/l16; rate=24000", data: b64 } }] } }] })
    );
    const adapter = createTtsAdapter({
      config: { provider: "google", credential: "goog-key", voice: "Kore" },
      fetch: fetchMock
    });

    const result = await adapter.synthesize("Hi");
    expect(result.mimeType).toBe("audio/pcm");
    expect(result.sampleRate).toBe(24000);
  });

  it("Google TTS: throws when candidates array is empty", async () => {
    const fetchMock = mockFetch(async () =>
      Response.json({ candidates: [] })
    );
    const adapter = createTtsAdapter({
      config: { provider: "google", credential: "goog-key", voice: "Kore" },
      fetch: fetchMock
    });

    await expect(adapter.synthesize("Hi")).rejects.toThrow("no audio in response");
  });

  it("calls xAI TTS with Bearer auth (OpenAI-compatible) at x.ai endpoint", async () => {
    const fetchMock = mockFetch(async () => audioResponse());
    const adapter = createTtsAdapter({
      config: { provider: "xai", credential: "xai-key", voice: "eve" },
      fetch: fetchMock
    });

    await adapter.synthesize("Hello");
    const { url, init: opts } = firstFetchCall(fetchMock);
    expect(url).toBe("https://api.x.ai/v1/audio/speech");
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe("Bearer xai-key");
    const body = JSON.parse(opts.body as string);
    expect(body.voice).toBe("eve");
  });

  it("calls DeepInfra TTS with Bearer auth at deepinfra endpoint", async () => {
    const fetchMock = mockFetch(async () => audioResponse());
    const adapter = createTtsAdapter({
      config: { provider: "deepinfra", credential: "di-key", voice: "af_alloy" },
      fetch: fetchMock
    });

    await adapter.synthesize("Hello");
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.deepinfra.com/v1/openai/audio/speech");
  });

  it("calls OpenRouter TTS with Bearer auth at openrouter endpoint", async () => {
    const fetchMock = mockFetch(async () => audioResponse());
    const adapter = createTtsAdapter({
      config: { provider: "openrouter", credential: "or-key", voice: "af_alloy" },
      fetch: fetchMock
    });

    await adapter.synthesize("Hello");
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://openrouter.ai/api/v1/audio/speech");
  });

  it("calls MiniMax TTS v2 and passes voice speed, volume, and pitch", async () => {
    const hexAudio = "010203"; // bytes [1,2,3]
    const fetchMock = mockFetch(async () =>
      Response.json({ base_resp: { status_code: 0 }, data: { audio: hexAudio } })
    );
    const adapter = createTtsAdapter({
      config: { provider: "minimax", credential: "mm-key", voice: "English_expressive_narrator", speed: 1.2, vol: 0.8, pitch: -1 },
      fetch: fetchMock
    });

    const result = await adapter.synthesize("Hello");
    expect(result.audio.byteLength).toBe(3);
    const { url, init: opts } = firstFetchCall(fetchMock);
    expect(String(url)).toContain("minimax.io");
    expect(String(url)).toContain("t2a_v2");
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe("Bearer mm-key");
    const body = JSON.parse(opts.body as string);
    expect(body).toMatchObject({
      model: "speech-2.8-hd",
      text: "Hello",
      voice_setting: { voice_id: "English_expressive_narrator", speed: 1.2, vol: 0.8, pitch: -1 },
      audio_setting: { sample_rate: 32000, format: "mp3" }
    });
    expect(body).not.toHaveProperty("stream");
    expect(body.audio_setting).not.toHaveProperty("bitrate");
    expect(body.audio_setting).not.toHaveProperty("channel");
  });

  it("calls Inworld streaming TTS with Basic auth and concatenates NDJSON audio chunks", async () => {
    const first = btoa(String.fromCharCode(1, 2));
    const second = btoa(String.fromCharCode(3, 4));
    const fetchMock = mockFetch(async () => new Response(
      `${JSON.stringify({ result: { audioContent: first } })}\n${JSON.stringify({ result: { audioContent: second } })}\n`,
      { headers: { "content-type": "application/x-ndjson" } }
    ));
    const adapter = createTtsAdapter({
      config: { provider: "inworld", credential: "iw-key", voice: "Sarah" },
      fetch: fetchMock
    });

    const result = await adapter.synthesize("Hello");
    const { url, init: opts } = firstFetchCall(fetchMock);
    expect(url).toBe("https://api.inworld.ai/tts/v1/voice:stream");
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe("Basic iw-key");
    expect(result.mimeType).toBe("audio/mpeg");
    expect(Array.from(new Uint8Array(result.audio))).toEqual([1, 2, 3, 4]);
    expect(JSON.parse(opts.body as string)).toEqual({
      text: "Hello",
      voiceId: "Sarah",
      modelId: "inworld-tts-1.5-max",
      audioConfig: { audioEncoding: "MP3" }
    });
  });

  it("ElevenLabs TTS passes seed, language code, and text normalization when configured", async () => {
    const fetchMock = mockFetch(async () => audioResponse());
    const adapter = createTtsAdapter({
      config: {
        provider: "elevenlabs",
        credential: "el-key",
        voiceId: "Rachel",
        seed: 1234,
        languageCode: "en",
        applyTextNormalization: "on"
      },
      fetch: fetchMock
    });

    await adapter.synthesize("Hi");
    const configuredBody = JSON.parse(firstFetchCall(fetchMock).init.body as string);
    expect(configuredBody).toMatchObject({
      seed: 1234,
      language_code: "en",
      apply_text_normalization: "on"
    });

    const fetchWithoutExtras = mockFetch(async () => audioResponse());
    const adapterWithoutExtras = createTtsAdapter({
      config: { provider: "elevenlabs", credential: "el-key", voiceId: "Rachel" },
      fetch: fetchWithoutExtras
    });

    await adapterWithoutExtras.synthesize("Hi");
    const defaultBody = JSON.parse(firstFetchCall(fetchWithoutExtras).init.body as string);
    expect(defaultBody).not.toHaveProperty("seed");
    expect(defaultBody).not.toHaveProperty("language_code");
    expect(defaultBody).not.toHaveProperty("apply_text_normalization");
  });

  it("calls Gradium TTS using ElevenLabs-style voice endpoint", async () => {
    const fetchMock = mockFetch(async () => audioResponse());
    const adapter = createTtsAdapter({
      config: { provider: "gradium", credential: "gr-key", voice: "YTpq7expH9539ERJ" },
      fetch: fetchMock
    });

    await adapter.synthesize("Hello");
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("gradium.ai");
    expect(String(url)).toContain("YTpq7expH9539ERJ");
  });

  it("calls Vydra TTS using ElevenLabs-style voice endpoint", async () => {
    const fetchMock = mockFetch(async () => audioResponse());
    const adapter = createTtsAdapter({
      config: { provider: "vydra", credential: "vy-key", voice: "21m00Tcm4TlvDq8ikWAM" },
      fetch: fetchMock
    });

    await adapter.synthesize("Hello");
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("vydra.ai");
    expect(String(url)).toContain("21m00Tcm4TlvDq8ikWAM");
  });

  it("calls Xiaomi TTS with Bearer auth (OpenAI-compatible)", async () => {
    const fetchMock = mockFetch(async () => audioResponse());
    const adapter = createTtsAdapter({
      config: { provider: "xiaomi", credential: "xi-key", voice: "mimo_default" },
      fetch: fetchMock
    });

    await adapter.synthesize("Hello");
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("xiaomimimo.com");
  });

  it("calls Azure Speech TTS with SSML body and subscription key header", async () => {
    const fetchMock = mockFetch(async () => audioResponse());
    const adapter = createTtsAdapter({
      config: { provider: "azure-speech", credential: "az-key", voice: "en-US-JennyNeural" },
      fetch: fetchMock
    });

    await adapter.synthesize("Hello");
    const { url, init: opts } = firstFetchCall(fetchMock);
    expect(url).toContain("speech.microsoft.com");
    expect((opts.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"]).toBe("az-key");
    expect(opts.body as string).toContain("en-US-JennyNeural");
    expect(opts.body as string).toContain("<speak");
  });

  it("calls Volcengine TTS with Bearer auth and JSON body", async () => {
    const b64 = btoa(String.fromCharCode(1, 2, 3));
    const fetchMock = mockFetch(async () => Response.json({ data: { audio: b64 } }));
    const adapter = createTtsAdapter({
      config: { provider: "volcengine", credential: "vc-key", voice: "en_female_anna_mars_bigtts" },
      fetch: fetchMock
    });

    await adapter.synthesize("Hello");
    const { url, init: opts } = firstFetchCall(fetchMock);
    expect(url).toContain("bytepluses.com");
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe("Bearer vc-key");
  });

  it("calls Microsoft Edge TTS via proxy endpoint", async () => {
    const fetchMock = mockFetch(async () => audioResponse());
    const adapter = createTtsAdapter({
      config: { provider: "microsoft", voice: "en-US-MichelleNeural" },
      fetch: fetchMock
    });

    await adapter.synthesize("Hello");
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("localhost:5000");
  });
});
