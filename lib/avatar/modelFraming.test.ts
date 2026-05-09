import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, Vector3 } from "three";
import {
  computeModelFramingFromBounds,
  computeModelFramingByHeight,
  computeModelFramingByFootprint,
  computeModelSceneHeight,
  computeModelSceneFootprint,
  measureRenderableMeshBounds,
  solveUniformScaleMultiplierForFootprint,
  solveUniformScaleMultiplierForMaxAxis,
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

describe("measureRenderableMeshBounds", () => {
  it("accounts for nested meshes and submeshes under the measured object", () => {
    const root = new Group();
    const left = new Mesh(new BoxGeometry(1, 2, 1));
    const right = new Mesh(new BoxGeometry(2, 1, 1));
    left.position.set(-2, 1, 0);
    right.position.set(2, 0.5, 0);
    right.scale.setScalar(0.5);
    root.add(left, right);

    const bounds = measureRenderableMeshBounds(root);

    expect(bounds.meshCount).toBe(2);
    expect(bounds.size.x).toBeCloseTo(5, 4);
    expect(bounds.size.y).toBeCloseTo(2, 4);
    expect(bounds.center.x).toBeCloseTo(0, 4);
    expect(bounds.center.y).toBeCloseTo(1, 4);
  });

  it("returns empty bounds when no renderable meshes exist", () => {
    const bounds = measureRenderableMeshBounds(new Group());

    expect(bounds.meshCount).toBe(0);
    expect(bounds.size.length()).toBe(0);
    expect(bounds.center.length()).toBe(0);
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

describe("computeModelFramingByFootprint", () => {
  it("scales a tall imported model by height while keeping it within the reference width", () => {
    const size = new Vector3(0.5, 2.0, 0.3);
    const center = new Vector3(0, 1.0, 0);
    const targetFootprint = { width: 1.8, height: 0.6 };

    const framing = computeModelFramingByFootprint(size, center, targetFootprint);

    expect(framing.scale).toBeCloseTo(0.6 / 2.0, 4);
    expect(size.y * framing.scale).toBeCloseTo(targetFootprint.height, 4);
    expect(size.x * framing.scale).toBeLessThanOrEqual(targetFootprint.width);
  });

  it("scales a wide imported model by width while keeping it within the reference height", () => {
    const size = new Vector3(3.0, 0.5, 0.4);
    const center = new Vector3(0, 0.25, 0);
    const targetFootprint = { width: 1.8, height: 0.6 };

    const framing = computeModelFramingByFootprint(size, center, targetFootprint);

    expect(framing.scale).toBeCloseTo(1.8 / 3.0, 4);
    expect(size.x * framing.scale).toBeCloseTo(targetFootprint.width, 4);
    expect(size.y * framing.scale).toBeLessThanOrEqual(targetFootprint.height);
  });

  it("returns scale 1 when neither model footprint axis can be measured", () => {
    const size = new Vector3(0, 0, 1);
    const center = new Vector3(0, 0, 0);

    const framing = computeModelFramingByFootprint(size, center, { width: 1.8, height: 0.6 });

    expect(framing.scale).toBe(1);
  });

  it("returns a multiplier for already-transformed bounds rather than an absolute root scale", () => {
    const unscaledSize = new Vector3(0.5, 2.0, 0.3);
    const rootScale = 0.25;
    const measuredSize = unscaledSize.clone().multiplyScalar(rootScale);
    const measuredCenter = new Vector3(0, 1.0, 0).multiplyScalar(rootScale);
    const targetFootprint = { width: 1.8, height: 0.6 };

    const framing = computeModelFramingByFootprint(measuredSize, measuredCenter, targetFootprint);
    const finalRootScale = rootScale * framing.scale;

    expect(finalRootScale).toBeCloseTo(0.6 / 2.0, 4);
    expect(unscaledSize.y * finalRootScale).toBeCloseTo(targetFootprint.height, 4);
  });
});

describe("solveUniformScaleMultiplierForFootprint", () => {
  it("finds the direct scale when measured bounds grow linearly", () => {
    const base = new Vector3(0.5, 2.0, 0.3);

    const scale = solveUniformScaleMultiplierForFootprint(
      (multiplier) => base.clone().multiplyScalar(multiplier),
      { width: 1.8, height: 0.6 }
    );

    expect(scale).toBeCloseTo(0.6 / 2.0, 4);
  });

  it("finds the smaller multiplier needed when skinned bounds grow non-linearly", () => {
    const base = new Vector3(0.5, 2.0, 0.3);

    const scale = solveUniformScaleMultiplierForFootprint(
      (multiplier) => base.clone().multiplyScalar(multiplier * multiplier),
      { width: 1.8, height: 0.6 }
    );

    expect(scale).toBeCloseTo(Math.sqrt(0.6 / 2.0), 4);
  });

  it("scales up small models until one footprint axis reaches the target", () => {
    const base = new Vector3(0.25, 0.5, 0.2);

    const scale = solveUniformScaleMultiplierForFootprint(
      (multiplier) => base.clone().multiplyScalar(multiplier),
      { width: 1.8, height: 0.6 }
    );

    expect(scale).toBeCloseTo(0.6 / 0.5, 4);
  });
});

describe("solveUniformScaleMultiplierForMaxAxis", () => {
  it("finds the multiplier that makes the measured max axis match the target", () => {
    const base = new Vector3(1.0, 2.0, 0.5);

    const scale = solveUniformScaleMultiplierForMaxAxis(
      (multiplier) => base.clone().multiplyScalar(multiplier),
      1.8
    );

    expect(scale).toBeCloseTo(1.8 / 2.0, 4);
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

describe("computeModelSceneFootprint", () => {
  it("returns the X/Y footprint the model occupies after applying max-axis framing", () => {
    const size = new Vector3(1.2, 0.4, 0.8);
    const scale = 1.8 / 1.2;

    const result = computeModelSceneFootprint(size, 1.8);

    expect(result.width).toBeCloseTo(1.2 * scale, 4);
    expect(result.height).toBeCloseTo(0.4 * scale, 4);
  });
});
