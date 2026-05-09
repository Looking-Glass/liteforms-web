import type { Object3D, Scene } from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { setMeshShadowFlags } from "./shadowSetup";

export type EnvironmentTransform = Pick<Object3D, "scale" | "position">;

/**
 * Loads a plain GLB environment model and places it in the scene using a
 * reference transform. Custom avatars still use the default lobster's reference
 * transform so the alcove remains a stable size benchmark.
 */
export async function loadEnvironmentGlb(
  url: string,
  loader: Pick<GLTFLoader, "loadAsync">,
  scene: Scene,
  referenceObject: EnvironmentTransform
): Promise<Object3D> {
  const gltf = await loader.loadAsync(url);
  const envScene = gltf.scene;
  envScene.scale.copy(referenceObject.scale);
  envScene.position.copy(referenceObject.position);
  scene.add(envScene);
  setMeshShadowFlags(envScene, true, true);
  return envScene;
}
