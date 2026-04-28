import { afterEach, describe, expect, it, vi } from "vitest";
import { playTtsResult } from "./audioPlayback";

describe("audio playback", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, "window");
  });

  it("decodes wav and compressed audio through the browser audio decoder", async () => {
    const source = createSource();
    const context = {
      decodeAudioData: vi.fn(async () => "decoded-buffer"),
      createBufferSource: vi.fn(() => source),
      destination: {}
    };

    await playTtsResult({ audio: new ArrayBuffer(8), mimeType: "audio/wav" }, () => context as unknown as AudioContext);

    expect(context.decodeAudioData).toHaveBeenCalled();
    expect(source.buffer).toBe("decoded-buffer");
    expect(source.start).toHaveBeenCalled();
  });

  it("plays raw pcm as 16-bit mono using the provided sample rate", async () => {
    const source = createSource();
    const channel = new Float32Array(2);
    const context = {
      createBuffer: vi.fn(() => ({ getChannelData: () => channel })),
      createBufferSource: vi.fn(() => source),
      destination: {}
    };
    const pcm = new Int16Array([0, 32767]);

    await playTtsResult({ audio: pcm.buffer, mimeType: "audio/pcm", sampleRate: 24000 }, () => context as unknown as AudioContext);

    expect(context.createBuffer).toHaveBeenCalledWith(1, 2, 24000);
    expect(channel[0]).toBe(0);
    expect(channel[1]).toBeCloseTo(32767 / 32768);
    expect(source.start).toHaveBeenCalled();
  });

  it("drives timed VRM mouth frames from Kokoro word timing data and live audio amplitude", async () => {
    let animationFrame: (() => void) | undefined;
    let currentTime = 2;
    const source = createSource(false);
    const analyser = createAnalyser([128, 150]);
    const context = {
      get currentTime() {
        return currentTime;
      },
      baseLatency: 0.02,
      decodeAudioData: vi.fn(async () => "decoded-buffer"),
      createBufferSource: vi.fn(() => source),
      createAnalyser: vi.fn(() => analyser),
      destination: {}
    };
    Reflect.set(globalThis, "window", {
      requestAnimationFrame: vi.fn((listener: () => void) => {
        animationFrame = listener;
        return 1;
      })
    });
    const onLipSyncFrame = vi.fn();

    const playing = playTtsResult(
      {
        audio: new ArrayBuffer(8),
        mimeType: "audio/wav",
        words: [{ word: "easy", start: 0.2, end: 0.5 }]
      },
      { audioContextFactory: () => context as unknown as AudioContext, onLipSyncFrame }
    );

    await Promise.resolve();
    currentTime = 2 + 0.02 + 0.09 + 0.2;
    animationFrame?.();
    source.emitEnded();
    await playing;

    expect(source.connect).toHaveBeenCalledWith(analyser);
    expect(analyser.connect).toHaveBeenCalledWith(context.destination);
    expect(onLipSyncFrame).toHaveBeenCalledWith({
      target: "viseme_E",
      group: "E",
      vrmExpression: "ee",
      start: 0.2,
      end: 0.5,
      weight: expect.any(Number)
    });
    expect(onLipSyncFrame.mock.calls[0][0].weight).toBeGreaterThan(0);
    expect(onLipSyncFrame.mock.calls[0][0].weight).toBeLessThan(1);
  });

  it("allows callers to tune the timed lip sync offset", async () => {
    let animationFrame: (() => void) | undefined;
    let currentTime = 0;
    const source = createSource(false);
    const analyser = createAnalyser([128, 150]);
    const context = {
      get currentTime() {
        return currentTime;
      },
      decodeAudioData: vi.fn(async () => "decoded-buffer"),
      createBufferSource: vi.fn(() => source),
      createAnalyser: vi.fn(() => analyser),
      destination: {}
    };
    Reflect.set(globalThis, "window", {
      requestAnimationFrame: vi.fn((listener: () => void) => {
        animationFrame = listener;
        return 1;
      })
    });
    const onLipSyncFrame = vi.fn();

    const playing = playTtsResult(
      {
        audio: new ArrayBuffer(8),
        mimeType: "audio/wav",
        words: [{ word: "hello", start: 0.1, end: 0.3 }]
      },
      { audioContextFactory: () => context as unknown as AudioContext, onLipSyncFrame, lipSyncOffsetMs: 25 }
    );

    await Promise.resolve();
    currentTime = 0.02 + 0.025 + 0.1;
    animationFrame?.();
    source.emitEnded();
    await playing;

    expect(onLipSyncFrame).toHaveBeenCalledWith(expect.objectContaining({ start: 0.1, end: 0.3 }));
  });

  it("uses RMS fallback frames when TTS timing data is unavailable", async () => {
    const source = createSource();
    const analyser = createAnalyser([128, 255]);
    const context = {
      decodeAudioData: vi.fn(async () => "decoded-buffer"),
      createBufferSource: vi.fn(() => source),
      createAnalyser: vi.fn(() => analyser),
      destination: {}
    };
    Reflect.set(globalThis, "window", { requestAnimationFrame: vi.fn() });
    const onLipSyncFrame = vi.fn();

    await playTtsResult({ audio: new ArrayBuffer(8), mimeType: "audio/wav" }, {
      audioContextFactory: () => context as unknown as AudioContext,
      onLipSyncFrame
    });

    expect(source.connect).toHaveBeenCalledWith(analyser);
    expect(analyser.connect).toHaveBeenCalledWith(context.destination);
    expect(onLipSyncFrame).toHaveBeenCalledWith(expect.objectContaining({ target: "viseme_aa", vrmExpression: "aa" }));
    expect(analyser.disconnect).toHaveBeenCalled();
  });
});

function createSource(autoEnd = true) {
  const listeners = new Map<string, () => void>();
  return {
    buffer: undefined as unknown,
    connect: vi.fn(),
    start: vi.fn(() => {
      if (autoEnd) {
        listeners.get("ended")?.();
      }
    }),
    addEventListener: vi.fn((type: string, listener: () => void) => listeners.set(type, listener)),
    emitEnded: () => listeners.get("ended")?.()
  };
}

function createAnalyser(sampleValues: number[]) {
  return {
    fftSize: sampleValues.length,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getByteTimeDomainData: vi.fn((samples: Uint8Array) => {
      sampleValues.forEach((sample, index) => {
        samples[index] = sample;
      });
    })
  };
}
