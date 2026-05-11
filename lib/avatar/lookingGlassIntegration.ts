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
  /** Yaw of the camera array around the world Y-axis, in radians. */
  trackballX: number;
  /** Pitch of the camera array, in radians. */
  trackballY: number;
  /** Vertical field of view, in radians. */
  fovy: number;
}

export interface LookingGlassCameraArrayInput extends LookingGlassFocalPoint {
  /** Vertical field of view, in radians. */
  fovy: number;
  /** Full quilt view cone, in radians. */
  viewCone: number;
  /** Number of quilt views in the camera array. */
  numViews: number;
}

export interface LookingGlassCameraArrayState {
  target: Vector3;
  centerPosition: Vector3;
  firstViewPosition: Vector3;
  lastViewPosition: Vector3;
  rotationRadians: {
    x: number;
    y: number;
    z: number;
  };
  orbitDistance: number;
}

export type LookingGlassVectorLike = { x: number; y: number; z: number };

/**
 * Computes the Looking Glass camera convergence target from a framed VRM model.
 *
 * The maths mirror frameModel() in AvatarScene so the holographic focal plane
 * is centred on the same fixed avatar focal point.
 */
export function computeLookingGlassFocalPoint(object: Object3D): LookingGlassFocalPoint {
  const bounds = new Box3().setFromObject(object);
  const size = bounds.getSize(new Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z);
  const scale = maxAxis > 0 ? 1.8 / maxAxis : 1;

  // Mirrors the fixed avatar target height used for the preview camera.
  const targetY = Math.max(0.75, size.y * scale * 0.45);

  return {
    targetX: 0,
    targetY,
    targetZ: 0,
    targetDiam: 2.0,
    trackballX: 0,
    trackballY: 0,
    fovy: 2 * Math.atan(1 / 6),
  };
}

export function withLookingGlassTarget(
  focalPoint: LookingGlassFocalPoint,
  target: LookingGlassVectorLike
): LookingGlassFocalPoint {
  return {
    ...focalPoint,
    targetX: target.x,
    targetY: target.y,
    targetZ: target.z,
  };
}

export function withLookingGlassCameraPose(
  focalPoint: LookingGlassFocalPoint,
  position: LookingGlassVectorLike,
  target: LookingGlassVectorLike
): LookingGlassFocalPoint {
  const offset = new Vector3(
    position.x - target.x,
    position.y - target.y,
    position.z - target.z
  );
  const distance = offset.length();
  if (distance <= 0) {
    throw new Error("Looking Glass camera position must differ from target.");
  }

  const targetDiam = focalPoint.targetDiam;
  return {
    ...withLookingGlassTarget(focalPoint, target),
    trackballX: Math.atan2(offset.x, offset.z),
    trackballY: Math.asin(offset.y / distance),
    fovy: 2 * Math.atan((0.5 * targetDiam) / distance),
  };
}

/**
 * Mirrors the pose math in @lookingglass/webxr's LookingGlassXRDevice.
 *
 * The polyfill builds the camera-array center from:
 * T(target) * Ry(trackballX) * Rx(-trackballY) * T(0, 0, focalDistance),
 * then offsets individual quilt views along the rotated local X axis.
 */
export function computeLookingGlassCameraArrayState(
  config: LookingGlassCameraArrayInput
): LookingGlassCameraArrayState {
  const trackballY = config.trackballY;
  const target = new Vector3(config.targetX, config.targetY, config.targetZ);
  const orbitDistance = 0.5 * config.targetDiam / Math.tan(0.5 * config.fovy);
  const viewCount = Math.max(1, config.numViews);

  const rotateFromArraySpace = (v: Vector3) =>
    v
      .applyAxisAngle(new Vector3(1, 0, 0), -trackballY)
      .applyAxisAngle(new Vector3(0, 1, 0), config.trackballX);

  const centerOffset = rotateFromArraySpace(new Vector3(0, 0, orbitDistance));
  const centerPosition = target.clone().add(centerOffset);

  const viewPosition = (viewIndex: number) => {
    const fractionAlongViewCone = (viewIndex + 0.5) / viewCount - 0.5;
    const baselineOffset = orbitDistance * Math.tan(config.viewCone * fractionAlongViewCone);
    return target.clone().add(
      rotateFromArraySpace(new Vector3(baselineOffset, 0, orbitDistance))
    );
  };

  return {
    target,
    centerPosition,
    firstViewPosition: viewPosition(0),
    lastViewPosition: viewPosition(viewCount - 1),
    rotationRadians: {
      x: -trackballY,
      y: config.trackballX,
      z: 0,
    },
    orbitDistance,
  };
}
