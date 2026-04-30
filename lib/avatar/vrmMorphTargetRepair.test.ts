import { describe, expect, it } from "vitest";
import { repairMorphTargetDictionaries } from "./vrmMorphTargetRepair";

// Mirrors the pup4.vrm scenario: mesh.extras is undefined, but prim.extras.targetNames exists.
describe("repairMorphTargetDictionaries", () => {
  it("populates morphTargetDictionary from prim.extras.targetNames when mesh.extras is missing", () => {
    const targetNames = ["blink_R", "blink_L", "A", "I", "U", "E", "O", "joy"];
    const scene = createScene([createMesh("Face", targetNames.length)]);
    const meshDefs = [
      {
        name: "Face",
        extras: undefined,
        primitives: [{ extras: { targetNames } }]
      }
    ];

    const count = repairMorphTargetDictionaries(scene, meshDefs);

    expect(count).toBe(1);
    expect(scene.children[0].morphTargetDictionary).toEqual({
      blink_R: 0,
      blink_L: 1,
      A: 2,
      I: 3,
      U: 4,
      E: 5,
      O: 6,
      joy: 7
    });
  });

  it("skips meshes that already have a populated morphTargetDictionary", () => {
    const scene = createScene([createMesh("Face", 3, { existing: 0 })]);
    const meshDefs = [
      {
        name: "Face",
        primitives: [{ extras: { targetNames: ["A", "B", "C"] } }]
      }
    ];

    const count = repairMorphTargetDictionaries(scene, meshDefs);

    expect(count).toBe(0);
    expect(scene.children[0].morphTargetDictionary).toEqual({ existing: 0 });
  });

  // Three.js Mesh.updateMorphTargets() (called by GLTFLoader) seeds the dictionary
  // with numeric placeholder keys ({"0":0,"1":1,...}) when morph attributes have no
  // names. We must still repair these from prim.extras.targetNames, because they
  // hide the missing-dictionary signal but contain no meaningful names.
  it("repairs dictionaries that contain only numeric placeholder keys", () => {
    const targetNames = ["blink_R", "blink_L", "A", "I", "U", "E", "O"];
    const placeholderDict: Record<string, number> = {};
    for (let i = 0; i < targetNames.length; i++) {
      placeholderDict[String(i)] = i;
    }
    const scene = createScene([createMesh("Face", targetNames.length, placeholderDict)]);
    const meshDefs = [
      {
        name: "Face",
        primitives: [{ extras: { targetNames } }]
      }
    ];

    const count = repairMorphTargetDictionaries(scene, meshDefs);

    expect(count).toBe(1);
    expect(scene.children[0].morphTargetDictionary).toEqual({
      blink_R: 0,
      blink_L: 1,
      A: 2,
      I: 3,
      U: 4,
      E: 5,
      O: 6
    });
  });

  it("preserves a real (non-placeholder) dictionary that mixes named and numeric keys", () => {
    const scene = createScene([createMesh("Face", 3, { A: 0, "1": 1, B: 2 })]);
    const meshDefs = [
      {
        name: "Face",
        primitives: [{ extras: { targetNames: ["X", "Y", "Z"] } }]
      }
    ];

    const count = repairMorphTargetDictionaries(scene, meshDefs);

    expect(count).toBe(0);
    expect(scene.children[0].morphTargetDictionary).toEqual({ A: 0, "1": 1, B: 2 });
  });

  it("skips objects with no morphTargetInfluences", () => {
    const scene = createScene([{ morphTargetDictionary: undefined, morphTargetInfluences: undefined }]);
    const meshDefs = [{ name: "x", primitives: [{ extras: { targetNames: ["A"] } }] }];

    const count = repairMorphTargetDictionaries(scene, meshDefs);

    expect(count).toBe(0);
  });

  it("skips meshes with zero morph targets", () => {
    const scene = createScene([createMesh("Body", 0)]);
    const meshDefs = [{ name: "Body", primitives: [{ extras: { targetNames: [] } }] }];

    const count = repairMorphTargetDictionaries(scene, meshDefs);

    expect(count).toBe(0);
  });

  it("prefers the GLTF mesh definition whose name matches the mesh object", () => {
    const scene = createScene([createMesh("Face", 2)]);
    const meshDefs = [
      { name: "Body", primitives: [{ extras: { targetNames: ["X", "Y"] } }] },
      { name: "Face", primitives: [{ extras: { targetNames: ["A", "I"] } }] }
    ];

    repairMorphTargetDictionaries(scene, meshDefs);

    expect(scene.children[0].morphTargetDictionary).toEqual({ A: 0, I: 1 });
  });

  it("repairs all primitives of a multi-primitive mesh identically (pup4.vrm pattern)", () => {
    const targetNames = ["blink_R", "blink_L", "A", "I", "U", "E", "O"];
    // pup4.vrm has 5 primitives on one mesh → 5 child SkinnedMesh objects, same morph count
    const meshes = [
      createMesh("BSurfaceMesh.028", targetNames.length),
      createMesh("BSurfaceMesh.028", targetNames.length),
      createMesh("BSurfaceMesh.028", targetNames.length)
    ];
    const scene = createScene(meshes);
    const meshDefs = [
      {
        name: "BSurfaceMesh.028",
        primitives: [
          { extras: { targetNames } },
          { extras: { targetNames } },
          { extras: { targetNames } }
        ]
      }
    ];

    const count = repairMorphTargetDictionaries(scene, meshDefs);

    expect(count).toBe(3);
    for (const mesh of meshes) {
      expect(mesh.morphTargetDictionary?.["A"]).toBe(2);
      expect(mesh.morphTargetDictionary?.["U"]).toBe(4);
    }
  });
});

type FakeMesh = {
  morphTargetDictionary: Record<string, number> | undefined;
  morphTargetInfluences: number[] | undefined;
};

function createMesh(name: string, morphCount: number, existingDict?: Record<string, number>): FakeMesh & { name: string } {
  return {
    name,
    morphTargetDictionary: existingDict ?? (morphCount > 0 ? {} : undefined),
    morphTargetInfluences: morphCount > 0 ? new Array(morphCount).fill(0) : undefined
  };
}

function createScene(children: object[]) {
  return {
    traverse(visitor: (object: object) => void) {
      visitor(this);
      for (const child of children) {
        visitor(child);
      }
    },
    children
  } as never;
}
