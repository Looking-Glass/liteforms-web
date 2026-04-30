import { describe, expect, it, vi } from "vitest";
import { Group } from "three";
import type { VRM } from "@pixiv/three-vrm";
import { VrmRuntimeAnimator } from "./vrmRuntimeAnimator";

describe("VRM runtime animator", () => {
  it("resolves VRM 0.x mouth expressions stored under A/E/I/O/U names", () => {
    let now = 0;
    const values = new Map<string, number>();
    const vrm = createVrm({
      expressionMap: {
        A: { binds: [{}] },
        E: { binds: [{}] },
        I: { binds: [{}] },
        O: { binds: [{}] },
        U: { binds: [{}] },
        blink: { binds: [{}] }
      },
      onSetValue: (name, value) => values.set(name, value)
    });
    const animator = new VrmRuntimeAnimator(vrm, { now: () => now, random: () => 0.5 });

    animator.setLipSyncFrame({ target: "viseme_E", group: "E", vrmExpression: "ee", start: 0, end: 0.2, weight: 1 });
    animator.update(1 / 60);

    const eWeight = values.get("E") ?? 0;
    expect(eWeight).toBeGreaterThan(0);
    expect(values.get("A") ?? 0).toBe(0);
    expect(values.get("ee")).toBeUndefined();
  });

  it("lerps VRM mouth expressions in and back out instead of snapping", () => {
    let now = 0;
    const values = new Map<string, number>();
    const vrm = createVrm({
      expressionMap: {
        aa: { binds: [{}] },
        ee: { binds: [{}] },
        ih: { binds: [{}] },
        oh: { binds: [{}] },
        ou: { binds: [{}] }
      },
      onSetValue: (name, value) => values.set(name, value)
    });
    const animator = new VrmRuntimeAnimator(vrm, { now: () => now, random: () => 0.5 });

    animator.setLipSyncFrame({ target: "viseme_E", group: "E", vrmExpression: "ee", start: 0, end: 0.2, weight: 1 });
    animator.update(1 / 60);

    const openingWeight = values.get("ee") ?? 0;
    expect(openingWeight).toBeGreaterThan(0);
    expect(openingWeight).toBeLessThan(1);
    expect(values.get("aa")).toBe(0);

    now = 300;
    animator.update(1 / 10);

    const closingWeight = values.get("ee") ?? 0;
    expect(closingWeight).toBeGreaterThan(0);
    expect(closingWeight).toBeLessThan(openingWeight);
  });

  it("drives blink expressions on a randomized smooth cycle", () => {
    let now = 0;
    const setValue = vi.fn();
    const vrm = createVrm({
      expressionMap: {
        blink: { binds: [{}] }
      },
      onSetValue: setValue
    });
    const animator = new VrmRuntimeAnimator(vrm, { now: () => now, random: () => 0 });

    now = 1800;
    animator.update(1 / 60);

    expect(setValue).toHaveBeenCalledWith("blink", expect.any(Number));
    const blinkWeight = [...setValue.mock.calls].reverse().find(([name]) => name === "blink")?.[1] ?? 0;
    expect(blinkWeight).toBeGreaterThan(0);
    expect(blinkWeight).toBeLessThan(1);
  });

  it("attaches a moving look-at target when the VRM exposes lookAt", () => {
    let now = 0;
    const scene = new Group();
    const lookAt = { target: null as Group | null };
    const vrm = createVrm({ scene, lookAt });
    const animator = new VrmRuntimeAnimator(vrm, { now: () => now, random: () => 0.5 });

    animator.update(1 / 60);

    expect(lookAt.target).not.toBeNull();
    expect(scene.children).toContain(lookAt.target);
    expect(lookAt.target?.position.y).toBeGreaterThan(1.2);

    animator.dispose();

    expect(lookAt.target).toBeNull();
  });
});

function createVrm({
  expressionMap = {},
  onSetValue = () => undefined,
  scene = new Group(),
  lookAt
}: {
  expressionMap?: Record<string, unknown>;
  onSetValue?: (name: string, value: number) => void;
  scene?: Group;
  lookAt?: { target: Group | null };
} = {}) {
  return {
    scene,
    expressionManager: {
      expressionMap,
      setValue: onSetValue,
      update: vi.fn()
    },
    lookAt
  } as unknown as VRM;
}
