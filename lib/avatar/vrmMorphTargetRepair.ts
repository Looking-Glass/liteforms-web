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
 * primitive's extras instead. THREE.js also seeds morphTargetDictionary with
 * numeric placeholder keys (`{"0":0, "1":1, ...}`) via Mesh.updateMorphTargets()
 * when morph attributes have no names — so an existing dictionary is not a
 * reliable signal that names were resolved. This function fills the gap so morph
 * targets can be addressed by name after loading.
 *
 * For each skinned mesh that has morph influences but no meaningful named
 * dictionary entries, the function searches the GLTF mesh definitions for a
 * primitive whose targetNames list matches the influence count, preferring a
 * definition whose name matches the mesh object name. When found, the
 * dictionary is populated.
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

    if (hasMeaningfulMorphTargetDictionary(mesh.morphTargetDictionary, mesh.morphTargetInfluences.length)) {
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

/**
 * A morphTargetDictionary is "meaningful" if at least one key is not a numeric
 * placeholder (i.e. not `String(i)` for some `i` in `[0, count)`). Three.js's
 * default Mesh.updateMorphTargets() creates `{"0":0,"1":1,...}` when morph
 * attributes have no names, and we treat that as still needing repair.
 */
function hasMeaningfulMorphTargetDictionary(
  dict: Record<string, number> | undefined,
  count: number
): boolean {
  if (!dict) {
    return false;
  }
  const keys = Object.keys(dict);
  if (keys.length === 0) {
    return false;
  }
  return keys.some((key) => !isNumericPlaceholderKey(key, count));
}

function isNumericPlaceholderKey(key: string, count: number) {
  if (!/^\d+$/.test(key)) {
    return false;
  }
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < count;
}
