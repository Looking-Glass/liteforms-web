import { describe, expect, it } from "vitest";
import {
  clearMorphTargetWeights,
  getAvailableVrm0MouthMorphTargets,
  getMissingVrm0MouthMorphTargets,
  getMorphTargetEntries,
  getUniqueMorphTargetNames,
  resetMorphTargets,
  resolveVrm0MouthMorphTarget,
  setMorphTargetWeight
} from "./morphTargetController";

describe("morph target controller", () => {
  it("lists morph targets from meshes in a loaded scene", () => {
    const root = createRoot([
      createMorphMesh("Face", { mouthOpen: 0, blink: 1 }),
      createMorphMesh("Claw", { open: 0 })
    ]);

    expect(getMorphTargetEntries(root)).toEqual([
      { meshName: "Claw", targetName: "open", index: 0 },
      { meshName: "Face", targetName: "blink", index: 1 },
      { meshName: "Face", targetName: "mouthOpen", index: 0 }
    ]);
    expect(getUniqueMorphTargetNames(root)).toEqual(["blink", "mouthOpen", "open"]);
  });

  it("sets a named morph target on every matching mesh", () => {
    const face = createMorphMesh("Face", { mouthOpen: 0, blink: 1 });
    const jaw = createMorphMesh("Jaw", { mouthOpen: 0 });
    const root = createRoot([face, jaw]);

    expect(setMorphTargetWeight(root, "mouthOpen", 1)).toBe(2);

    expect(face.morphTargetInfluences[0]).toBe(1);
    expect(face.morphTargetInfluences[1]).toBe(0);
    expect(jaw.morphTargetInfluences[0]).toBe(1);
  });

  it("resets all morph target influences", () => {
    const face = createMorphMesh("Face", { mouthOpen: 0, blink: 1 }, [1, 0.5]);
    const root = createRoot([face]);

    expect(resetMorphTargets(root)).toBe(1);

    expect(face.morphTargetInfluences).toEqual([0, 0]);
  });

  it("resolves VRM 0.0 A/I/U/E/O preset morph targets for mouth shapes", () => {
    const root = createRoot([createMorphMesh("Face", { A: 0, E: 1, I: 2, O: 3 })]);

    expect(resolveVrm0MouthMorphTarget(root, "aa")).toBe("A");
    expect(resolveVrm0MouthMorphTarget(root, "ee")).toBe("E");
    expect(resolveVrm0MouthMorphTarget(root, "ih")).toBe("I");
    expect(resolveVrm0MouthMorphTarget(root, "oh")).toBe("O");
    expect(resolveVrm0MouthMorphTarget(root, "ou")).toBeNull();
    expect(getAvailableVrm0MouthMorphTargets(root)).toEqual(["A", "I", "E", "O"]);
    expect(getMissingVrm0MouthMorphTargets(root)).toEqual(["U"]);
  });

  it("clears only requested morph target weights", () => {
    const face = createMorphMesh("Face", { A: 0, E: 1, BLINK: 2 }, [1, 1, 1]);
    const root = createRoot([face]);

    expect(clearMorphTargetWeights(root, ["A", "E"])).toBe(2);

    expect(face.morphTargetInfluences).toEqual([0, 0, 1]);
  });
});

function createRoot(children: Array<ReturnType<typeof createMorphMesh>>) {
  return {
    traverse(visitor: (object: unknown) => void) {
      visitor(this);
      children.forEach((child) => visitor(child));
    }
  } as never;
}

function createMorphMesh(name: string, morphTargetDictionary: Record<string, number>, morphTargetInfluences = [0, 0]) {
  return { name, morphTargetDictionary, morphTargetInfluences };
}
