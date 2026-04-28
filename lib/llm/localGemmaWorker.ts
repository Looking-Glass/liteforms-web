import type { LocalGemmaPreloadRequest, LocalGemmaWorkerLike, LocalGemmaWorkerRequest, ModelLoadProgress } from "./types";

type Pending<T> = {
  resolve(value: T): void;
  reject(reason: Error): void;
  onProgress?(progress: ModelLoadProgress): void;
  onToken?(text: string): void;
};

export class LocalGemmaWorkerClient implements LocalGemmaWorkerLike {
  private worker?: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending<unknown>>();

  constructor(private readonly workerFactory: () => Worker = createLocalGemmaWorker) {}

  preload(request: LocalGemmaPreloadRequest, onProgress?: (progress: ModelLoadProgress) => void): Promise<void> {
    return this.post<void>("preload", request, onProgress);
  }

  async *streamText(request: LocalGemmaWorkerRequest): AsyncIterable<string> {
    const id = this.nextId++;
    const worker = this.getWorker();

    const queue: string[] = [];
    let done = false;
    let finalError: Error | null = null;
    let wakeResolve: (() => void) | null = null;
    const wake = () => { const r = wakeResolve; wakeResolve = null; r?.(); };

    this.pending.set(id, {
      resolve: (result) => {
        if (typeof result === "string" && result) queue.push(result);
        done = true;
        wake();
      },
      reject: (err) => { finalError = err; done = true; wake(); },
      onToken: (text) => { if (text) { queue.push(text); wake(); } }
    });
    worker.postMessage({ id, type: "generate", payload: request });

    try {
      while (!done || queue.length > 0) {
        while (queue.length > 0) {
          yield queue.shift()!;
        }
        if (!done) {
          await new Promise<void>(r => { wakeResolve = r; });
        }
      }
    } finally {
      this.pending.delete(id);
    }

    if (finalError) throw finalError;
  }

  private post<T>(type: "generate" | "preload", payload: LocalGemmaWorkerRequest | LocalGemmaPreloadRequest, onProgress?: (progress: ModelLoadProgress) => void) {
    const id = this.nextId++;
    const worker = this.getWorker();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, onProgress });
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
    const data = event.data as { id?: number; type?: string; ok?: boolean; result?: string; error?: string; progress?: ModelLoadProgress };
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
    if (data.type === "token" && typeof (data as { text?: unknown }).text === "string") {
      pending.onToken?.((data as { text: string }).text);
      return;
    }
    this.pending.delete(data.id);
    if (data.ok) {
      pending.resolve(data.result ?? "");
    } else {
      pending.reject(new Error(data.error ?? "Browser-local Gemma worker failed."));
    }
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function createLocalGemmaWorker() {
  return new Worker(new URL("../../workers/local-gemma.worker.ts", import.meta.url), { type: "module" });
}
