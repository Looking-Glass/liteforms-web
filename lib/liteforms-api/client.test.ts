import { describe, expect, it, vi } from "vitest";
import { LiteformsApiClient } from "./client";

describe("LiteformsApiClient", () => {
  it("calls account usage with bearer auth for hydration only", async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: "user_1", email: "a@example.com" }));
    const client = new LiteformsApiClient({
      baseUrl: "https://liteforms.test",
      accessToken: "token-123",
      fetch: fetchMock
    });

    await expect(client.getAccountUsage()).resolves.toMatchObject({ email: "a@example.com" });
    expect(fetchMock).toHaveBeenCalledWith("https://liteforms.test/api/liteforms/usage", {
      headers: { Authorization: "Bearer token-123", "Content-Type": "application/json" }
    });
  });

  it("normalizes character CRUD paths without exposing provider credentials", async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: 7, name: "Ada" }));
    const client = new LiteformsApiClient({
      baseUrl: "https://liteforms.test/",
      accessToken: "token-123",
      fetch: fetchMock
    });

    await client.createCharacter({
      name: "Ada",
      description: "Curious",
      pronouns: "THEY",
      sceneId: "default",
      voice: { voiceName: "af_bella" }
    });

    expect(fetchMock).toHaveBeenCalledWith("https://liteforms.test/api/characters", {
      body: "{\"name\":\"Ada\",\"description\":\"Curious\",\"pronouns\":\"THEY\",\"sceneId\":\"default\",\"voice\":{\"voiceName\":\"af_bella\"}}",
      headers: { Authorization: "Bearer token-123", "Content-Type": "application/json" },
      method: "POST"
    });
  });
});
