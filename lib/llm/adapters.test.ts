import { describe, expect, it, vi } from "vitest";
import { createLlmAdapter } from "./adapters";
import type { BaseProviderConfig } from "./types";

async function collect(iterable: AsyncIterable<string>) {
  const chunks: string[] = [];
  for await (const chunk of iterable) {
    chunks.push(chunk);
  }
  return chunks.join("");
}

function streamResponse(lines: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(line));
        }
        controller.close();
      }
    })
  );
}

describe("LLM adapters", () => {
  it("streams browser-local Gemma through the local WebGPU worker client", async () => {
    const worker = {
      async *streamText() {
        yield "Local ";
        yield "Gemma";
      }
    };
    const config: BaseProviderConfig = { provider: "browser-local-gemma", model: "onnx-community/Qwen3-0.6B-ONNX" };
    const adapter = createLlmAdapter({ config, localGemmaWorker: worker });

    await expect(collect(adapter.streamText({ config, messages: [{ role: "user", content: "Hi" }] }))).resolves.toBe(
      "Local Gemma"
    );
  });

  it("streams OpenAI-compatible providers through direct configured endpoints", async () => {
    const fetchMock = vi.fn(async () =>
      streamResponse(['data: {"choices":[{"delta":{"content":"Direct"}}]}\n\n', "data: [DONE]\n\n"])
    );
    const adapter = createLlmAdapter({
      config: { provider: "openai", model: "gpt-4.1-mini", credential: "sk-test" },
      fetch: fetchMock
    });

    await expect(
      collect(
        adapter.streamText({
          config: { provider: "openai", model: "gpt-4.1-mini", credential: "sk-test" },
          messages: [{ role: "user", content: "Say hi" }]
        })
      )
    ).resolves.toBe("Direct");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-test" })
      })
    );
  });

  it("streams Anthropic Messages API SSE directly", async () => {
    const fetchMock = vi.fn(async () =>
      streamResponse([
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Claude"}}\n\n'
      ])
    );
    const config: BaseProviderConfig = { provider: "anthropic", model: "claude-3-5-sonnet-latest", credential: "ant" };
    const adapter = createLlmAdapter({ config, fetch: fetchMock });

    await expect(collect(adapter.streamText({ config, messages: [{ role: "user", content: "Hi" }] }))).resolves.toBe(
      "Claude"
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-api-key": "ant", "anthropic-version": "2023-06-01" })
      })
    );
  });

  it("uses native Ollama chat endpoint by default", async () => {
    const fetchMock = vi.fn(async () => streamResponse(['{"message":{"content":"Local"}}\n']));
    const config: BaseProviderConfig = { provider: "ollama", model: "llama3.2" };
    const adapter = createLlmAdapter({ config, fetch: fetchMock });

    await expect(collect(adapter.streamText({ config, messages: [{ role: "user", content: "Hi" }] }))).resolves.toBe(
      "Local"
    );
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:11434/api/chat", expect.objectContaining({ method: "POST" }));
  });
});
