import { describe, expect, it } from "vitest";
import {
  AVATAR_CAMERA_ASPECT,
  AVATAR_CAMERA_DEFAULT_POSITION,
  AVATAR_CAMERA_VERTICAL_FOV_DEGREES,
  applyAvatarCameraKeyMove,
  computeHldCameraInitialPosition,
} from "./hldCameraControls";

describe("main avatar camera configuration", () => {
  it("uses a 14 degree vertical field of view", () => {
    expect(AVATAR_CAMERA_VERTICAL_FOV_DEGREES).toBe(14);
  });

  it("uses a 9:16 aspect ratio", () => {
    expect(AVATAR_CAMERA_ASPECT).toBeCloseTo(9 / 16);
  });

  it("backs the default camera away for the narrower FOV", () => {
    expect(AVATAR_CAMERA_DEFAULT_POSITION.z).toBeGreaterThan(6);
  });
});

describe("computeHldCameraInitialPosition", () => {
  it("moves the camera up by 20 percent", () => {
    expect(computeHldCameraInitialPosition({ x: 0, y: 1.2, z: 3 }).y).toBeCloseTo(1.44);
  });

  it("zooms the camera out by 10 percent", () => {
    expect(computeHldCameraInitialPosition({ x: 0, y: 1.2, z: 3 }).z).toBeCloseTo(3.3);
  });

  it("preserves the horizontal position", () => {
    expect(computeHldCameraInitialPosition({ x: 0.25, y: 1.2, z: 3 }).x).toBe(0.25);
  });
});

describe("applyAvatarCameraKeyMove", () => {
  it("moves the camera and target up with ArrowUp", () => {
    const pose = applyAvatarCameraKeyMove(
      { x: 0, y: 1.2, z: 3 },
      { x: 0, y: 1, z: 0 },
      "ArrowUp"
    );

    expect(pose).not.toBeNull();
    if (!pose) throw new Error("Expected ArrowUp to move the camera.");
    expect(pose.position.y).toBeGreaterThan(1.2);
    expect(pose.target.y).toBeGreaterThan(1);
  });

  it("moves the camera and target down with ArrowDown", () => {
    const pose = applyAvatarCameraKeyMove(
      { x: 0, y: 1.2, z: 3 },
      { x: 0, y: 1, z: 0 },
      "ArrowDown"
    );

    expect(pose).not.toBeNull();
    if (!pose) throw new Error("Expected ArrowDown to move the camera.");
    expect(pose.position.y).toBeLessThan(1.2);
    expect(pose.target.y).toBeLessThan(1);
  });

  it("moves the camera and target forward with Q", () => {
    const pose = applyAvatarCameraKeyMove(
      { x: 0, y: 1, z: 3 },
      { x: 0, y: 1, z: 0 },
      "q"
    );

    expect(pose).not.toBeNull();
    if (!pose) throw new Error("Expected Q to move the camera.");
    expect(pose.position.z).toBeLessThan(3);
    expect(pose.target.z).toBeLessThan(0);
  });

  it("moves the camera and target back with E", () => {
    const pose = applyAvatarCameraKeyMove(
      { x: 0, y: 1, z: 3 },
      { x: 0, y: 1, z: 0 },
      "E"
    );

    expect(pose).not.toBeNull();
    if (!pose) throw new Error("Expected E to move the camera.");
    expect(pose.position.z).toBeGreaterThan(3);
    expect(pose.target.z).toBeGreaterThan(0);
  });

  it("ignores unrelated keys", () => {
    expect(applyAvatarCameraKeyMove(
      { x: 0, y: 1, z: 3 },
      { x: 0, y: 1, z: 0 },
      "A"
    )).toBeNull();
  });
});
