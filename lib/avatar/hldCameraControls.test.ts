import { describe, expect, it } from "vitest";
import { computeHldCameraInitialPosition } from "./hldCameraControls";

describe("computeHldCameraInitialPosition", () => {
  it("moves the camera up by 20 percent", () => {
    expect(computeHldCameraInitialPosition({ x: 0, y: 1.2, z: 3 }).y).toBeCloseTo(1.44);
  });

  it("zooms the camera out by 10 percent", () => {
    expect(computeHldCameraInitialPosition({ x: 0, y: 1.2, z: 3 }).z).toBeCloseTo(3.3);
  });

  it("preserves the horizontal position", () => {
    expect(computeHldCameraInitialPosition({ x: 0.25, y: 1.2, z: 3 }).x).toBe(0.25);
  });
});
