import { describe, expect, it, vi } from "vitest";
import { createLookingGlassCalibrationSync } from "./lookingGlassCalibrationSync";
import type { LookingGlassConfigLike } from "./lookingGlassCalibrationSync";

function createConfig() {
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const config = {
    _viewControls: {
      subpixelMode: 1,
    },
    calibration: {
      serial: "LKG-H-TEST",
      screenW: { value: 2160 },
      screenH: { value: 3840 },
      CellPatternMode: { value: 4 },
      subpixelCells: [
        {
          ROffsetX: -0.2,
          ROffsetY: -0.3,
          GOffsetX: -0.1,
          GOffsetY: 0.2,
          BOffsetX: 0.3,
          BOffsetY: 0.05,
        },
        {
          ROffsetX: 0.2,
          ROffsetY: -0.25,
          GOffsetX: 0.1,
          GOffsetY: 0.25,
          BOffsetX: -0.3,
          BOffsetY: 0.1,
        },
      ],
    },
    get subpixelMode() {
      return this._viewControls.subpixelMode;
    },
    updateViewControls: vi.fn(),
    addEventListener: vi.fn((_type: "on-config-changed", callback: EventListenerOrEventListenerObject | null) => {
      if (callback) listeners.add(callback);
    }),
    removeEventListener: vi.fn((_type: "on-config-changed", callback: EventListenerOrEventListenerObject | null) => {
      if (callback) listeners.delete(callback);
    }),
    dispatchConfigChanged() {
      for (const listener of listeners) {
        if (typeof listener === "function") {
          listener(new Event("on-config-changed"));
        } else {
          listener.handleEvent(new Event("on-config-changed"));
        }
      }
    },
  };

  return config;
}

describe("createLookingGlassCalibrationSync", () => {
  it("copies CellPatternMode into subpixelMode without dispatching another config change", () => {
    const config = createConfig();

    createLookingGlassCalibrationSync(config);

    expect(config.subpixelMode).toBe(4);
    expect(config.updateViewControls).not.toHaveBeenCalled();
  });

  it("restores raw subpixel cells before later shader recompiles can read them", () => {
    const config = createConfig();
    const rawCells = config.calibration.subpixelCells.map((cell) => ({ ...cell }));

    createLookingGlassCalibrationSync(config);
    config.calibration.subpixelCells[0].ROffsetX /= config.calibration.screenW.value;
    config.calibration.subpixelCells[0].ROffsetY /= config.calibration.screenH.value;
    config.calibration.subpixelCells[1].BOffsetX /= config.calibration.screenW.value;

    config.dispatchConfigChanged();

    expect(config.calibration.subpixelCells).toEqual(rawCells);
  });

  it("removes the config listener during cleanup", () => {
    const config = createConfig();
    const cleanup = createLookingGlassCalibrationSync(config as LookingGlassConfigLike);

    cleanup();

    expect(config.removeEventListener).toHaveBeenCalledWith("on-config-changed", expect.any(Function));
  });
});
