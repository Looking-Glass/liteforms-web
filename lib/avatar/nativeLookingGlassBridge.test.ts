import { describe, expect, it, vi } from "vitest";
import {
  applyNativeLookingGlassBridgeCalibration,
  getNativeLookingGlassBridgeDriverStatus,
  getNativeLookingGlassBridgeState,
  hasNativeLookingGlassBridgeApi,
} from "./nativeLookingGlassBridge";

const getDriverStatus = vi.fn();
const getState = vi.fn();

function makeElectronApi() {
  return {
    isElectron: true,
    platform: "win32" as const,
    versions: { chrome: "1", electron: "1", node: "1" },
    lookingGlassBridge: { getDriverStatus, getState },
  };
}

const calibration: LiteformsNativeBridgeCalibration = {
  configVersion: "1.0",
  pitch: { value: 1 },
  slope: { value: 2 },
  center: { value: 3 },
  viewCone: { value: 40 },
  invView: { value: 1 },
  verticalAngle: { value: 0 },
  DPI: { value: 324 },
  screenW: { value: 1536 },
  screenH: { value: 2048 },
  flipImageX: { value: 0 },
  flipImageY: { value: 0 },
  flipSubp: { value: 0 },
  serial: "LKG-P123",
  subpixelCells: [],
  CellPatternMode: { value: 0 },
};

describe("native Looking Glass Bridge helpers", () => {
  it("reports when the Electron native bridge API is present", () => {
    expect(hasNativeLookingGlassBridgeApi({ liteformsElectron: undefined })).toBe(false);
    expect(
      hasNativeLookingGlassBridgeApi({
        liteformsElectron: makeElectronApi(),
      })
    ).toBe(true);
  });

  it("reads native Bridge driver status through the Electron API", async () => {
    const state: LiteformsNativeBridgeDriverStatus = {
      available: true,
      source: "native",
      platformDir: "win32-x64",
      runtimeDir: "C:\\Liteforms\\resources\\bridge\\win32-x64",
      libraryPath: "C:\\Liteforms\\resources\\bridge\\win32-x64\\bridge_inproc.dll",
      libraryName: "bridge_inproc.dll",
      runtimeSource: "bundled",
    };
    getDriverStatus.mockResolvedValueOnce(state);

    await expect(getNativeLookingGlassBridgeDriverStatus({ liteformsElectron: makeElectronApi() })).resolves.toBe(
      state
    );
  });

  it("reads native Bridge state through the Electron API", async () => {
    const state: LiteformsNativeBridgeState = {
      available: false,
      source: "native",
      error: "No display",
    };
    getState.mockResolvedValueOnce(state);

    await expect(
      getNativeLookingGlassBridgeState({
        liteformsElectron: makeElectronApi(),
      })
    ).resolves.toBe(state);
  });

  it("applies native calibration and quilt settings to WebXR config", () => {
    const updateViewControls = vi.fn();
    const config = {
      calibration: undefined,
      updateViewControls,
    };

    const applied = applyNativeLookingGlassBridgeCalibration(config, {
      available: true,
      source: "native",
      display: { id: "1", name: "Looking Glass Go", serial: "LKG-P123", width: 1536, height: 2048 },
      calibration,
      viewControls: {
        columns: 8,
        rows: 6,
        quiltResolution: { width: 3360, height: 3360 },
      },
    });

    expect(applied).toBe(true);
    expect(config.calibration).toBe(calibration);
    expect(updateViewControls).toHaveBeenCalledWith({
      columns: 8,
      rows: 6,
      quiltResolution: { width: 3360, height: 3360 },
    });
  });
});
