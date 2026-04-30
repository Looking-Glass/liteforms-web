import { Box3, Vector3 } from "three";
import type { Object3D } from "three";

export type ModelFraming = {
  scale: number;
  position: Vector3;
  cameraTarget: Vector3;
};

/**
 * Computes scale, position offset, and camera target for a model given its
 * bounding box dimensions and a desired maximum-axis size in scene units.
 *
 * The returned position centres the model at the origin and lifts it so its
 * base sits approximately at y = 0.
 */
export function computeModelFramingFromBounds(
  size: Vector3,
  center: Vector3,
  targetMaxAxis: number
): ModelFraming {
  const maxAxis = Math.max(size.x, size.y, size.z);
  const scale = maxAxis > 0 ? targetMaxAxis / maxAxis : 1;

  const position = center.clone().multiplyScalar(-scale);
  position.y += size.y * scale * 0.5 - 0.05;

  return {
    scale,
    position,
    cameraTarget: new Vector3(0, Math.max(0.75, size.y * scale * 0.45), 0),
  };
}

/**
 * Computes framing for an Object3D by measuring its world-space bounding box.
 */
export function computeModelFraming(scene: Object3D, targetMaxAxis: number): ModelFraming {
  const bounds = new Box3().setFromObject(scene);
  return computeModelFramingFromBounds(
    bounds.getSize(new Vector3()),
    bounds.getCenter(new Vector3()),
    targetMaxAxis
  );
}
