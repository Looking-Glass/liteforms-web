import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  computeModelFramingFromBounds,
  computeModelFramingByHeight,
  computeModelSceneHeight,
} from "./modelFraming";

describe("computeModelFramingFromBounds", () => {
  it("scales model so its max axis matches the target size", () => {
    const size = new Vector3(0.5, 1.7, 0.5);
    const center = new Vector3(0, 0.85, 0);

    const framing = computeModelFramingFromBounds(size, center, 1.8);

    expect(framing.scale).toBeCloseTo(1.8 / 1.7, 4);
  });

  it("places the model centre at the origin, offset upward so the base sits at y≈0", () => {
    const size = new Vector3(0.5, 1.7, 0.5);
    const center = new Vector3(0, 0.85, 0);
    const framing = computeModelFramingFromBounds(size, center, 1.8);
    const scale = 1.8 / 1.7;

    // position.y = -center.y * scale + size.y * scale * 0.5 - 0.05
    const expectedY = -center.y * scale + size.y * scale * 0.5 - 0.05;
    expect(framing.position.y).toBeCloseTo(expectedY, 4);
    expect(framing.position.x).toBeCloseTo(0, 4);
    expect(framing.position.z).toBeCloseTo(0, 4);
  });

  it("sets camera target y to at least 0.75", () => {
    const size = new Vector3(0.1, 0.2, 0.1);
    const center = new Vector3(0, 0.1, 0);

    const framing = computeModelFramingFromBounds(size, center, 1.8);

    expect(framing.cameraTarget.y).toBeGreaterThanOrEqual(0.75);
  });

  it("produces a smaller scale for humanoid VRMs with a target of 1.2 vs 1.8", () => {
    const humanSize = new Vector3(0.5, 1.7, 0.3);
    const humanCenter = new Vector3(0, 0.85, 0);

    const defaultFraming = computeModelFramingFromBounds(humanSize, humanCenter, 1.8);
    const importedFraming = computeModelFramingFromBounds(humanSize, humanCenter, 1.2);

    expect(importedFraming.scale).toBeCloseTo(1.2 / 1.7, 4);
    expect(importedFraming.scale).toBeLessThan(defaultFraming.scale);
  });

  it("scales a wide model (lobster-like) so its width matches the target", () => {
    const size = new Vector3(1.2, 0.4, 0.8);
    const center = new Vector3(0, 0.2, 0);

    const framing = computeModelFramingFromBounds(size, center, 1.8);

    expect(framing.scale).toBeCloseTo(1.8 / 1.2, 4);
  });

  it("returns scale 1 when max axis is zero", () => {
    const size = new Vector3(0, 0, 0);
    const center = new Vector3(0, 0, 0);

    const framing = computeModelFramingFromBounds(size, center, 1.8);

    expect(framing.scale).toBe(1);
  });
});

describe("computeModelFramingByHeight", () => {
  it("scales model so its Y-axis height matches the target height", () => {
    const size = new Vector3(0.5, 1.8, 0.3);
    const center = new Vector3(0, 0.9, 0);

    const framing = computeModelFramingByHeight(size, center, 0.6);

    expect(framing.scale).toBeCloseTo(0.6 / 1.8, 4);
    expect(size.y * framing.scale).toBeCloseTo(0.6, 4);
  });

  it("scales a tall imported humanoid down to match a short reference height", () => {
    const size = new Vector3(0.5, 2.0, 0.3);
    const center = new Vector3(0, 1.0, 0);

    const framing = computeModelFramingByHeight(size, center, 0.6);

    expect(framing.scale).toBeCloseTo(0.6 / 2.0, 4);
    expect(size.y * framing.scale).toBeCloseTo(0.6, 4);
  });

  it("scales a short model up to match a taller reference height", () => {
    const size = new Vector3(0.3, 0.5, 0.3);
    const center = new Vector3(0, 0.25, 0);

    const framing = computeModelFramingByHeight(size, center, 1.2);

    expect(framing.scale).toBeCloseTo(1.2 / 0.5, 4);
    expect(size.y * framing.scale).toBeCloseTo(1.2, 4);
  });

  it("positions the model so its base sits at approximately y=0", () => {
    const size = new Vector3(0.5, 1.8, 0.3);
    const center = new Vector3(0, 0.9, 0);
    const targetHeight = 0.6;
    const framing = computeModelFramingByHeight(size, center, targetHeight);
    const scale = targetHeight / 1.8;

    const expectedY = -center.y * scale + size.y * scale * 0.5 - 0.05;
    expect(framing.position.y).toBeCloseTo(expectedY, 4);
    expect(framing.position.x).toBeCloseTo(0, 4);
    expect(framing.position.z).toBeCloseTo(0, 4);
  });

  it("sets camera target y to at least 0.75 for small models", () => {
    const size = new Vector3(0.1, 0.2, 0.1);
    const center = new Vector3(0, 0.1, 0);

    const framing = computeModelFramingByHeight(size, center, 0.1);

    expect(framing.cameraTarget.y).toBeGreaterThanOrEqual(0.75);
  });

  it("returns scale 1 when model has zero height", () => {
    const size = new Vector3(0.5, 0, 0.3);
    const center = new Vector3(0, 0, 0);

    const framing = computeModelFramingByHeight(size, center, 0.6);

    expect(framing.scale).toBe(1);
  });
});

describe("computeModelSceneHeight", () => {
  it("returns the Y height the model occupies after applying the max-axis framing scale", () => {
    // size 0.5 × 1.7 × 0.5 → maxAxis = 1.7, scale = 1.8/1.7
    // scene height = 1.7 * (1.8/1.7) = 1.8
    const size = new Vector3(0.5, 1.7, 0.5);
    const expectedHeight = size.y * (1.8 / Math.max(size.x, size.y, size.z));

    const result = computeModelSceneHeight(size, 1.8);

    expect(result).toBeCloseTo(expectedHeight, 4);
  });

  it("returns the Y height for a wide model (lobster-like) where x is the max axis", () => {
    // size 1.2 × 0.4 × 0.8 → maxAxis = 1.2, scale = 1.8/1.2 = 1.5
    // scene height = 0.4 * 1.5 = 0.6
    const size = new Vector3(1.2, 0.4, 0.8);
    const result = computeModelSceneHeight(size, 1.8);

    expect(result).toBeCloseTo(0.4 * (1.8 / 1.2), 4);
  });

  it("returns 0 when height is 0", () => {
    const size = new Vector3(1.0, 0, 0.5);
    const result = computeModelSceneHeight(size, 1.8);
    expect(result).toBe(0);
  });
});
