import { describe, expect, it, vi } from "vitest";
import { AnimationClip, Group } from "three";
import type { VRM } from "@pixiv/three-vrm";

vi.mock("@pixiv/three-vrm-animation", () => ({
  createVRMAnimationClip: vi.fn()
}));

import { createVRMAnimationClip } from "@pixiv/three-vrm-animation";
import { loadVrmAnimationClip, VrmIdleAnimator } from "./vrmAnimationLoader";

const fakeVrm = { scene: new Group() } as unknown as VRM;

function makeLoader(vrmAnimations?: unknown[]) {
  return { loadAsync: vi.fn().mockResolvedValue({ userData: { vrmAnimations } }) };
}

describe("loadVrmAnimationClip", () => {
  it("resolves the first animation clip from the GLTF", async () => {
    const animation = { name: "idle_loop" };
    const clip = new AnimationClip("idle_loop", 1, []);
    vi.mocked(createVRMAnimationClip).mockReturnValue(clip);
    const loader = makeLoader([animation]);

    const result = await loadVrmAnimationClip("/animations/idle_loop.vrma", fakeVrm, loader as any);

    expect(loader.loadAsync).toHaveBeenCalledWith("/animations/idle_loop.vrma");
    expect(createVRMAnimationClip).toHaveBeenCalledWith(animation, fakeVrm);
    expect(result).toBe(clip);
  });

  it("returns null when the GLTF has no vrmAnimations array", async () => {
    const loader = makeLoader(undefined);
    vi.mocked(createVRMAnimationClip).mockClear();

    const result = await loadVrmAnimationClip("/animations/idle_loop.vrma", fakeVrm, loader as any);

    expect(result).toBeNull();
    expect(createVRMAnimationClip).not.toHaveBeenCalled();
  });

  it("returns null when vrmAnimations is empty", async () => {
    const loader = makeLoader([]);
    vi.mocked(createVRMAnimationClip).mockClear();

    const result = await loadVrmAnimationClip("/animations/idle_loop.vrma", fakeVrm, loader as any);

    expect(result).toBeNull();
    expect(createVRMAnimationClip).not.toHaveBeenCalled();
  });
});

describe("VrmIdleAnimator", () => {
  it("can be constructed, updated, and disposed without throwing", () => {
    const clip = new AnimationClip("idle_loop", 2, []);
    const animator = new VrmIdleAnimator(fakeVrm, clip);

    expect(() => animator.update(1 / 60)).not.toThrow();
    expect(() => animator.dispose()).not.toThrow();
  });

  it("forwards delta to the underlying mixer on each update", () => {
    const clip = new AnimationClip("idle_loop", 2, []);
    const animator = new VrmIdleAnimator(fakeVrm, clip);
    const updateSpy = vi.spyOn(animator["mixer"], "update");

    animator.update(0.016);

    expect(updateSpy).toHaveBeenCalledWith(0.016);
  });
});
