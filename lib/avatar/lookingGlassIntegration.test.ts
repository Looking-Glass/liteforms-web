import { describe, expect, it } from "vitest";
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D } from "three";
import { computeLookingGlassFocalPoint, computeLkgInlineViewSize } from "./lookingGlassIntegration";

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

  it("handles an object with a very wide footprint without throwing", () => {
    const box = makeBox(10, 1, 10);
    expect(() => computeLookingGlassFocalPoint(box)).not.toThrow();
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
