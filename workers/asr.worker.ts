import type { AsrResult, AsrWorkerRequest } from "@/lib/speech/types";
import { env, pipeline } from "@huggingface/transformers";
import { getTranscriptionOptions } from "./asr-helpers";
import { configureTransformersBrowserCache } from "./transformers-cache";

type WorkerMessage = {
  id: number;
  type: "transcribe" | "preload";
  payload: AsrWorkerRequest | Omit<AsrWorkerRequest, "audio">;
};

const workerScope = self as unknown as {
  addEventListener(type: "message", listener: (event: MessageEvent<WorkerMessage>) => void): void;
  postMessage(message: unknown): void;
};

workerScope.addEventListener("message", async (event: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = event.data;
  if (type !== "transcribe" && type !== "preload") {
    workerScope.postMessage({ id, ok: false, error: "Unsupported ASR worker request." });
    return;
  }

  try {
    if (type === "preload") {
      await getTranscriber(payload, (progress) => postProgress(id, progress));
      workerScope.postMessage({ id, ok: true, result: undefined });
      return;
    }
    const result = await transcribeWithDistilWhisper(payload as AsrWorkerRequest);
    workerScope.postMessage({ id, ok: true, result });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "ASR transcription failed.";
    workerScope.postMessage({ id, ok: false, error: message });
  }
});

async function transcribeWithDistilWhisper(request: AsrWorkerRequest): Promise<AsrResult> {
  const runtime = await loadAsrRuntime();
  if (runtime) {
    return runtime(request);
  }

  const transcriber = await getTranscriber(request);
  const output = (await transcriber(request.audio, getTranscriptionOptions(request))) as Array<{ text?: unknown }> | { text?: unknown };
  const text = Array.isArray(output)
    ? output.map((item) => ("text" in item ? String(item.text) : "")).join(" ")
    : "text" in output
      ? String(output.text)
      : "";
  return { text: text.trim(), language: request.language };
}

async function loadAsrRuntime(): Promise<((request: AsrWorkerRequest) => Promise<AsrResult>) | null> {
  const loader = (globalThis as { liteformsAsrRuntime?: (request: AsrWorkerRequest) => Promise<AsrResult> }).liteformsAsrRuntime;
  return loader ?? null;
}

type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<unknown>;

const transcriberCache = new Map<string, Promise<Transcriber>>();

type ProgressInfo = {
  status?: string;
  progress?: number;
  file?: string;
  name?: string;
  message?: string;
};

async function getTranscriber(request: Omit<AsrWorkerRequest, "audio">, onProgress?: (progress: ProgressInfo) => void) {
  const key = `${request.model}:${request.device}:${request.dtype}`;
  const existing = transcriberCache.get(key);
  if (existing) {
    return existing;
  }
  configureTransformersBrowserCache({ env }, "Distil-Whisper", onProgress);
  const created = pipeline("automatic-speech-recognition", request.model, {
    device: request.device,
    dtype: request.dtype,
    progress_callback: onProgress
  }) as Promise<unknown> as Promise<Transcriber>;
  transcriberCache.set(key, created);
  return created;
}

function postProgress(id: number, info: ProgressInfo) {
  const file = info.file ?? info.name;
  const progress =
    typeof info.progress === "number" ? Math.max(0, Math.min(100, info.progress)) : undefined;
  workerScope.postMessage({
    id,
    type: "progress",
    progress: {
      status: "loading",
      ...(progress !== undefined ? { progress } : {}),
      message: info.message ?? (file ? `Distil-Whisper ${file}` : "Distil-Whisper loading")
    }
  });
}

export {};
