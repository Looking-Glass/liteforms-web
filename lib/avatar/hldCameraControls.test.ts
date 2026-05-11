import { describe, expect, it } from "vitest";
import {
  AVATAR_CAMERA_ASPECT,
  AVATAR_CAMERA_DEFAULT_POSITION,
  AVATAR_CAMERA_DEFAULT_TARGET,
  AVATAR_CAMERA_VERTICAL_FOV_DEGREES,
} from "./hldCameraControls";

describe("main avatar camera configuration", () => {
  it("uses a 14 degree vertical field of view", () => {
    expect(AVATAR_CAMERA_VERTICAL_FOV_DEGREES).toBe(14);
  });

  it("uses a 9:16 aspect ratio", () => {
    expect(AVATAR_CAMERA_ASPECT).toBeCloseTo(9 / 16);
  });

  it("uses the tuned default 2D camera pose", () => {
    expect(AVATAR_CAMERA_DEFAULT_POSITION).toEqual({ x: 0, y: 1.372, z: 7.779 });
    expect(AVATAR_CAMERA_DEFAULT_TARGET).toEqual({ x: 0, y: 0.93, z: 1.197 });
  });
});
