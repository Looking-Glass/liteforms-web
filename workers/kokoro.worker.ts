import type { TtsResult, TtsWorkerRequest } from "@/lib/speech/types";
import { KokoroTTS } from "kokoro-js";

type WorkerMessage = {
  id: number;
  type: "synthesize" | "preload";
  payload: TtsWorkerRequest | Omit<TtsWorkerRequest, "text">;
};

const workerScope = self as unknown as {
  addEventListener(type: "message", listener: (event: MessageEvent<WorkerMessage>) => void): void;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

workerScope.addEventListener("message", async (event: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = event.data;
  if (type !== "synthesize" && type !== "preload") {
    workerScope.postMessage({ id, ok: false, error: "Unsupported Kokoro worker request." });
    return;
  }

  try {
    if (type === "preload") {
      await getKokoro(payload, (progress) => postProgress(id, progress));
      workerScope.postMessage({ id, type: "progress", progress: { status: "ready", progress: 100, message: "Kokoro ready" } });
      workerScope.postMessage({ id, ok: true, result: undefined });
      return;
    }
    const result = await synthesizeWithKokoro(payload as TtsWorkerRequest);
    workerScope.postMessage({ id, ok: true, result }, [result.audio]);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Kokoro synthesis failed.";
    workerScope.postMessage({ id, ok: false, error: message });
  }
});

async function synthesizeWithKokoro(request: TtsWorkerRequest): Promise<TtsResult> {
  const runtime = await loadInjectedKokoroRuntime();
  if (runtime) {
    return runtime(request);
  }

  const tts = await getKokoro(request);
  const audio = await tts.generate(request.text, {
    voice: request.voice as Parameters<KokoroTTS["generate"]>[1] extends { voice?: infer Voice } ? Voice : never,
    speed: request.speed
  });
  const waveform = getAudioSamples(audio);
  const sampleRate = getAudioSampleRate(audio);
  return {
    audio: await encodeAudioResult(audio),
    sampleRate,
    mimeType: "audio/wav",
    words: estimateWordTimings(request.text, waveform.length / sampleRate)
  };
}

async function loadInjectedKokoroRuntime(): Promise<((request: TtsWorkerRequest) => Promise<TtsResult>) | null> {
  const loader = (globalThis as { liteformsKokoroRuntime?: (request: TtsWorkerRequest) => Promise<TtsResult> }).liteformsKokoroRuntime;
  return loader ?? null;
}

const kokoroCache = new Map<string, Promise<KokoroTTS>>();

type ProgressInfo = {
  status?: string;
  progress?: number;
  file?: string;
  name?: string;
};

function getKokoro(request: Omit<TtsWorkerRequest, "text">, onProgress?: (progress: ProgressInfo) => void) {
  const key = `${request.model}:${request.dtype}:${request.device}`;
  const existing = kokoroCache.get(key);
  if (existing) {
    return existing;
  }
  const created = KokoroTTS.from_pretrained(request.model, {
    dtype: request.dtype,
    device: request.device,
    progress_callback: onProgress
  } as Parameters<typeof KokoroTTS.from_pretrained>[1] & { progress_callback?: (progress: ProgressInfo) => void });
  kokoroCache.set(key, created);
  return created;
}

function postProgress(id: number, info: ProgressInfo) {
  const progress = typeof info.progress === "number" ? Math.max(0, Math.min(100, info.progress)) : 0;
  const file = info.file ?? info.name;
  workerScope.postMessage({
    id,
    type: "progress",
    progress: {
      status: "loading",
      progress,
      message: file ? `Kokoro ${file}` : "Kokoro loading"
    }
  });
}

type RawAudioLike = {
  audio?: Float32Array | Float32Array[];
  data?: Float32Array;
  sampling_rate?: number;
  toBlob?: () => Blob;
  toWav?: () => ArrayBuffer;
};

async function encodeAudioResult(audio: RawAudioLike) {
  if (typeof audio.toWav === "function") {
    return audio.toWav();
  }
  if (typeof audio.toBlob === "function") {
    return audio.toBlob().arrayBuffer();
  }
  return encodePcmWav(getAudioSamples(audio), getAudioSampleRate(audio));
}

function getAudioSamples(audio: RawAudioLike) {
  if (audio.data instanceof Float32Array) {
    return audio.data;
  }
  if (audio.audio instanceof Float32Array) {
    return audio.audio;
  }
  if (Array.isArray(audio.audio)) {
    const totalLength = audio.audio.reduce((sum, chunk) => sum + chunk.length, 0);
    const samples = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of audio.audio) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    return samples;
  }
  throw new Error("Kokoro returned an unsupported audio result.");
}

function getAudioSampleRate(audio: RawAudioLike) {
  return audio.sampling_rate ?? 24000;
}

function encodePcmWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
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
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function estimateWordTimings(text: string, durationSeconds: number) {
  const words = text.match(/\S+/g) ?? [];
  if (words.length === 0) {
    return [];
  }
  const slot = durationSeconds / words.length;
  return words.map((word, index) => ({
    word,
    start: Number((index * slot).toFixed(3)),
    end: Number(((index + 1) * slot).toFixed(3))
  }));
}

export {};
