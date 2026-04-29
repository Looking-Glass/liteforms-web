import { describe, expect, it } from "vitest";
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D } from "three";
import { computeLookingGlassFocalPoint } from "./lookingGlassIntegration";

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
