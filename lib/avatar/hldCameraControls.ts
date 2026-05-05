export type CameraPositionLike = {
  x: number;
  y: number;
  z: number;
};

export function computeHldCameraInitialPosition(
  basePosition: CameraPositionLike
): CameraPositionLike {
  return {
    x: basePosition.x,
    y: basePosition.y * 1.2,
    z: basePosition.z * 1.1,
  };
}
