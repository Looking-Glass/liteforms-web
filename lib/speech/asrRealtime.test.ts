import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASR_REALTIME_PCM_SAMPLE_RATE,
  createAsrRealtimeSession,
  DEFAULT_ASR_REALTIME_CHUNK_MS,
  DEFAULT_ASR_REALTIME_PCM_HOP_MS,
  DEFAULT_ASR_REALTIME_PCM_WINDOW_MS,
  mergeTranscriptText
} from "./asrRealtime";
import { createAsrAdapter } from "./asr";

vi.mock("./asr", () => ({
  createAsrAdapter: vi.fn()
}));

class MockMediaRecorder {
  static latest: MockMediaRecorder | null = null;

  state = "inactive";
  mimeType = "audio/webm";
  startMs: number | undefined;
  requestData = vi.fn();
  private handlers: Record<string, Array<(event: unknown) => void>> = {};

  constructor() {
    MockMediaRecorder.latest = this;
  }

  addEventListener(event: string, handler: (event: unknown) => void) {
    this.handlers[event] ??= [];
    this.handlers[event].push(handler);
  }

  start(timeslice?: number) {
    this.startMs = timeslice;
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.handlers.stop?.forEach((handler) => handler({}));
  }

  emitData(text: string) {
    this.handlers.dataavailable?.forEach((handler) =>
      handler({ data: new Blob([text], { type: this.mimeType }) })
    );
  }
}

class MockAudioContext {
  static latest: MockAudioContext | null = null;

