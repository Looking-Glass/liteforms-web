import { Vector3 } from "three";
import type { Object3D } from "three";
import {
  VRMSpringBoneJoint,
  VRMSpringBoneManager
} from "@pixiv/three-vrm";
import type { VRM } from "@pixiv/three-vrm";

type SpringBoneSource = "authored" | "generated" | "none";

export type VrmSpringBonePreparationResult = {
  source: SpringBoneSource;
  jointCount: number;
};

const fallbackTailGravity = new Vector3(0, -1, 0);
const fallbackTailJointSettings = {
  hitRadius: 0.012,
  stiffness: 0.7,
  gravityPower: 0.2,
  gravityDir: fallbackTailGravity,
  dragForce: 0.38
};

export function prepareVrmSpringBones(vrm: VRM): VrmSpringBonePreparationResult {
  vrm.scene.updateWorldMatrix(true, true);

  const authoredJointCount = vrm.springBoneManager?.joints.size ?? 0;
  if (vrm.springBoneManager && authoredJointCount > 0) {
    vrm.springBoneManager.reset();
    return { source: "authored", jointCount: authoredJointCount };
  }

  const tailSegments = collectTailSpringSegments(vrm.scene);
  if (tailSegments.length === 0) {
    return { source: "none", jointCount: 0 };
  }

  const manager = new VRMSpringBoneManager();
  for (const { bone, child } of tailSegments) {
    manager.addJoint(new VRMSpringBoneJoint(bone, child, fallbackTailJointSettings));
  }
  manager.setInitState();
  (vrm as unknown as { springBoneManager?: VRMSpringBoneManager }).springBoneManager = manager;

  return { source: "generated", jointCount: manager.joints.size };
}

function collectTailSpringSegments(root: Object3D): Array<{ bone: Object3D; child: Object3D }> {
  const segments: Array<{ bone: Object3D; child: Object3D }> = [];

  root.traverse((object) => {
    if (!isTailBoneName(object.name) || isTailBoneName(object.parent?.name ?? "")) {
      return;
    }
    collectTailSpringSegmentsFromRoot(object, segments);
  });

  return segments;
}

function collectTailSpringSegmentsFromRoot(
  root: Object3D,
  segments: Array<{ bone: Object3D; child: Object3D }>
) {
  const tailChildren = root.children.filter((child) => isTailBoneName(child.name));
  for (const child of tailChildren) {
    segments.push({ bone: root, child });
    collectTailSpringSegmentsFromRoot(child, segments);
  }
}

function isTailBoneName(name: string) {
  return /(?:^|[^a-z])tail(?:$|[^a-z]|\d)/i.test(name);
}
