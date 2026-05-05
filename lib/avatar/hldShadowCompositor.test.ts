import { describe, expect, it } from "vitest";
import {
  buildShadowImageData,
  computeShadowWizardResolutionScale,
  hasOpaqueSilhouettePixels,
} from "./hldShadowCompositor";

describe("computeShadowWizardResolutionScale", () => {
  it("averages the horizontal and vertical preview-to-display scale", () => {
    expect(computeShadowWizardResolutionScale(200, 400, 100, 100)).toBe(3);
  });

  it("uses 1 when preview dimensions are unavailable", () => {
    expect(computeShadowWizardResolutionScale(200, 400, 0, 100)).toBe(1);
  });
});

describe("buildShadowImageData", () => {
  it("turns opaque silhouette pixels black while preserving alpha", () => {
    const source = {
      width: 1,
      height: 2,
      data: new Uint8ClampedArray([
        255, 128, 64, 255,
        255, 255, 255, 0,
      ]),
    } as ImageData;

    const shadow = buildShadowImageData(source);

    expect(Array.from(shadow.data)).toEqual([
      0, 0, 0, 255,
      255, 255, 255, 0,
    ]);
  });
});

describe("hasOpaqueSilhouettePixels", () => {
  it("returns true when any alpha channel value is non-zero", () => {
    expect(hasOpaqueSilhouettePixels({
      data: new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 1]),
    } as ImageData)).toBe(true);
  });

  it("returns false for a fully transparent image", () => {
    expect(hasOpaqueSilhouettePixels({
      data: new Uint8ClampedArray([0, 0, 0, 0]),
    } as ImageData)).toBe(false);
  });
});
