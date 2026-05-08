import { describe, expect, it } from "vitest";
import { createRmsLipSyncFrame, mapVisemeGroupToVrmExpression, mapWordTimingsToVisemes } from "./lipSync";

describe("lip sync", () => {
  it("maps Kokoro word timing data to scheduled mouth visemes", () => {
    expect(mapWordTimingsToVisemes([{ word: "pop", start: 0.1, end: 0.35 }])).toEqual([
      { target: "viseme_PP", group: "A", vrmExpression: "aa", start: 0.1, end: 0.35, weight: 1 }
    ]);
  });

  it("maps AI-Avatar viseme groups to VRM 1.0 mouth expression presets", () => {
    expect(mapVisemeGroupToVrmExpression("A")).toBe("aa");
    expect(mapVisemeGroupToVrmExpression("E")).toBe("ee");
    expect(mapVisemeGroupToVrmExpression("U")).toBe("ou");
    expect(mapVisemeGroupToVrmExpression("O")).toBe("oh");
    expect(mapVisemeGroupToVrmExpression("S")).toBe("ih");
    expect(mapVisemeGroupToVrmExpression("Silence")).toBeNull();
  });

  it("creates an RMS fallback mouth-open frame", () => {
    expect(createRmsLipSyncFrame(0.6)).toEqual({ target: "viseme_aa", group: "A", vrmExpression: "aa", weight: 0.6 });
    expect(createRmsLipSyncFrame(4)).toEqual({ target: "viseme_aa", group: "A", vrmExpression: "aa", weight: 1 });
    expect(createRmsLipSyncFrame(4, { maxWeight: 1.8, preferMorphTarget: true })).toEqual({
      target: "viseme_aa",
      group: "A",
      vrmExpression: "aa",
      weight: 1.8,
      preferMorphTarget: true
    });
  });
});
