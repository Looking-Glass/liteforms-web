import { describe, expect, it } from "vitest";
import { parseAnthropicSseLine, parseOpenAiCompatibleSseLine } from "./stream-parsers";

describe("LLM stream parsers", () => {
  it("extracts OpenAI-compatible content deltas", () => {
    expect(
      parseOpenAiCompatibleSseLine('data: {"choices":[{"delta":{"content":"Hello"}}]}')
    ).toBe("Hello");
    expect(parseOpenAiCompatibleSseLine("data: [DONE]")).toBeNull();
  });

  it("extracts Anthropic content block deltas", () => {
    expect(
      parseAnthropicSseLine('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}')
    ).toBe("Hi");
    expect(parseAnthropicSseLine('event: ping')).toBeNull();
  });
});
