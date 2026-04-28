import { describe, expect, it } from "vitest";
import { LocalGemmaWorkerClient } from "./localGemmaWorker";

// ── Fake Worker ───────────────────────────────────────────────────────────────

type FakeMsg = Record<string, unknown>;
type SendFn = (response: FakeMsg) => void;

/**
 * Builds a minimal Worker stand-in whose postMessage response is controlled by
 * the caller. `respond` receives the outbound message and a `send` function that
 * delivers a response to the client's registered "message" listener.
 *
 * Using Promise.resolve().then() means responses arrive on the next microtask
 * tick, so the generator loop has time to reach its `await` before tokens land —
 * this exercises the wake-signal path, not just the synchronous drain path.
 */
function makeFakeWorker(respond: (msg: FakeMsg, send: SendFn) => void) {
  let onMessage: ((event: { data: FakeMsg }) => void) | null = null;
  return {
    addEventListener(type: string, handler: (event: { data: FakeMsg }) => void) {
      if (type === "message") onMessage = handler;
    },
    postMessage(msg: unknown) {
      const send: SendFn = (response) => onMessage?.({ data: response });
      Promise.resolve().then(() => respond(msg as FakeMsg, send));
    }
  };
}

async function collect(iter: AsyncIterable<string>) {
  const chunks: string[] = [];
  for await (const chunk of iter) chunks.push(chunk);
  return chunks;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("LocalGemmaWorkerClient.streamText", () => {
  it("yields tokens progressively as 'token' messages arrive", async () => {
    const worker = makeFakeWorker(({ id }, send) => {
      send({ id, type: "token", text: "Hello" });
      send({ id, type: "token", text: " world" });
      send({ id, ok: true, result: "" });
    });

    const client = new LocalGemmaWorkerClient(() => worker as unknown as Worker);
    const chunks = await collect(client.streamText({ model: "test-model", messages: [] }));

    expect(chunks).toEqual(["Hello", " world"]);
  });

  it("yields a single chunk when no token messages arrive (non-streaming fallback)", async () => {
    const worker = makeFakeWorker(({ id }, send) => {
      send({ id, ok: true, result: "Full response" });
    });

    const client = new LocalGemmaWorkerClient(() => worker as unknown as Worker);
    const chunks = await collect(client.streamText({ model: "test-model", messages: [] }));

    expect(chunks).toEqual(["Full response"]);
  });

  it("does not produce an extra empty chunk when the final result is empty", async () => {
    const worker = makeFakeWorker(({ id }, send) => {
      send({ id, type: "token", text: "streamed" });
      send({ id, ok: true, result: "" });
    });

    const client = new LocalGemmaWorkerClient(() => worker as unknown as Worker);
    const chunks = await collect(client.streamText({ model: "test-model", messages: [] }));

    expect(chunks).toEqual(["streamed"]);
  });

  it("appends a non-empty final result after streamed tokens", async () => {
    // Shouldn't happen in practice (the worker returns '' when streaming), but
    // the client should handle it correctly if it ever does.
    const worker = makeFakeWorker(({ id }, send) => {
      send({ id, type: "token", text: "partial" });
      send({ id, ok: true, result: "tail" });
    });

    const client = new LocalGemmaWorkerClient(() => worker as unknown as Worker);
    const chunks = await collect(client.streamText({ model: "test-model", messages: [] }));

    expect(chunks).toEqual(["partial", "tail"]);
  });

  it("throws when the worker reports an error", async () => {
    const worker = makeFakeWorker(({ id }, send) => {
      send({ id, ok: false, error: "WebGPU unavailable" });
    });

    const client = new LocalGemmaWorkerClient(() => worker as unknown as Worker);
    await expect(collect(client.streamText({ model: "test-model", messages: [] }))).rejects.toThrow(
      "WebGPU unavailable"
    );
  });

  it("throws with a default message when the worker error has no text", async () => {
    const worker = makeFakeWorker(({ id }, send) => {
      send({ id, ok: false });
    });

    const client = new LocalGemmaWorkerClient(() => worker as unknown as Worker);
    await expect(collect(client.streamText({ model: "test-model", messages: [] }))).rejects.toThrow(
      "Browser-local Gemma worker failed."
    );
  });

  it("ignores 'token' messages with empty text", async () => {
    const worker = makeFakeWorker(({ id }, send) => {
      send({ id, type: "token", text: "" });
      send({ id, type: "token", text: "real" });
      send({ id, ok: true, result: "" });
    });

    const client = new LocalGemmaWorkerClient(() => worker as unknown as Worker);
    const chunks = await collect(client.streamText({ model: "test-model", messages: [] }));

    expect(chunks).toEqual(["real"]);
  });
});