  sampleRate = ASR_REALTIME_PCM_SAMPLE_RATE;
  destination = {};
  source = { connect: vi.fn(), disconnect: vi.fn() };
  processor = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null as ((event: { inputBuffer: AudioBuffer }) => void) | null };
  close = vi.fn();

  constructor() {
    MockAudioContext.latest = this;
  }

  createMediaStreamSource() {
    return this.source;
  }

  createScriptProcessor() {
    return this.processor;
  }

  emit(samples: Float32Array, sampleRate = ASR_REALTIME_PCM_SAMPLE_RATE) {
    this.processor.onaudioprocess?.({
      inputBuffer: {
        length: samples.length,
        numberOfChannels: 1,
        sampleRate,
        getChannelData: () => samples
      } as unknown as AudioBuffer
    });
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function tick() {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

describe("realtime ASR session", () => {
  beforeEach(() => {
    MockMediaRecorder.latest = null;
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("starts a Web Audio PCM session for Distil-Whisper when a worker is available", () => {
    const worker = { transcribe: vi.fn().mockResolvedValue({ text: "" }) };
    vi.stubGlobal("AudioContext", MockAudioContext);

    const session = createAsrRealtimeSession({ config: { provider: "distil-whisper" }, worker });
    session.start({} as MediaStream);

    const audioContext = MockAudioContext.latest!;
    expect(MockAudioContext.latest).not.toBeNull();
    expect(audioContext.source.connect).toHaveBeenCalledWith(audioContext.processor);
    expect(MockMediaRecorder.latest).toBeNull();
  });

  it("uses a 2-second hop and bounded 6-second PCM transcription window", async () => {
    vi.useFakeTimers();
    const worker = { transcribe: vi.fn().mockResolvedValue({ text: "" }) };
    vi.stubGlobal("AudioContext", MockAudioContext);

    const session = createAsrRealtimeSession({ config: { provider: "distil-whisper" }, worker });
    session.start({} as MediaStream);
    MockAudioContext.latest!.emit(new Float32Array(ASR_REALTIME_PCM_SAMPLE_RATE * 8).fill(0.5));

    await vi.advanceTimersByTimeAsync(DEFAULT_ASR_REALTIME_PCM_HOP_MS - 1);
    expect(worker.transcribe).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(worker.transcribe).toHaveBeenCalledTimes(1);
    expect(worker.transcribe.mock.calls[0][0].audio).toBeInstanceOf(Float32Array);
    expect(worker.transcribe.mock.calls[0][0].audio).toHaveLength(
      (ASR_REALTIME_PCM_SAMPLE_RATE * DEFAULT_ASR_REALTIME_PCM_WINDOW_MS) / 1000
    );
  });

  it("drops stale pending PCM windows and processes the newest pending window next", async () => {
    vi.useFakeTimers();
    const first = deferred<{ text: string }>();
    const worker = { transcribe: vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ text: "" }) };
    vi.stubGlobal("AudioContext", MockAudioContext);

    const session = createAsrRealtimeSession({ config: { provider: "distil-whisper" }, worker });
    session.start({} as MediaStream);
    MockAudioContext.latest!.emit(new Float32Array(ASR_REALTIME_PCM_SAMPLE_RATE * 6).fill(0.1));
    await vi.advanceTimersByTimeAsync(DEFAULT_ASR_REALTIME_PCM_HOP_MS);
    MockAudioContext.latest!.emit(new Float32Array(ASR_REALTIME_PCM_SAMPLE_RATE * 2).fill(0.2));
    await vi.advanceTimersByTimeAsync(DEFAULT_ASR_REALTIME_PCM_HOP_MS);
    MockAudioContext.latest!.emit(new Float32Array(ASR_REALTIME_PCM_SAMPLE_RATE * 2).fill(0.3));
    await vi.advanceTimersByTimeAsync(DEFAULT_ASR_REALTIME_PCM_HOP_MS);

    expect(worker.transcribe).toHaveBeenCalledTimes(1);

    first.resolve({ text: "" });
    await tick();

    expect(worker.transcribe).toHaveBeenCalledTimes(2);
    const secondWindow = worker.transcribe.mock.calls[1][0].audio as Float32Array;
    expect(secondWindow.at(-1)).toBeCloseTo(0.3);
  });

  it("flushes one final bounded PCM tail window on stop", async () => {
    vi.useFakeTimers();
    const worker = { transcribe: vi.fn().mockResolvedValue({ text: "tail" }) };
    const finals: string[] = [];
    vi.stubGlobal("AudioContext", MockAudioContext);

    const session = createAsrRealtimeSession({
      config: { provider: "distil-whisper" },
      worker,
      onTranscript: (text, event) => {
        if (event.final) finals.push(text);
      }
    });
    session.start({} as MediaStream);
    MockAudioContext.latest!.emit(new Float32Array(ASR_REALTIME_PCM_SAMPLE_RATE * 8).fill(0.4));

    await expect(session.stop()).resolves.toBe("tail");

    expect(worker.transcribe).toHaveBeenCalledTimes(1);
    expect(worker.transcribe.mock.calls[0][0].audio).toHaveLength(
      (ASR_REALTIME_PCM_SAMPLE_RATE * DEFAULT_ASR_REALTIME_PCM_WINDOW_MS) / 1000
    );
    expect(finals).toEqual(["tail"]);
  });

  it("falls back to MediaRecorder snapshot mode if Web Audio setup fails", () => {
    const worker = { transcribe: vi.fn().mockResolvedValue({ text: "" }) };
    vi.stubGlobal(
      "AudioContext",
      class {
        createMediaStreamSource() {
          throw new Error("no web audio");
        }
      }
    );
    vi.mocked(createAsrAdapter).mockReturnValue({ provider: "distil-whisper", transcribe: vi.fn() });

    const session = createAsrRealtimeSession({ config: { provider: "distil-whisper" }, worker });
    session.start({} as MediaStream);

    expect(MockMediaRecorder.latest?.startMs).toBe(DEFAULT_ASR_REALTIME_CHUNK_MS);
  });

  it("starts MediaRecorder with a 5000 ms timeslice", () => {
    vi.mocked(createAsrAdapter).mockReturnValue({
      provider: "distil-whisper",
      transcribe: vi.fn()
    });

    const session = createAsrRealtimeSession({ config: { provider: "distil-whisper" } });
    session.start({} as MediaStream);

    expect(MockMediaRecorder.latest?.startMs).toBe(DEFAULT_ASR_REALTIME_CHUNK_MS);
  });

  it("sends completed chunks to the ASR adapter and keeps accepting chunks while one is pending", async () => {
    const first = deferred<{ text: string }>();
    const transcribe = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce({ text: "second" });
    vi.mocked(createAsrAdapter).mockReturnValue({ provider: "distil-whisper", transcribe });

    const session = createAsrRealtimeSession({ config: { provider: "distil-whisper" } });
    session.start({} as MediaStream);
    MockMediaRecorder.latest!.emitData("one");
    MockMediaRecorder.latest!.emitData("two");
    await tick();

    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(MockMediaRecorder.latest?.state).toBe("recording");

    first.resolve({ text: "first" });
    await tick();

    expect(transcribe).toHaveBeenCalledTimes(2);
    expect(transcribe.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(transcribe.mock.calls[1][0]).toBeInstanceOf(Blob);
  });

  it("processes transcripts in original chunk order", async () => {
    const first = deferred<{ text: string }>();
    const transcribe = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce({ text: "hello world" });
    const updates: string[] = [];
    vi.mocked(createAsrAdapter).mockReturnValue({ provider: "distil-whisper", transcribe });

    const session = createAsrRealtimeSession({
      config: { provider: "distil-whisper" },
      onTranscript: (text, event) => {
        if (!event.final) updates.push(text);
      }
    });
    session.start({} as MediaStream);
    MockMediaRecorder.latest!.emitData("one");
    MockMediaRecorder.latest!.emitData("two");

    first.resolve({ text: "hello" });
    await tick();

    expect(updates).toEqual(["hello", "hello world"]);
  });

  it("flushes final recorder data on stop and emits the final accumulated transcript", async () => {
    const transcribe = vi.fn().mockResolvedValue({ text: "final chunk" });
    const finals: string[] = [];
    const recordings: Blob[] = [];
    vi.mocked(createAsrAdapter).mockReturnValue({ provider: "distil-whisper", transcribe });

    const session = createAsrRealtimeSession({
      config: { provider: "distil-whisper" },
      onRecording: (audio) => recordings.push(audio),
      onTranscript: (text, event) => {
        if (event.final) finals.push(text);
      }
    });
    session.start({} as MediaStream);
    MockMediaRecorder.latest!.requestData.mockImplementation(() => {
      MockMediaRecorder.latest!.emitData("last");
    });

    await expect(session.stop()).resolves.toBe("final chunk");

    expect(MockMediaRecorder.latest!.requestData).toHaveBeenCalled();
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(recordings).toHaveLength(1);
    expect(finals).toEqual(["final chunk"]);
  });

  it("does not append empty chunk output", async () => {
    const transcribe = vi.fn().mockResolvedValueOnce({ text: "   " }).mockResolvedValueOnce({ text: "kept" });
    const finals: string[] = [];
    vi.mocked(createAsrAdapter).mockReturnValue({ provider: "distil-whisper", transcribe });

    const session = createAsrRealtimeSession({
      config: { provider: "distil-whisper" },
      onTranscript: (text, event) => {
        if (event.final) finals.push(text);
      }
    });
    session.start({} as MediaStream);
    MockMediaRecorder.latest!.emitData("empty");
    MockMediaRecorder.latest!.emitData("kept");
    await tick();

    await session.stop();

    expect(finals).toEqual(["kept"]);
  });

  it("surfaces transcription errors and rejects stop without emitting a partial final", async () => {
    const error = new Error("ASR failed");
    const transcribe = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();
    const final = vi.fn();
    vi.mocked(createAsrAdapter).mockReturnValue({ provider: "distil-whisper", transcribe });

    const session = createAsrRealtimeSession({
      config: { provider: "distil-whisper" },
      onError,
      onTranscript: (text, event) => {
        if (event.final) final(text);
      }
    });
    session.start({} as MediaStream);
    MockMediaRecorder.latest!.emitData("bad");
    await tick();

    await expect(session.stop()).rejects.toThrow("ASR failed");
    expect(onError).toHaveBeenCalledWith(error);
    expect(final).not.toHaveBeenCalled();
  });
});

describe("transcript overlap merge", () => {
  it("merges overlapping transcript text without duplicates", () => {
    expect(mergeTranscriptText("hello world from liteforms", "world from liteforms today")).toBe(
      "hello world from liteforms today"
    );
    expect(mergeTranscriptText("hello world", "hello world")).toBe("hello world");
  });

  it("skips hallucinated leading words before a fuzzy overlap", () => {
    expect(
      mergeTranscriptText(
        "I'm speaking without repeating myself, but I think the transcription is repeating words that I'm saying.",
        "This is in the transcription is of being words that I'm saying. This is incorrect behavior."
      )
    ).toBe(
      "I'm speaking without repeating myself, but I think the transcription is repeating words that I'm saying. This is incorrect behavior."
    );
  });

  it("lets the next window revise the overlapped tail when the overlap starts immediately", () => {
    expect(
      mergeTranscriptText(
        "That is incorrect behavior. Fortunately, the system is now responding.",
        "correct behavior. Fortunately, the system is now responsive and feels dynamic."
      )
    ).toBe("That is incorrect behavior. Fortunately, the system is now responsive and feels dynamic.");
  });

  it("keeps a rolling-window transcript from duplicating revised speech spans", () => {
    const chunks = [
      "This is a test of the speech to text.",
      "This is a test of the speech to text system. I'm speaking without repeating myself, but I think",
      "I'm speaking without repeating myself, but I think the transcription is repeating words that I'm saying.",
      "This is in the transcription is of being words that I'm saying. This is incorrect behavior.",
      "correct behavior. Fortunately, the system is now responsive and feels dynamic."
    ];

    const merged = chunks.reduce((accumulated, chunk) => mergeTranscriptText(accumulated, chunk), "");

    expect(merged).toBe(
      "This is a test of the speech to text system. I'm speaking without repeating myself, but I think the transcription is repeating words that I'm saying. This is incorrect behavior. Fortunately, the system is now responsive and feels dynamic."
    );
  });

  it("removes short repeated fragments from unstable smaller windows", () => {
    const chunks = [
      "This is a test of the speech to text system. I'm speaking without repeating myself, but I think the transcription is repeating words that I'm saying. That is.",
      "That is incorrect behavior. Fortunately.",
      "behavior. Fortunately, The system is now responsive and feels dynamic."
    ];

    const merged = chunks.reduce((accumulated, chunk) => mergeTranscriptText(accumulated, chunk), "");

    expect(merged).toBe(
      "This is a test of the speech to text system. I'm speaking without repeating myself, but I think the transcription is repeating words that I'm saying. That is incorrect behavior. Fortunately, The system is now responsive and feels dynamic."
    );
  });
});
