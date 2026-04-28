import { describe, expect, it } from "vitest";
import { sanitizeAssistantText } from "./output";

describe("assistant output cleanup", () => {
  it("removes complete reasoning blocks from assistant text", () => {
    expect(sanitizeAssistantText("<think>private reasoning</think>Hi! How can I help?")).toBe("Hi! How can I help?");
  });

  it("removes unfinished reasoning blocks while streaming", () => {
    expect(sanitizeAssistantText("Hello<think>still reasoning")).toBe("Hello");
  });
});
