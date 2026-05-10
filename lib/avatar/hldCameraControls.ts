export type CameraPositionLike = {
  x: number;
  y: number;
  z: number;
};

export const AVATAR_CAMERA_VERTICAL_FOV_DEGREES = 14;
export const AVATAR_CAMERA_ASPECT = 9 / 16;
export const AVATAR_CAMERA_DEFAULT_POSITION: CameraPositionLike = { x: 0, y: 1.44, z: 6.56 };
const AVATAR_CAMERA_KEY_MOVE_STEP = 0.1;

export function computeHldCameraInitialPosition(
  basePosition: CameraPositionLike
): CameraPositionLike {
  return {
    x: basePosition.x,
    y: basePosition.y * 1.2,
    z: basePosition.z * 1.1,
  };
}

export function applyAvatarCameraKeyMove(
  position: CameraPositionLike,
  target: CameraPositionLike,
  key: string
): { position: CameraPositionLike; target: CameraPositionLike } | null {
  const normalizedKey = key.toLowerCase();
  let delta: CameraPositionLike | null = null;

  if (key === "ArrowUp") {
    delta = { x: 0, y: AVATAR_CAMERA_KEY_MOVE_STEP, z: 0 };
  } else if (key === "ArrowDown") {
    delta = { x: 0, y: -AVATAR_CAMERA_KEY_MOVE_STEP, z: 0 };
  } else if (normalizedKey === "q" || normalizedKey === "e") {
    const direction = {
      x: target.x - position.x,
      y: target.y - position.y,
      z: target.z - position.z,
    };
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (length <= 0) return null;
    const sign = normalizedKey === "q" ? 1 : -1;
    delta = {
      x: (direction.x / length) * AVATAR_CAMERA_KEY_MOVE_STEP * sign,
      y: (direction.y / length) * AVATAR_CAMERA_KEY_MOVE_STEP * sign,
      z: (direction.z / length) * AVATAR_CAMERA_KEY_MOVE_STEP * sign,
    };
  }

  if (!delta) return null;

  return {
    position: {
      x: position.x + delta.x,
      y: position.y + delta.y,
      z: position.z + delta.z,
    },
    target: {
      x: target.x + delta.x,
      y: target.y + delta.y,
      z: target.z + delta.z,
    },
  };
}
