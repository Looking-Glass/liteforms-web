import { describe, it, expect, vi, afterEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";
import { getOpenAiCodexAuthStore } from "@/lib/llm/openAiCodexAuthStore";

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

function makeResponsesSSEStream(text: string) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: {"type":"response.output_text.delta","delta":"${text}"}\n\ndata: [DONE]\n\n`)
        );
        controller.close();
      }
    })
  );
}

describe("POST /api/llm/stream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    const store = getOpenAiCodexAuthStore();
    store.credential = undefined;
    store.pending = undefined;
  });

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

  it("uses the signed-in OpenAI Codex OAuth token with ChatGPT Codex Responses", async () => {
    getOpenAiCodexAuthStore().credential = {
      access: "codex-access-token",
      refresh: "codex-refresh-token",
      expires: Date.now() + 60_000
    };
    const fetchSpy = vi.fn(async () => makeResponsesSSEStream("Codex says hi"));
    vi.stubGlobal("fetch", fetchSpy);

    const req = new NextRequest("http://localhost/api/llm/stream", {
      method: "POST",
      body: JSON.stringify({
        config: { provider: "openai-codex", model: "gpt-5.5" },
        messages: [{ role: "user", content: "Hi" }]
      })
    });

    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Codex says hi");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://chatgpt.com/backend-api/codex/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Accept: "text/event-stream",
          Authorization: "Bearer codex-access-token"
        }),
        body: expect.stringContaining('"stream":true')
      })
    );
  });

  it("refreshes an expired OpenAI Codex OAuth token before streaming", async () => {
    getOpenAiCodexAuthStore().credential = {
      access: "expired-token",
      refresh: "codex-refresh-token",
      expires: Date.now() - 1
    };
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          access_token: "fresh-token",
          refresh_token: "fresh-refresh-token",
          expires_in: 3600
        })
      )
      .mockResolvedValueOnce(makeResponsesSSEStream("Fresh Codex"));
    vi.stubGlobal("fetch", fetchSpy);

    const req = new NextRequest("http://localhost/api/llm/stream", {
      method: "POST",
      body: JSON.stringify({
        config: { provider: "openai-codex", model: "gpt-5.5" },
        messages: [{ role: "user", content: "Hi" }]
      })
    });

    const response = await POST(req);

    expect(await response.text()).toBe("Fresh Codex");
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "https://auth.openai.com/oauth/token",
      expect.objectContaining({
        method: "POST",
        body: expect.any(URLSearchParams)
      })
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "https://chatgpt.com/backend-api/codex/responses",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer fresh-token" })
      })
    );
    expect(getOpenAiCodexAuthStore().credential).toMatchObject({
      access: "fresh-token",
      refresh: "fresh-refresh-token"
    });
  });

  it("returns a readable sign-in error when OpenAI Codex has no OAuth token", async () => {
    const req = new NextRequest("http://localhost/api/llm/stream", {
      method: "POST",
      body: JSON.stringify({
        config: { provider: "openai-codex", model: "gpt-5.5" },
        messages: [{ role: "user", content: "Hi" }]
      })
    });

    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(await response.text()).toMatch(/not signed in/i);
  });
});
