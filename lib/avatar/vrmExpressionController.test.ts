import { describe, expect, it, vi } from "vitest";
import {
  applyVrmExpression,
  applyVrmMouthFrame,
  clearVrmMouth,
  getVrmExpressionDebugSummaries,
  getVrmExpressionNames,
  hasBoundVrmExpression,
  resetVrmExpressions
} from "./vrmExpressionController";

describe("VRM expression controller", () => {
  it("sets the active VRM mouth preset and clears other mouth presets", () => {
    const expressionManager = { setValue: vi.fn(), update: vi.fn() };

    applyVrmMouthFrame(expressionManager, { vrmExpression: "ee", weight: 0.75 });

    expect(expressionManager.setValue).toHaveBeenCalledWith("aa", 0);
    expect(expressionManager.setValue).toHaveBeenCalledWith("ih", 0);
    expect(expressionManager.setValue).toHaveBeenCalledWith("ou", 0);
    expect(expressionManager.setValue).toHaveBeenCalledWith("ee", 0.75);
    expect(expressionManager.setValue).toHaveBeenCalledWith("oh", 0);
    expect(expressionManager.update).toHaveBeenCalled();
  });

  it("clears every VRM mouth preset", () => {
    const expressionManager = { setValue: vi.fn(), update: vi.fn() };

    clearVrmMouth(expressionManager);

    expect(expressionManager.setValue).toHaveBeenCalledTimes(5);
    expect(expressionManager.setValue).toHaveBeenCalledWith("aa", 0);
    expect(expressionManager.setValue).toHaveBeenCalledWith("ih", 0);
    expect(expressionManager.setValue).toHaveBeenCalledWith("ou", 0);
    expect(expressionManager.setValue).toHaveBeenCalledWith("ee", 0);
    expect(expressionManager.setValue).toHaveBeenCalledWith("oh", 0);
    expect(expressionManager.update).toHaveBeenCalled();
  });

  it("applies and resets debug expressions directly", () => {
    const expressionManager = { setValue: vi.fn(), resetValues: vi.fn(), update: vi.fn() };

    applyVrmExpression(expressionManager, "happy", 1);
    resetVrmExpressions(expressionManager);

    expect(expressionManager.setValue).toHaveBeenCalledWith("happy", 1);
    expect(expressionManager.resetValues).toHaveBeenCalled();
    expect(expressionManager.update).toHaveBeenCalledTimes(2);
  });

  it("lists expression names from the loaded VRM expression map", () => {
    expect(getVrmExpressionNames({ setValue: vi.fn(), expressionMap: { oh: {}, aa: {}, blink: {} } })).toEqual([
      "aa",
      "blink",
      "oh"
    ]);
  });

  it("summarizes expression bind counts for debugging", () => {
    expect(
      getVrmExpressionDebugSummaries({
        setValue: vi.fn(),
        expressionMap: {
          aa: { binds: [{}, {}] },
          blink: { binds: [] }
        }
      })
    ).toEqual(["aa(2)", "blink(0)"]);
  });

  it("detects whether a VRM expression has visible binds", () => {
    const expressionManager = {
      setValue: vi.fn(),
      expressionMap: {
        aa: { binds: [{}] },
        ee: { binds: [] }
      }
    };

    expect(hasBoundVrmExpression(expressionManager, "aa")).toBe(true);
    expect(hasBoundVrmExpression(expressionManager, "ee")).toBe(false);
    expect(hasBoundVrmExpression(expressionManager, "ou")).toBe(false);
    expect(hasBoundVrmExpression(expressionManager, null)).toBe(false);
  });
});
