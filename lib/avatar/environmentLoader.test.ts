import { describe, expect, it, vi } from "vitest";
import { Group, Scene, Vector3 } from "three";

import { loadEnvironmentGlb } from "./environmentLoader";

function makeLoader(scene: Group) {
  return { loadAsync: vi.fn().mockResolvedValue({ scene }) };
}

describe("loadEnvironmentGlb", () => {
  it("loads the GLB at the given URL", async () => {
    const envScene = new Group();
    const loader = makeLoader(envScene);
    const parentScene = new Scene();
    const reference = new Group();

    await loadEnvironmentGlb("/models/Alcove.glb", loader as any, parentScene, reference);

    expect(loader.loadAsync).toHaveBeenCalledWith("/models/Alcove.glb");
  });

  it("copies the reference object's scale onto the loaded scene", async () => {
    const envScene = new Group();
    const loader = makeLoader(envScene);
    const parentScene = new Scene();
    const reference = new Group();
    reference.scale.setScalar(0.75);

    await loadEnvironmentGlb("/models/Alcove.glb", loader as any, parentScene, reference);

    expect(envScene.scale.x).toBeCloseTo(0.75);
    expect(envScene.scale.y).toBeCloseTo(0.75);
    expect(envScene.scale.z).toBeCloseTo(0.75);
  });

  it("copies the reference object's position onto the loaded scene", async () => {
    const envScene = new Group();
    const loader = makeLoader(envScene);
    const parentScene = new Scene();
    const reference = new Group();
    reference.position.set(1.2, -0.3, 0.5);

    await loadEnvironmentGlb("/models/Alcove.glb", loader as any, parentScene, reference);

    expect(envScene.position).toEqual(new Vector3(1.2, -0.3, 0.5));
  });

  it("adds the loaded scene to the parent scene", async () => {
    const envScene = new Group();
    const loader = makeLoader(envScene);
    const parentScene = new Scene();
    const reference = new Group();

    await loadEnvironmentGlb("/models/Alcove.glb", loader as any, parentScene, reference);

    expect(parentScene.children).toContain(envScene);
  });
});
