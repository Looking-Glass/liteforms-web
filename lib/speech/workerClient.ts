import type { AsrResult, AsrWorkerLike, AsrWorkerRequest, ModelLoadProgress, TtsResult, TtsWorkerLike, TtsWorkerRequest } from "./types";

type WorkerFactory = () => Worker;

type Pending<T> = {
  resolve(value: T): void;
  reject(reason: Error): void;
  onProgress?(progress: ModelLoadProgress): void;
};

export class KokoroWorkerClient implements TtsWorkerLike {
  private worker?: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending<TtsResult>>();

  constructor(private readonly workerFactory: WorkerFactory = createKokoroWorker) {}

  preload(request: Omit<TtsWorkerRequest, "text">, onProgress?: (progress: ModelLoadProgress) => void): Promise<void> {
    return this.post<void>("preload", request, onProgress);
  }

  synthesize(request: TtsWorkerRequest): Promise<TtsResult> {
    return this.post<TtsResult>("synthesize", request);
  }

  private post<T>(type: string, payload: unknown, onProgress?: (progress: ModelLoadProgress) => void): Promise<T> {
    const id = this.nextId++;
    const worker = this.getWorker();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: TtsResult) => void, reject, onProgress });
      worker.postMessage({ id, type, payload });
    });
  }

  private getWorker() {
    if (!this.worker) {
      this.worker = this.workerFactory();
      this.worker.addEventListener("message", (event) => this.onMessage(event));
      this.worker.addEventListener("error", (event) => this.rejectAll(new Error(event.message)));
    }
    return this.worker;
  }

  private onMessage(event: MessageEvent) {
    const data = event.data as { id?: number; type?: string; ok?: boolean; result?: TtsResult; error?: string; progress?: ModelLoadProgress };
    if (typeof data.id !== "number") {
      return;
    }
    const pending = this.pending.get(data.id);
    if (!pending) {
      return;
    }
    if (data.type === "progress" && data.progress) {
      pending.onProgress?.(data.progress);
      return;
    }
    this.pending.delete(data.id);
    if (data.ok) {
      pending.resolve(data.result as TtsResult);
    } else {
      pending.reject(new Error(data.error ?? "Kokoro worker failed."));
    }
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

export class DistilWhisperWorkerClient implements AsrWorkerLike {
  private worker?: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending<AsrResult>>();

  constructor(private readonly workerFactory: WorkerFactory = createAsrWorker) {}

  preload(request: Omit<AsrWorkerRequest, "audio">, onProgress?: (progress: ModelLoadProgress) => void): Promise<void> {
    return this.post<void>("preload", request, onProgress);
  }

  transcribe(request: AsrWorkerRequest): Promise<AsrResult> {
    return this.post<AsrResult>("transcribe", request);
  }

  private post<T>(type: string, payload: unknown, onProgress?: (progress: ModelLoadProgress) => void): Promise<T> {
    const id = this.nextId++;
    const worker = this.getWorker();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: AsrResult) => void, reject, onProgress });
      const audio = (payload as Partial<AsrWorkerRequest>).audio;
      if (audio instanceof Float32Array) {
        worker.postMessage({ id, type, payload }, [audio.buffer]);
      } else {
        worker.postMessage({ id, type, payload });
      }
    });
  }

  private getWorker() {
    if (!this.worker) {
      this.worker = this.workerFactory();
      this.worker.addEventListener("message", (event) => this.onMessage(event));
      this.worker.addEventListener("error", (event) => this.rejectAll(new Error(event.message)));
    }
    return this.worker;
  }

  private onMessage(event: MessageEvent) {
    const data = event.data as { id?: number; type?: string; ok?: boolean; result?: AsrResult; error?: string; progress?: ModelLoadProgress };
    if (typeof data.id !== "number") {
      return;
    }
    const pending = this.pending.get(data.id);
    if (!pending) {
      return;
    }
    if (data.type === "progress" && data.progress) {
      pending.onProgress?.(data.progress);
      return;
    }
    this.pending.delete(data.id);
    if (data.ok) {
      pending.resolve(data.result as AsrResult);
    } else {
      pending.reject(new Error(data.error ?? "ASR worker failed."));
    }
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function createKokoroWorker() {
  return new Worker(new URL("../../workers/kokoro.worker.ts", import.meta.url), { type: "module" });
}

function createAsrWorker() {
  return new Worker(new URL("../../workers/asr.worker.ts", import.meta.url), { type: "module" });
}
