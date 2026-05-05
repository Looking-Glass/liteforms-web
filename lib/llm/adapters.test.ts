import { describe, expect, it, vi, afterEach } from "vitest";
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

  it("streams OpenClaw through its OpenAI-compatible HTTP gateway while keeping the OpenClaw provider", async () => {
    const fetchMock = vi.fn(async () =>
      streamResponse(['data: {"choices":[{"delta":{"content":"Claw"}}]}\n\n', "data: [DONE]\n\n"])
    );
    const config: BaseProviderConfig = {
      provider: "openclaw",
      model: "openclaw/default",
      baseUrl: "http://127.0.0.1:18789/v1",
      credential: "gateway-token"
    };
    const adapter = createLlmAdapter({ config, fetch: fetchMock });

    await expect(collect(adapter.streamText({ config, messages: [{ role: "user", content: "Hi" }] }))).resolves.toBe(
      "Claw"
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:18789/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer gateway-token" }),
        body: expect.stringContaining('"model":"openclaw/default"')
      })
    );
  });

  it("explains OpenClaw 404 responses as a disabled OpenAI-compatible endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response("not found", { status: 404 }));
    const config: BaseProviderConfig = {
      provider: "openclaw",
      model: "openclaw/default",
      baseUrl: "http://127.0.0.1:18789/v1"
    };
    const adapter = createLlmAdapter({ config, fetch: fetchMock });

    await expect(collect(adapter.streamText({ config, messages: [{ role: "user", content: "Hi" }] }))).rejects.toThrow(
      /gateway\.http\.endpoints\.chatCompletions\.enabled/
    );
  });

  it("explains OpenClaw 401 responses as a missing or invalid gateway token", async () => {
    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    const config: BaseProviderConfig = {
      provider: "openclaw",
      model: "openclaw/default",
      baseUrl: "http://127.0.0.1:18789/v1"
    };
    const adapter = createLlmAdapter({ config, fetch: fetchMock });

    await expect(collect(adapter.streamText({ config, messages: [{ role: "user", content: "Hi" }] }))).rejects.toThrow(
      /gateway\.auth\.token/
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
        headers: expect.objectContaining({
          "x-api-key": "ant",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        })
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

  describe("cloud provider proxy routing", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("routes cloud providers through /api/llm/stream proxy when no custom fetch is provided", async () => {
      const proxyFetchMock = vi.fn(async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("Proxied response"));
              controller.close();
            }
          })
        )
      );
      vi.stubGlobal("fetch", proxyFetchMock);

      const config: BaseProviderConfig = { provider: "anthropic", model: "claude-3-5-sonnet-latest", credential: "ant" };
      const adapter = createLlmAdapter({ config });

      await expect(collect(adapter.streamText({ config, messages: [{ role: "user", content: "Hi" }] }))).resolves.toBe(
        "Proxied response"
      );

      expect(proxyFetchMock).toHaveBeenCalledWith(
        "/api/llm/stream",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"provider":"anthropic"')
        })
      );
    });

    it("routes openai through proxy when no custom fetch is provided", async () => {
      const proxyFetchMock = vi.fn(async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("OpenAI proxied"));
              controller.close();
            }
          })
        )
      );
      vi.stubGlobal("fetch", proxyFetchMock);

      const config: BaseProviderConfig = { provider: "openai", model: "gpt-4.1-mini", credential: "sk-test" };
      const adapter = createLlmAdapter({ config });

      await expect(collect(adapter.streamText({ config, messages: [{ role: "user", content: "Hi" }] }))).resolves.toBe(
        "OpenAI proxied"
      );

      expect(proxyFetchMock).toHaveBeenCalledWith(
        "/api/llm/stream",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("routes OpenClaw through proxy when no custom fetch is provided to avoid browser CORS", async () => {
      const proxyFetchMock = vi.fn(async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("OpenClaw proxied"));
              controller.close();
            }
          })
        )
      );
      vi.stubGlobal("fetch", proxyFetchMock);

      const config: BaseProviderConfig = {
        provider: "openclaw",
        model: "openclaw/default",
        baseUrl: "http://127.0.0.1:18789/v1"
      };
      const adapter = createLlmAdapter({ config });

      await expect(collect(adapter.streamText({ config, messages: [{ role: "user", content: "Hi" }] }))).resolves.toBe(
        "OpenClaw proxied"
      );

      expect(proxyFetchMock).toHaveBeenCalledWith(
        "/api/llm/stream",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"provider":"openclaw"')
        })
      );
    });

    it("does NOT proxy local providers (ollama) even without custom fetch", async () => {
      const localFetchMock = vi.fn(async () => streamResponse(['{"message":{"content":"Local direct"}}\n']));
      vi.stubGlobal("fetch", localFetchMock);

      const config: BaseProviderConfig = { provider: "ollama", model: "llama3.2" };
      const adapter = createLlmAdapter({ config });

      await expect(collect(adapter.streamText({ config, messages: [{ role: "user", content: "Hi" }] }))).resolves.toBe(
        "Local direct"
      );

      expect(localFetchMock).toHaveBeenCalledWith(
        "http://localhost:11434/api/chat",
        expect.objectContaining({ method: "POST" })
      );
    });
  });
});
