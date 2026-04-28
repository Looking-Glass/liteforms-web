import type { LocalGemmaPreloadRequest, LocalGemmaWorkerLike, LocalGemmaWorkerRequest, ModelLoadProgress } from "./types";

type Pending<T> = {
  resolve(value: T): void;
  reject(reason: Error): void;
  onProgress?(progress: ModelLoadProgress): void;
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
    const text = await this.post<string>("generate", request);
    if (text) {
      yield text;
    }
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
