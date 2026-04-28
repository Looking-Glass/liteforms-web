import { describe, it, expect, vi, afterEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";

function makeAnthropicSSEStream(text: string) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"${text}"}}\n\n`
          )
        );
        controller.close();
      }
    })
  );
}

function makeOpenAiSSEStream(text: string) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: {"choices":[{"delta":{"content":"${text}"}}]}\n\ndata: [DONE]\n\n`)
        );
        controller.close();
      }
    })
  );
}

describe("POST /api/llm/stream", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("proxies Anthropic requests server-side and returns plain-text stream", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => makeAnthropicSSEStream("Hello")));

    const req = new NextRequest("http://localhost/api/llm/stream", {
      method: "POST",
      body: JSON.stringify({
        config: { provider: "anthropic", model: "claude-3-5-sonnet-latest", credential: "ant" },
        messages: [{ role: "user", content: "Hi" }]
      })
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Hello");
  });

  it("proxies OpenAI requests server-side and returns plain-text stream", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => makeOpenAiSSEStream("Hi there")));

    const req = new NextRequest("http://localhost/api/llm/stream", {
      method: "POST",
      body: JSON.stringify({
        config: {
          provider: "openai",
          model: "gpt-4.1-mini",
          credential: "sk-test",
          baseUrl: "https://api.openai.com/v1"
        },
        messages: [{ role: "user", content: "Hi" }]
      })
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Hi there");
  });

  it("calls the external Anthropic endpoint directly (server-side, no proxy loop)", async () => {
    const fetchSpy = vi.fn(async () => makeAnthropicSSEStream("Direct"));
    vi.stubGlobal("fetch", fetchSpy);

    const req = new NextRequest("http://localhost/api/llm/stream", {
      method: "POST",
      body: JSON.stringify({
        config: { provider: "anthropic", model: "claude-3-5-sonnet-latest", credential: "ant" },
        messages: [{ role: "user", content: "Hi" }]
      })
    });

    await POST(req);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "anthropic-dangerous-direct-browser-access": "true" })
      })
    );
  });
});
