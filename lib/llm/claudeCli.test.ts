import { describe, expect, it } from "vitest";
import { buildClaudeCliArgs, buildClaudeCliPrompt, createClaudeCliJsonlStreamingParser, resolveClaudeCliStatus } from "./claudeCli";

describe("Claude CLI transport", () => {
  it("uses OpenClaw-compatible Claude CLI stream-json arguments", () => {
    expect(buildClaudeCliArgs("claude-sonnet-4-6")).toEqual([
      "-p",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--setting-sources",
      "user",
      "--model",
      "sonnet"
    ]);
  });

  it("builds a stdin prompt from persona and chat history", () => {
    const prompt = buildClaudeCliPrompt({
      config: { provider: "claude-cli", model: "claude-sonnet-4-6" },
      persona: { name: "Ava", pronouns: "THEY", personality: "Direct." },
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello." },
        { role: "user", content: "Continue" }
      ]
    });

    expect(prompt).toContain("System:");
    expect(prompt).toContain("You are Ava");
    expect(prompt).toContain("Assistant:\nHello.");
    expect(prompt).toContain("User:\nContinue");
  });

  it("parses Claude CLI stream-json text deltas and final result", () => {
    const parser = createClaudeCliJsonlStreamingParser();
    expect(
      parser.push(
        '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}}\n'
      )
    ).toEqual(["Hel"]);
    expect(
      parser.push(
        '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}}\n'
      )
    ).toEqual(["lo"]);
    expect(parser.push('{"type":"result","result":"Hello"}\n')).toEqual([]);
    expect(parser.finish()).toEqual([]);
    expect(parser.hasStreamedText()).toBe(true);
    expect(parser.resultText()).toBe("Hello");
  });

  it("returns an actionable status message when Claude CLI cannot be launched", async () => {
    const error = Object.assign(new Error("spawn EINVAL"), { code: "EINVAL" });

    await expect(resolveClaudeCliStatus(() => {
      throw error;
    })).resolves.toMatchObject({
      provider: "claude-cli",
      authenticated: false,
      message: expect.stringMatching(/claude\.exe.*PATH/i)
    });
  });
});
