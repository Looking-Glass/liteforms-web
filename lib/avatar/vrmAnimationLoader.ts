import { AnimationMixer } from "three";
import type { AnimationClip } from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { VRM } from "@pixiv/three-vrm";
import { createVRMAnimationClip } from "@pixiv/three-vrm-animation";
import type { VRMAnimation } from "@pixiv/three-vrm-animation";

export async function loadVrmAnimationClip(
  url: string,
  vrm: VRM,
  loader: Pick<GLTFLoader, "loadAsync">
): Promise<AnimationClip | null> {
  const gltf = await loader.loadAsync(url);
  const animations = gltf.userData.vrmAnimations as VRMAnimation[] | undefined;

  if (!animations || animations.length === 0) {
    return null;
  }

  return createVRMAnimationClip(animations[0], vrm);
}

export class VrmIdleAnimator {
  private readonly mixer: AnimationMixer;

  constructor(vrm: VRM, clip: AnimationClip) {
    this.mixer = new AnimationMixer(vrm.scene);
    this.mixer.clipAction(clip).play();
  }

  update(delta: number): void {
    this.mixer.update(delta);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}
