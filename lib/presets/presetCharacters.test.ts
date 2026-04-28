import { describe, expect, it } from "vitest";
import { getPresetCharacterById, presetCharacters } from "./presetCharacters";

describe("presetCharacters", () => {
  it("provides at least one chat-ready character without requiring login", () => {
    expect(presetCharacters.length).toBeGreaterThan(0);
    expect(presetCharacters[0]).toMatchObject({
      requiresLogin: false,
      llmProvider: "browser-local-gemma",
      ttsProvider: "kokoro"
    });
  });

  it("can resolve a preset by id", () => {
    expect(getPresetCharacterById(presetCharacters[0].id)?.id).toBe(presetCharacters[0].id);
    expect(getPresetCharacterById("missing")).toBeUndefined();
  });
});
