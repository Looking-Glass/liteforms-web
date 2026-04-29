import { Box3, Object3D, Vector3 } from "three";

/** The Looking Glass Portrait device has a 9:16 (portrait) aspect ratio. */
export const LKG_INLINE_ASPECT = 9 / 16;

/**
 * Computes the largest 9:16 canvas dimensions that fit within the given container.
 * Used to resize the 2D inline preview to match the LKG device aspect ratio.
 */
export function computeLkgInlineViewSize(
  containerWidth: number,
  containerHeight: number
): { width: number; height: number } {
  let width = containerWidth;
  let height = Math.round(width / LKG_INLINE_ASPECT);
  if (height > containerHeight) {
    height = containerHeight;
    width = Math.round(height * LKG_INLINE_ASPECT);
  }
  return { width, height };
}

export interface LookingGlassFocalPoint {
  targetX: number;
  targetY: number;
  targetZ: number;
  targetDiam: number;
}

/**
 * Computes the Looking Glass camera convergence target from a framed VRM model.
 *
 * The maths mirror frameModel() in AvatarScene so the holographic focal plane
 * is centred on the same point the orbit controls look at.
 */
export function computeLookingGlassFocalPoint(object: Object3D): LookingGlassFocalPoint {
  const bounds = new Box3().setFromObject(object);
  const size = bounds.getSize(new Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z);
  const scale = maxAxis > 0 ? 1.8 / maxAxis : 1;

  // Mirrors: controls.target.set(0, Math.max(0.75, size.y * scale * 0.45), 0)
  const targetY = Math.max(0.75, size.y * scale * 0.45);

  return {
    targetX: 0,
    targetY,
    targetZ: 0,
    targetDiam: 2.0,
  };
}
