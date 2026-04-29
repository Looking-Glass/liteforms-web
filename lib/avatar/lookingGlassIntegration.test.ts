import { describe, expect, it } from "vitest";
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D } from "three";
import {
  computeLookingGlassCameraArrayState,
  computeLookingGlassFocalPoint,
  computeLkgInlineViewSize,
  withLookingGlassCameraPose,
  withLookingGlassTarget,
} from "./lookingGlassIntegration";

function makeBox(width: number, height: number, depth: number): Mesh {
  return new Mesh(new BoxGeometry(width, height, depth), new MeshBasicMaterial());
}

describe("computeLookingGlassFocalPoint", () => {
  it("centers the focal plane on the framed height of a unit cube", () => {
    const box = makeBox(1, 1, 1);
    // maxAxis=1, scale=1.8/1=1.8, targetY=max(0.75, 1*1.8*0.45)=max(0.75, 0.81)=0.81
    const result = computeLookingGlassFocalPoint(box);

    expect(result.targetX).toBe(0);
    expect(result.targetY).toBeCloseTo(0.81);
    expect(result.targetZ).toBe(0);
    expect(result.targetDiam).toBe(2.0);
  });

  it("clamps targetY to 0.75 for very flat objects", () => {
    const box = makeBox(2, 0.1, 2);
    // maxAxis=2, scale=0.9, targetY=max(0.75, 0.1*0.9*0.45)=max(0.75, 0.0405)=0.75
    const result = computeLookingGlassFocalPoint(box);

    expect(result.targetY).toBe(0.75);
  });

  it("always places focal plane at X=0 and Z=0", () => {
    const box = makeBox(3, 5, 4);
    const result = computeLookingGlassFocalPoint(box);

    expect(result.targetX).toBe(0);
    expect(result.targetZ).toBe(0);
  });

  it("scales targetY correctly for a tall narrow model", () => {
    const box = makeBox(0.5, 4, 0.5);
    // maxAxis=4, scale=1.8/4=0.45, targetY=max(0.75, 4*0.45*0.45)=max(0.75, 0.81)=0.81
    const result = computeLookingGlassFocalPoint(box);

    expect(result.targetY).toBeCloseTo(0.81);
  });

  it("returns targetDiam of 2.0 regardless of model dimensions", () => {
    expect(computeLookingGlassFocalPoint(makeBox(1, 1, 1)).targetDiam).toBe(2.0);
    expect(computeLookingGlassFocalPoint(makeBox(0.1, 10, 0.1)).targetDiam).toBe(2.0);
    expect(computeLookingGlassFocalPoint(makeBox(5, 2, 5)).targetDiam).toBe(2.0);
  });

  it("keeps Looking Glass trackball neutral so it does not double the preview camera pose", () => {
    const result = computeLookingGlassFocalPoint(makeBox(1, 1, 1));
    expect(result.trackballX).toBe(0);
    expect(result.trackballY).toBe(0);
    expect(result.fovy * 180 / Math.PI).toBeCloseTo(18.92, 2);
  });

  it("handles an object with a very wide footprint without throwing", () => {
    const box = makeBox(10, 1, 10);
    expect(() => computeLookingGlassFocalPoint(box)).not.toThrow();
  });
});

describe("withLookingGlassTarget", () => {
  it("overrides only the convergence target coordinates", () => {
    const focalPoint = computeLookingGlassFocalPoint(makeBox(1, 1, 1));
    const result = withLookingGlassTarget(focalPoint, { x: 0.1, y: 0.9, z: -0.2 });

    expect(result.targetX).toBe(0.1);
    expect(result.targetY).toBe(0.9);
    expect(result.targetZ).toBe(-0.2);
    expect(result.targetDiam).toBe(focalPoint.targetDiam);
    expect(result.trackballX).toBe(focalPoint.trackballX);
    expect(result.trackballY).toBe(focalPoint.trackballY);
    expect(result.fovy).toBe(focalPoint.fovy);
  });
});

