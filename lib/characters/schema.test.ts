import { describe, expect, it } from "vitest";
import { characterInputSchema, normalizeCharacterInput } from "./schema";

describe("characterInputSchema", () => {
  it("accepts the MVP character fields required by the Liteforms API", () => {
    expect(
      normalizeCharacterInput({
        name: "Ada",
        description: "A precise helper",
        pronouns: "THEY",
        sceneId: "",
        voice: { voiceName: "af_bella" }
      })
    ).toMatchObject({
      name: "Ada",
      description: "A precise helper",
      pronouns: "THEY",
      sceneId: "default",
      voice: { voiceName: "af_bella" }
    });
  });

  it("rejects unsupported pronouns and provider credential fields", () => {
    expect(() =>
      characterInputSchema.parse({
        name: "Ada",
        description: "A precise helper",
        pronouns: "OTHER",
        sceneId: "default",
        voice: {},
        apiKey: "must-not-leave-browser"
      })
    ).toThrow();
  });
});
