import { describe, expect, it, vi } from "vitest";
import {
  buildSmokeProviderCases,
  parseEnvFile,
  resolveSmokeCredential,
  runSmokeProviderCase
} from "./providerSmoke";

describe("provider smoke test harness", () => {
  it("parses local env files with comments, exports, and quoted values", () => {
    expect(parseEnvFile(`
      # ignored
      export OPENAI_API_KEY="sk-test"
      GOOGLE_API_KEY='gem-test'
      DEEPGRAM_API_KEY=dg-test # local note
    `)).toEqual({
      OPENAI_API_KEY: "sk-test",
      GOOGLE_API_KEY: "gem-test",
      DEEPGRAM_API_KEY: "dg-test"
    });
  });

  it("includes cloud LLM, TTS, STT, and realtime voice providers while skipping local-only providers", () => {
    const cases = buildSmokeProviderCases();
    const ids = cases.map((testCase) => `${testCase.kind}:${testCase.provider}`);

    expect(ids).toContain("llm:openai");
    expect(ids).toContain("llm:anthropic");
    expect(ids).toContain("llm:google-live");
    expect(ids).toContain("llm:openai-realtime");
    expect(ids).toContain("tts:elevenlabs");
    expect(ids).toContain("tts:google");
    expect(ids).toContain("stt:mistral");

    expect(ids).not.toContain("llm:browser-local-gemma");
    expect(ids).not.toContain("llm:browser-local-qwen");
    expect(ids).not.toContain("llm:openclaw");
    expect(ids).not.toContain("tts:kokoro");
    expect(ids).not.toContain("stt:distil-whisper");
  });

  it("runs an OpenAI Realtime smoke call through a WebSocket", async () => {
    const openAiRealtime = buildSmokeProviderCases().find((testCase) => testCase.kind === "llm" && testCase.provider === "openai-realtime");
    expect(openAiRealtime).toBeDefined();

    class MockWebSocket {
      static instances: MockWebSocket[] = [];
      sent: string[] = [];
      listeners = new Map<string, Array<(event: unknown) => void>>();
      readyState = 1;

      constructor(public url: string, public protocols?: string | string[]) {
        MockWebSocket.instances.push(this);
        setTimeout(() => this.emit("open", {}), 0);
      }

      addEventListener(type: string, handler: (event: unknown) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler]);
      }

      send(data: string) {
        this.sent.push(data);
        if (data.includes("response.create")) {
          setTimeout(() => this.emit("message", { data: JSON.stringify({ type: "response.output_audio_transcript.delta", delta: "OK" }) }), 0);
        }
      }

      close() {
        this.readyState = 3;
      }

      emit(type: string, event: unknown) {
        for (const handler of this.listeners.get(type) ?? []) handler(event);
      }
    }

    await expect(runSmokeProviderCase(openAiRealtime!, {
      env: { OPENAI_API_KEY: "sk-test" },
      WebSocketCtor: MockWebSocket as unknown as typeof WebSocket
    })).resolves.toMatchObject({ skipped: false });

    expect(MockWebSocket.instances[0].url).toBe("wss://api.openai.com/v1/realtime?model=gpt-realtime-2");
    expect(MockWebSocket.instances[0].protocols).toEqual(["realtime", "openai-insecure-api-key.sk-test"]);
    expect(MockWebSocket.instances[0].sent.some((message) => message.includes("session.update"))).toBe(true);
  });

  it("resolves prefixed Liteforms env names before shared provider env names", () => {
    const openAiLlm = buildSmokeProviderCases().find((testCase) => testCase.kind === "llm" && testCase.provider === "openai");
    expect(openAiLlm).toBeDefined();

    expect(resolveSmokeCredential(openAiLlm!, {
      LITEFORMS_LLM_OPENAI_API_KEY: "llm-specific",
      OPENAI_API_KEY: "shared"
    })).toEqual({
      envName: "LITEFORMS_LLM_OPENAI_API_KEY",
      value: "llm-specific"
    });
  });

  it("skips a provider smoke run when no matching API key is present", async () => {
    const openAiLlm = buildSmokeProviderCases().find((testCase) => testCase.kind === "llm" && testCase.provider === "openai");

    await expect(runSmokeProviderCase(openAiLlm!, { env: {} })).resolves.toEqual({
      skipped: true,
      detail: expect.stringContaining("OPENAI_API_KEY")
    });
  });

  it("runs an LLM smoke call through the configured adapter when a key is present", async () => {
    const openAiLlm = buildSmokeProviderCases().find((testCase) => testCase.kind === "llm" && testCase.provider === "openai");
    const fetchMock = vi.fn(async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'));
            controller.close();
          }
        })
      )
    );

    await expect(runSmokeProviderCase(openAiLlm!, {
      env: { OPENAI_API_KEY: "sk-test" },
      fetch: fetchMock
    })).resolves.toMatchObject({ skipped: false });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer sk-test" })
      })
    );
  });
});
