import type { Object3D } from "three";

export type GltfPrimitiveDef = {
  targets?: unknown[];
  extras?: {
    targetNames?: string[];
  };
};

export type GltfMeshDef = {
  name?: string;
  extras?: {
    targetNames?: string[];
  };
  primitives?: GltfPrimitiveDef[];
};

type MorphTargetObject = Object3D & {
  morphTargetDictionary?: Record<string, number>;
  morphTargetInfluences?: number[];
};

/**
 * Repairs missing morphTargetDictionary entries for meshes loaded from VRM files
 * that store morph target names on primitive extras instead of mesh extras.
 *
 * THREE.js GLTFLoader reads target names from mesh.extras.targetNames, but many
 * VRM 0.x files (e.g. those exported by certain tools) place them in each
 * primitive's extras instead. This function fills the gap so morph targets can
 * be addressed by name after loading.
 *
 * For each skinned mesh that has morph influences but no named dictionary entries,
 * the function searches the GLTF mesh definitions for a primitive whose
 * targetNames list matches the influence count, preferring a definition whose
 * name matches the mesh object name. When found, the dictionary is populated.
 *
 * Returns the number of meshes that were repaired.
 */
export function repairMorphTargetDictionaries(
  scene: Object3D,
  gltfMeshDefs: GltfMeshDef[]
): number {
  let repaired = 0;

  scene.traverse((object) => {
    const mesh = object as MorphTargetObject;

    if (!mesh.morphTargetInfluences || mesh.morphTargetInfluences.length === 0) {
      return;
    }

    if (mesh.morphTargetDictionary && Object.keys(mesh.morphTargetDictionary).length > 0) {
      return;
    }

    const count = mesh.morphTargetInfluences.length;

    const candidates = gltfMeshDefs.filter((def) =>
      def.primitives?.some((prim) => {
        const names = prim.extras?.targetNames;
        return Array.isArray(names) && names.length === count;
      })
    );

    const bestMatch =
      candidates.find((def) => def.name === (mesh as { name?: string }).name) ??
      candidates[0];

    if (!bestMatch) {
      return;
    }

    const targetNames = bestMatch.primitives
      ?.map((prim) => prim.extras?.targetNames)
      .find((names): names is string[] => Array.isArray(names) && names.length === count);

    if (!targetNames) {
      return;
    }

    mesh.morphTargetDictionary = {};
    for (let i = 0; i < targetNames.length; i++) {
      mesh.morphTargetDictionary[targetNames[i]] = i;
    }
    repaired++;
  });

  return repaired;
}
