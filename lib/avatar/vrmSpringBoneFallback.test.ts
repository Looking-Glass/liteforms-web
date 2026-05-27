import { describe, expect, it, vi } from "vitest";
import { Group, Object3D } from "three";
import type { VRM, VRMSpringBoneManager } from "@pixiv/three-vrm";
import { prepareVrmSpringBones } from "./vrmSpringBoneFallback";

describe("prepareVrmSpringBones", () => {
  it("resets authored spring bones after the app has transformed the VRM scene", () => {
    const scene = new Group();
    const reset = vi.fn();
    const manager = {
      joints: new Set([{}]),
      reset
    } as unknown as VRMSpringBoneManager;
    const vrm = createVrm(scene, manager);

    const result = prepareVrmSpringBones(vrm);

    expect(result).toEqual({ source: "authored", jointCount: 1 });
    expect(reset).toHaveBeenCalledOnce();
  });

  it("generates a tail spring chain when an uploaded VRM has named tail bones but no spring extension", () => {
    const { scene, tail, tailMid } = createTailScene();
    const vrm = createVrm(scene);

    const result = prepareVrmSpringBones(vrm);

    expect(result).toEqual({ source: "generated", jointCount: 2 });
    const manager = (vrm as VRM & { springBoneManager?: VRMSpringBoneManager }).springBoneManager;
    expect(manager?.joints.size).toBe(2);
    expect([...manager!.joints].map((joint) => joint.bone.name)).toEqual(["tail", "tail.001"]);

    const initialRotation = tail.quaternion.clone();
    for (let i = 0; i < 30; i += 1) {
      manager!.update(1 / 60);
    }

    expect(tail.quaternion.angleTo(initialRotation)).toBeGreaterThan(0.001);
    expect(tailMid.quaternion.length()).toBeGreaterThan(0);
  });

  it("does not synthesize springs for models without a tail chain", () => {
    const scene = new Group();
    const arm = new Object3D();
    arm.name = "forearm.L";
    const hand = new Object3D();
    hand.name = "hand.L";
    hand.position.set(0, -0.2, 0);
    arm.add(hand);
    scene.add(arm);
    const vrm = createVrm(scene);

    const result = prepareVrmSpringBones(vrm);

    expect(result).toEqual({ source: "none", jointCount: 0 });
    expect((vrm as VRM & { springBoneManager?: VRMSpringBoneManager }).springBoneManager).toBeUndefined();
  });
});

function createTailScene() {
  const scene = new Group();
  const hips = new Object3D();
  hips.name = "hips";
  const tail = new Object3D();
  tail.name = "tail";
  tail.position.set(0, 0.4, -0.2);
  const tailMid = new Object3D();
  tailMid.name = "tail.001";
  tailMid.position.set(0, 0, 0.35);
  const tailTip = new Object3D();
  tailTip.name = "tail.002";
  tailTip.position.set(0, 0, 0.3);

  tailMid.add(tailTip);
  tail.add(tailMid);
  hips.add(tail);
  scene.add(hips);
  scene.updateWorldMatrix(true, true);

  return { scene, tail, tailMid, tailTip };
}

function createVrm(scene: Group, springBoneManager?: VRMSpringBoneManager) {
  return {
    scene,
    springBoneManager
  } as unknown as VRM;
}
