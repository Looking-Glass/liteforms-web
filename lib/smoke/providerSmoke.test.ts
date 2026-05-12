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

  it("includes cloud LLM, TTS, STT, and Google Live providers while skipping local-only providers", () => {
    const cases = buildSmokeProviderCases();
    const ids = cases.map((testCase) => `${testCase.kind}:${testCase.provider}`);

    expect(ids).toContain("llm:openai");
    expect(ids).toContain("llm:anthropic");
    expect(ids).toContain("llm:google-live");
    expect(ids).toContain("tts:elevenlabs");
    expect(ids).toContain("tts:google");
    expect(ids).toContain("stt:mistral");

    expect(ids).not.toContain("llm:browser-local-gemma");
    expect(ids).not.toContain("llm:browser-local-qwen");
    expect(ids).not.toContain("llm:openclaw");
    expect(ids).not.toContain("tts:kokoro");
    expect(ids).not.toContain("stt:distil-whisper");
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
