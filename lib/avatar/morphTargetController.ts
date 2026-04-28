import type { Object3D } from "three";
import type { VrmMouthExpression } from "@/lib/speech";

export type MorphTargetEntry = {
  meshName: string;
  targetName: string;
  index: number;
};

type MorphTargetObject = Object3D & {
  morphTargetDictionary?: Record<string, number>;
  morphTargetInfluences?: number[];
};

const vrm0MouthMorphTargets: Record<VrmMouthExpression, string> = {
  aa: "A",
  ih: "I",
  ou: "U",
  ee: "E",
  oh: "O"
};

export function getMorphTargetEntries(root: Object3D | undefined): MorphTargetEntry[] {
  if (!root) {
    return [];
  }

  const entries: MorphTargetEntry[] = [];
  root.traverse((object) => {
    const morphObject = object as MorphTargetObject;

    if (!morphObject.morphTargetDictionary || !morphObject.morphTargetInfluences) {
      return;
    }

    for (const [targetName, index] of Object.entries(morphObject.morphTargetDictionary)) {
      entries.push({ meshName: morphObject.name || "unnamed mesh", targetName, index });
    }
  });

  return entries.sort((left, right) => `${left.meshName}:${left.targetName}`.localeCompare(`${right.meshName}:${right.targetName}`));
}

export function getUniqueMorphTargetNames(root: Object3D | undefined): string[] {
  return Array.from(new Set(getMorphTargetEntries(root).map((entry) => entry.targetName))).sort((left, right) =>
    left.localeCompare(right)
  );
}

export function setMorphTargetWeight(root: Object3D | undefined, targetName: string, weight: number) {
  if (!root) {
    return 0;
  }

  let updated = 0;
  root.traverse((object) => {
    const morphObject = object as MorphTargetObject;
    const index = morphObject.morphTargetDictionary?.[targetName];

    if (index === undefined || !morphObject.morphTargetInfluences) {
      return;
    }

    morphObject.morphTargetInfluences[index] = weight;
    updated += 1;
  });

  return updated;
}

export function clearMorphTargetWeights(root: Object3D | undefined, targetNames: string[]) {
  let updated = 0;

  for (const targetName of targetNames) {
    updated += setMorphTargetWeight(root, targetName, 0);
  }

  return updated;
}

export function resolveMorphTargetName(root: Object3D | undefined, targetName: string) {
  const lowerTargetName = targetName.toLowerCase();

  return getUniqueMorphTargetNames(root).find((candidate) => candidate.toLowerCase() === lowerTargetName) ?? null;
}

export function resolveVrm0MouthMorphTarget(root: Object3D | undefined, expression: VrmMouthExpression | null) {
  if (!expression) {
    return null;
  }

  return resolveMorphTargetName(root, vrm0MouthMorphTargets[expression]);
}

export function getAvailableVrm0MouthMorphTargets(root: Object3D | undefined) {
  return Object.values(vrm0MouthMorphTargets)
    .map((targetName) => resolveMorphTargetName(root, targetName))
    .filter((targetName): targetName is string => targetName !== null);
}

export function getMissingVrm0MouthMorphTargets(root: Object3D | undefined) {
  return Object.values(vrm0MouthMorphTargets).filter((targetName) => resolveMorphTargetName(root, targetName) === null);
}

export function resetMorphTargets(root: Object3D | undefined) {
  if (!root) {
    return 0;
  }

  let updated = 0;
  root.traverse((object) => {
    const morphObject = object as MorphTargetObject;

    if (!morphObject.morphTargetInfluences) {
      return;
    }

    morphObject.morphTargetInfluences.fill(0);
    updated += 1;
  });

  return updated;
}
