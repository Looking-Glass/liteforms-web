import { describe, expect, it } from "vitest";
import { buildOpenAiCodexResponsesPayload, parseOpenAiResponsesSseLine } from "./openAiCodexResponses";

describe("OpenAI Codex Responses transport", () => {
  it("matches OpenClaw by sending persona system text as top-level instructions", () => {
    const payload = buildOpenAiCodexResponsesPayload({
      config: { provider: "openai-codex", model: "gpt-5.5" },
      persona: {
        name: "Ava",
        pronouns: "THEY",
        personality: "Precise and concise."
      },
      messages: [{ role: "user", content: "Hello" }]
    });

    expect(payload).toMatchObject({
      model: "gpt-5.5",
      input: [{ role: "user", content: "Hello" }],
      stream: true,
      store: false
    });
    expect(payload.instructions).toMatch(/You are Ava/);
  });

  it("parses Responses output text deltas", () => {
    expect(parseOpenAiResponsesSseLine('data: {"type":"response.output_text.delta","delta":"Hi"}')).toBe("Hi");
    expect(parseOpenAiResponsesSseLine('data: {"output_text":" fallback"}')).toBe(" fallback");
    expect(parseOpenAiResponsesSseLine("data: [DONE]")).toBeNull();
  });
});
