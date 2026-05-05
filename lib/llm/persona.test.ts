import { describe, expect, it } from "vitest";
import { buildChatMessages } from "./persona";

const persona = {
  name: "Ada",
  pronouns: "THEY" as const,
  personality: "Precise and curious."
};

describe("LLM persona prompt", () => {
  it("injects Liteforms persona for ordinary providers", () => {
    const messages = buildChatMessages({
      provider: "openai",
      persona,
      messages: [{ role: "user", content: "Hello" }]
    });

    expect(messages[0]).toMatchObject({ role: "system" });
    expect(messages[0]?.content).toContain("Ada");
    expect(messages[0]?.content).toContain("Precise and curious.");
  });

  it("never injects Liteforms persona for OpenClaw", () => {
    const messages = buildChatMessages({
      provider: "openclaw",
      persona,
      messages: [{ role: "user", content: "Hello" }]
    });

    expect(messages).toEqual([{ role: "user", content: "Hello" }]);
  });
});
