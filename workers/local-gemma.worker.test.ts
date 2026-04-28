import { describe, expect, it } from "vitest";
import { extractGeneratedText, formatGemma4Messages, formatPromptMessages, getLocalModelRuntimeOptions } from "./local-gemma-helpers";
import type { ChatMessage } from "@/lib/llm";

describe("local Gemma worker helpers", () => {
  it("uses the Gemma 4 WebGPU runtime recommended by the ONNX model card", () => {
    expect(getLocalModelRuntimeOptions("onnx-community/gemma-4-E2B-it-ONNX")).toEqual({
      device: "webgpu",
      dtype: "q4f16"
    });
  });

  it("keeps q8 as the fallback runtime for non-Gemma-4 browser models", () => {
    expect(getLocalModelRuntimeOptions("onnx-community/other-model")).toEqual({
      device: "webgpu",
      dtype: "q8"
    });
  });

  it("passes chat messages to Transformers.js instead of a raw prompt string", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "You are concise." },
      { role: "user", content: "Hi" }
    ];

    expect(formatPromptMessages(messages)).toEqual(messages);
  });

  it("formats Gemma 4 text-only messages with string content for the chat template", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "You are concise." },
      { role: "user", content: "Hi" }
    ];

    expect(formatGemma4Messages(messages)).toEqual([
      { role: "system", content: "You are concise." },
      { role: "user", content: "Hi" }
    ]);
  });

  it("extracts assistant content from conversational text-generation output", () => {
    expect(
      extractGeneratedText([
        {
          generated_text: [
            { role: "user", content: "Hi" },
            { role: "assistant", content: "Hello." }
          ]
        }
      ])
    ).toBe("Hello.");
  });

  it("strips Qwen thinking markup from generated output", () => {
    expect(
      extractGeneratedText([
        {
          generated_text: [
            { role: "user", content: "Andi?" },
            { role: "assistant", content: "<think>reasoning that should not be shown</think>Hi, I am Andi." }
          ]
        }
      ])
    ).toBe("Hi, I am Andi.");
  });
});
