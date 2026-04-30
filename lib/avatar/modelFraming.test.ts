import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { computeModelFramingFromBounds } from "./modelFraming";

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