describe("withLookingGlassCameraPose", () => {
  it("derives LKG trackball and fovy from a desired camera center and convergence target", () => {
    const focalPoint = computeLookingGlassFocalPoint(makeBox(1, 1, 1));
    const target = { x: 0, y: 0.777, z: 0 };
    const position = { x: -3.192, y: 1.176, z: 5.065 };
    const result = withLookingGlassCameraPose(focalPoint, position, target);
    const cameraArrayState = computeLookingGlassCameraArrayState({
      ...result,
      viewCone: 50 * (Math.PI / 180),
      numViews: 48,
    });

    expect(result.targetX).toBe(target.x);
    expect(result.targetY).toBe(target.y);
    expect(result.targetZ).toBe(target.z);
    expect(cameraArrayState.centerPosition.x).toBeCloseTo(position.x, 3);
    expect(cameraArrayState.centerPosition.y).toBeCloseTo(position.y, 3);
    expect(cameraArrayState.centerPosition.z).toBeCloseTo(position.z, 3);
    expect(cameraArrayState.orbitDistance).toBeCloseTo(6, 3);
  });

  it("derives the current tuned LKG camera center and focal target", () => {
    const focalPoint = computeLookingGlassFocalPoint(makeBox(1, 1, 1));
    const target = { x: 0.003, y: 0.877, z: 0.234 };
    const position = { x: -0.071, y: 0.856, z: 6.234 };
    const result = withLookingGlassCameraPose(focalPoint, position, target);
    const cameraArrayState = computeLookingGlassCameraArrayState({
      ...result,
      viewCone: 50 * (Math.PI / 180),
      numViews: 48,
    });

    expect(result.trackballX * 180 / Math.PI).toBeCloseTo(-0.71, 2);
    expect(result.trackballY * 180 / Math.PI).toBeCloseTo(-0.2, 1);
    expect(cameraArrayState.centerPosition.x).toBeCloseTo(position.x, 3);
    expect(cameraArrayState.centerPosition.y).toBeCloseTo(position.y, 3);
    expect(cameraArrayState.centerPosition.z).toBeCloseTo(position.z, 3);
    expect(cameraArrayState.target.x).toBeCloseTo(target.x, 3);
    expect(cameraArrayState.target.y).toBeCloseTo(target.y, 3);
    expect(cameraArrayState.target.z).toBeCloseTo(target.z, 3);
    expect(cameraArrayState.orbitDistance).toBeCloseTo(6, 3);
  });

  it("rejects a camera center equal to the convergence target", () => {
    const focalPoint = computeLookingGlassFocalPoint(makeBox(1, 1, 1));
    const target = { x: 0, y: 1, z: 0 };

    expect(() => withLookingGlassCameraPose(focalPoint, target, target)).toThrow(
      "Looking Glass camera position must differ from target."
    );
  });
});

describe("computeLookingGlassCameraArrayState", () => {
  it("uses trackballX directly as the hologram camera yaw", () => {
    const yaw = Math.atan2(-3.124, 5.107);
    const pitch = Math.asin((1.176 - 0.777) / 6);
    const result = computeLookingGlassCameraArrayState({
      targetX: 0,
      targetY: 0.777,
      targetZ: 0,
      targetDiam: 2,
      trackballX: yaw,
      trackballY: pitch,
      fovy: 2 * Math.atan(1 / 6),
      viewCone: 50 * (Math.PI / 180),
      numViews: 48,
    });

    expect(result.rotationRadians.y).toBeCloseTo(yaw);
    expect(result.rotationRadians.y * 180 / Math.PI).toBeCloseTo(-31.45, 2);
    expect(result.centerPosition.x).toBeCloseTo(-3.124, 3);
    expect(result.centerPosition.y).toBeCloseTo(1.176, 3);
    expect(result.centerPosition.z).toBeCloseTo(5.107, 3);
    expect(result.orbitDistance).toBeCloseTo(6);
  });

  it("reports the first and last quilt view camera positions around the array center", () => {
    const result = computeLookingGlassCameraArrayState({
      targetX: 0,
      targetY: 1,
      targetZ: 0,
      targetDiam: 2,
      trackballX: 0,
      trackballY: 0,
      fovy: 2 * Math.atan(1 / 6),
      viewCone: 40 * (Math.PI / 180),
      numViews: 3,
    });

    expect(result.firstViewPosition.x).toBeLessThan(result.centerPosition.x);
    expect(result.lastViewPosition.x).toBeGreaterThan(result.centerPosition.x);
    expect(result.firstViewPosition.z).toBeCloseTo(result.centerPosition.z);
    expect(result.lastViewPosition.z).toBeCloseTo(result.centerPosition.z);
  });
});

describe("computeLkgInlineViewSize", () => {
  it("returns a 9:16 canvas that fills width when container is wider than 9:16", () => {
    // Container 800x600 — wider than portrait 9:16
    // Max width-constrained: height = 800*16/9 ≈ 1422 > 600, so height-constrain instead
    // width = 600*9/16 = 337.5 → Math.round → 338
    const result = computeLkgInlineViewSize(800, 600);
    expect(result.width).toBe(338);
    expect(result.height).toBe(600);
  });

  it("returns a 9:16 canvas constrained by width when container is taller than 9:16", () => {
    // Container 360x1000 — taller than portrait 9:16
    // Width-constrained: height = 360*16/9 = 640 ≤ 1000, so width-constrain
    const result = computeLkgInlineViewSize(360, 1000);
    expect(result.width).toBe(360);
    expect(result.height).toBe(640);
  });

  it("returns exact 9:16 dimensions when container already matches", () => {
    const result = computeLkgInlineViewSize(450, 800);
    expect(result.width).toBe(450);
    expect(result.height).toBe(800);
  });

  it("never exceeds container dimensions", () => {
    const cases: [number, number][] = [
      [1920, 1080],
      [390, 844],
      [100, 100],
      [1, 1],
    ];
    for (const [w, h] of cases) {
      const result = computeLkgInlineViewSize(w, h);
      expect(result.width).toBeLessThanOrEqual(w);
      expect(result.height).toBeLessThanOrEqual(h);
    }
  });

  it("always produces a 9:16 aspect ratio (width/height ≈ 9/16)", () => {
    const cases: [number, number][] = [
      [800, 600],
      [360, 1000],
      [1920, 1080],
    ];
    for (const [w, h] of cases) {
      const { width, height } = computeLkgInlineViewSize(w, h);
      expect(width / height).toBeCloseTo(9 / 16, 1);
    }
  });
});
