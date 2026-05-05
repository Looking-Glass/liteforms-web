import { describe, expect, it } from "vitest";
import {
  buildPopupFeatureString,
  findSecondaryScreen,
  isLookingGlassDeviceConnected,
  openHldHologramWindow,
} from "./hologramWindow";

describe("isLookingGlassDeviceConnected", () => {
  it("returns true when the Looking Glass calibration has a serial", () => {
    expect(isLookingGlassDeviceConnected({ calibration: { serial: "LKG-P123" } })).toBe(true);
  });

  it("returns false when the calibration still has the empty default serial", () => {
    expect(isLookingGlassDeviceConnected({ calibration: { serial: "" } })).toBe(false);
  });
});

describe("findSecondaryScreen", () => {
  it("prefers a non-primary screen", () => {
    const secondary = { left: 1920, top: 0, width: 1080, height: 1920, isPrimary: false };
    expect(findSecondaryScreen([
      { left: 0, top: 0, width: 1920, height: 1080, isPrimary: true },
      secondary,
    ])).toBe(secondary);
  });

  it("falls back to the first screen that is not the current window screen", () => {
    const secondary = { left: -1280, top: 0, width: 1280, height: 720 };
    expect(findSecondaryScreen([
      { left: 0, top: 0, width: 1920, height: 1080 },
      secondary,
    ], { screenLeft: 0, screenTop: 0 })).toBe(secondary);
  });
});

describe("buildPopupFeatureString", () => {
  it("uses secondary screen bounds when available", () => {
    expect(buildPopupFeatureString({ left: 1920, top: 0, width: 1080, height: 1920 })).toContain(
      "left=1920,top=0,width=1080,height=1920"
    );
  });

  it("uses the manual popup size without a screen", () => {
    expect(buildPopupFeatureString()).toContain("width=640,height=960");
  });
});

describe("openHldHologramWindow", () => {
  it("opens a blank popup instead of loading a second app route", async () => {
    const calls: unknown[][] = [];
    const win = {
      open: (...args: unknown[]) => {
        calls.push(args);
        return null;
      },
    };

    await openHldHologramWindow(win as Window);

    expect(calls[0][0]).toBe("");
    expect(calls[0][1]).toBe("liteforms-hld-hologram");
  });
});
