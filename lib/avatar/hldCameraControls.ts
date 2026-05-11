export type CameraPositionLike = {
  x: number;
  y: number;
  z: number;
};

export const AVATAR_CAMERA_VERTICAL_FOV_DEGREES = 14;
export const AVATAR_CAMERA_ASPECT = 9 / 16;
export const AVATAR_CAMERA_DEFAULT_POSITION: CameraPositionLike = { x: 0, y: 1.372, z: 7.779 };
export const AVATAR_CAMERA_DEFAULT_TARGET: CameraPositionLike = { x: 0, y: 0.93, z: 1.197 };
