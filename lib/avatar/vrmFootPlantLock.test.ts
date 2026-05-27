import { describe, expect, it, vi } from "vitest";
import { Group, Vector3 } from "three";
import type { Object3D } from "three";
import type { VRM } from "@pixiv/three-vrm";
import { VrmFootPlantLock, shouldEnableBrowserFootPlantDebug } from "./vrmFootPlantLock";

describe("VrmFootPlantLock", () => {
  it("keeps planted VRM feet at their captured world positions after animation drift", () => {
    const { vrm, leftFoot, rightFoot } = createFootedVrm();
    const lock = new VrmFootPlantLock(vrm);

    lock.update();
    const leftAnchor = worldPosition(leftFoot);
    const rightAnchor = worldPosition(rightFoot);

    leftFoot.position.x += 0.035;
    leftFoot.position.z -= 0.025;
    rightFoot.position.x -= 0.02;
    rightFoot.position.y += 0.015;

    lock.update();

    expect(worldPosition(leftFoot).distanceTo(leftAnchor)).toBeLessThan(0.0001);
    expect(worldPosition(rightFoot).distanceTo(rightAnchor)).toBeLessThan(0.0001);
  });

  it("falls back to raw foot bones when normalized bones are unavailable", () => {
    const { vrm, leftFoot } = createFootedVrm({ normalized: false });
    const lock = new VrmFootPlantLock(vrm);

    lock.update();
    const anchor = worldPosition(leftFoot);
    leftFoot.position.x += 0.03;

    lock.update();

    expect(worldPosition(leftFoot).distanceTo(anchor)).toBeLessThan(0.0001);
  });

  it("keeps planted feet locked in model-local space when the model root rotates", () => {
    const { vrm, leftFoot } = createFootedVrm();
    const lock = new VrmFootPlantLock(vrm);

    lock.update();
    vrm.scene.rotateY(0.25);
    vrm.scene.updateWorldMatrix(true, true);
    const rotatedAnchor = worldPosition(leftFoot);

    lock.update();

    expect(worldPosition(leftFoot).distanceTo(rotatedAnchor)).toBeLessThan(0.0001);
  });

  it("locks the rendered raw foot bones after VRM humanoid update", () => {
    const { rawLeftFoot, vrm } = createFootedVrm({
      rawFootOffset: new Vector3(0.025, 0.01, -0.015),
      separateRaw: true
    });
    const lock = new VrmFootPlantLock(vrm);

    lock.update();
    const rawAnchor = worldPosition(rawLeftFoot);
    rawLeftFoot.position.x += 0.02;
    rawLeftFoot.position.z -= 0.015;

    lock.applyPostVrmUpdate();

    expect(worldPosition(rawLeftFoot).distanceTo(rawAnchor)).toBeLessThan(0.0001);
  });

  it("emits opt-in debug events for anchors and corrections", () => {
    const { vrm, leftFoot } = createFootedVrm();
    const logger = vi.fn();
    const lock = new VrmFootPlantLock(vrm, {
      debug: {
        enabled: true,
        logger,
        sampleEveryFrames: 1
      }
    });

    lock.update();
    leftFoot.position.x += 0.03;
    lock.update();
    lock.applyPostVrmUpdate();

    expect(logger).toHaveBeenCalledWith(expect.objectContaining({ type: "init" }));
    expect(logger).toHaveBeenCalledWith(expect.objectContaining({ foot: "leftFoot", type: "anchor" }));
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({
        appliedCorrection: expect.any(Number),
        drift: expect.any(Number),
        foot: "leftFoot",
        source: "normalized",
        type: "correction"
      })
    );
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({
        foot: "leftFoot",
        rawBeforeDrift: expect.any(Number),
        rawDrift: expect.any(Number),
        rawWorld: expect.any(Object),
        type: "postVrmUpdate"
      })
    );
  });

  it("enables browser foot debug from query params or localStorage", () => {
    expect(shouldEnableBrowserFootPlantDebug({ search: "?debugFootLock=1" })).toBe(true);
    expect(shouldEnableBrowserFootPlantDebug({ localStorageValue: "1", search: "" })).toBe(true);
    expect(shouldEnableBrowserFootPlantDebug({ localStorageValue: "0", search: "" })).toBe(false);
  });
});

function createFootedVrm({
  normalized = true,
  rawFootOffset = new Vector3(),
  separateRaw = false
}: {
  normalized?: boolean;
  rawFootOffset?: Vector3;
  separateRaw?: boolean;
} = {}) {
  const scene = new Group();
  const leftLowerLeg = new Group();
  const rightLowerLeg = new Group();
  const leftFoot = new Group();
  const rightFoot = new Group();
  const rawLeftLowerLeg = new Group();
  const rawRightLowerLeg = new Group();
  const rawLeftFoot = separateRaw ? new Group() : leftFoot;
  const rawRightFoot = separateRaw ? new Group() : rightFoot;

  leftLowerLeg.position.set(-0.14, 0.45, 0);
  rightLowerLeg.position.set(0.14, 0.45, 0);
  leftFoot.position.set(0, -0.45, 0.04);
  rightFoot.position.set(0, -0.45, 0.04);
  leftLowerLeg.add(leftFoot);
  rightLowerLeg.add(rightFoot);
  scene.add(leftLowerLeg, rightLowerLeg);
  if (separateRaw) {
    rawLeftLowerLeg.position.copy(leftLowerLeg.position);
    rawRightLowerLeg.position.copy(rightLowerLeg.position);
    rawLeftFoot.position.copy(leftFoot.position).add(rawFootOffset);
    rawRightFoot.position.copy(rightFoot.position).add(rawFootOffset);
    rawLeftLowerLeg.add(rawLeftFoot);
    rawRightLowerLeg.add(rawRightFoot);
    scene.add(rawLeftLowerLeg, rawRightLowerLeg);
  }

  const getNormalizedBoneNode = vi.fn((name: string) => {
    if (!normalized) return null;
    return resolveFoot(name, leftFoot, rightFoot);
  });
  const getRawBoneNode = vi.fn((name: string) => resolveFoot(name, rawLeftFoot, rawRightFoot));

  const vrm = {
    scene,
    humanoid: {
      getNormalizedBoneNode,
      getRawBoneNode
    }
  } as unknown as VRM;

  return { rawLeftFoot, rawRightFoot, vrm, leftFoot, rightFoot };
}

function resolveFoot(name: string, leftFoot: Object3D, rightFoot: Object3D) {
  if (name === "leftFoot") return leftFoot;
  if (name === "rightFoot") return rightFoot;
  return null;
}

function worldPosition(object: Object3D) {
  object.updateWorldMatrix(true, false);
  return object.getWorldPosition(new Vector3());
}
