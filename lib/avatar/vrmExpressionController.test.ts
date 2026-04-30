import { describe, expect, it, vi } from "vitest";
import {
  applyVrmExpression,
  applyVrmMouthFrame,
  clearVrmMouth,
  getVrmExpressionDebugSummaries,
  getVrmExpressionNames,
  hasBoundVrmExpression,
  resetVrmExpressions,
  resolveVrmMouthExpressionName
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

  it("resolves VRM mouth expressions under VRM 0.x uppercase names", () => {
    const expressionManager = {
      setValue: vi.fn(),
      expressionMap: {
        A: { binds: [{}] },
        E: { binds: [{}] },
        I: { binds: [{}] },
        O: { binds: [{}] },
        U: { binds: [{}] }
      }
    };

    expect(resolveVrmMouthExpressionName(expressionManager, "aa")).toBe("A");
    expect(resolveVrmMouthExpressionName(expressionManager, "ee")).toBe("E");
    expect(resolveVrmMouthExpressionName(expressionManager, "ih")).toBe("I");
    expect(resolveVrmMouthExpressionName(expressionManager, "oh")).toBe("O");
    expect(resolveVrmMouthExpressionName(expressionManager, "ou")).toBe("U");
  });

  it("resolves VRM mouth expressions under VRM 1.x lowercase names first", () => {
    const expressionManager = {
      setValue: vi.fn(),
      expressionMap: {
        aa: { binds: [{}] },
        A: { binds: [{}] }
      }
    };

    expect(resolveVrmMouthExpressionName(expressionManager, "aa")).toBe("aa");
  });

  it("returns null when mouth expression has no bound candidates", () => {
    const expressionManager = {
      setValue: vi.fn(),
      expressionMap: {
        aa: { binds: [] }
      }
    };

    expect(resolveVrmMouthExpressionName(expressionManager, "aa")).toBeNull();
    expect(resolveVrmMouthExpressionName(expressionManager, "ee")).toBeNull();
    expect(resolveVrmMouthExpressionName(undefined, "aa")).toBeNull();
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
