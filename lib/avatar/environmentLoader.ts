import type { Object3D, Scene } from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { setMeshShadowFlags } from "./shadowSetup";

/**
 * Loads a plain GLB environment model and places it in the scene using the
 * same world transform as `referenceObject`. This keeps a pre-aligned
 * environment model (one whose origin was set up to match the avatar's root)
 * spatially consistent with the avatar after any runtime framing adjustment.
 */
export async function loadEnvironmentGlb(
  url: string,
  loader: Pick<GLTFLoader, "loadAsync">,
  scene: Scene,
  referenceObject: Object3D
): Promise<void> {
  const gltf = await loader.loadAsync(url);
  const envScene = gltf.scene;
  envScene.scale.copy(referenceObject.scale);
  envScene.position.copy(referenceObject.position);
  scene.add(envScene);
  setMeshShadowFlags(envScene, true, true);
}
