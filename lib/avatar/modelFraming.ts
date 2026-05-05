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

/**
 * Computes scale, position offset, and camera target for a model so that its
 * Y-axis height in scene units matches targetHeight exactly.
 *
 * Use this to match an imported VRM to the visual size of a reference model
 * (e.g. the default lobster) rather than using a fixed max-axis constant.
 */
export function computeModelFramingByHeight(
  size: Vector3,
  center: Vector3,
  targetHeight: number
): ModelFraming {
  const scale = size.y > 0 ? targetHeight / size.y : 1;

  const position = center.clone().multiplyScalar(-scale);
  position.y += size.y * scale * 0.5 - 0.05;

  return {
    scale,
    position,
    cameraTarget: new Vector3(0, Math.max(0.75, size.y * scale * 0.45), 0),
  };
}

/**
 * Computes framing for an Object3D so its Y-axis height matches targetHeight.
 * Mirrors the Object3D-accepting signature of computeModelFraming.
 */
export function computeModelFramingMatchHeight(scene: Object3D, targetHeight: number): ModelFraming {
  const bounds = new Box3().setFromObject(scene);
  return computeModelFramingByHeight(
    bounds.getSize(new Vector3()),
    bounds.getCenter(new Vector3()),
    targetHeight
  );
}

/**
 * Returns the Y height (in scene units) that a model will occupy when framed
 * with computeModelFraming(scene, targetMaxAxis).
 *
 * Used to measure the lobster's framed height so imported VRMs can be scaled
 * to match it.
 */
export function computeModelSceneHeight(size: Vector3, targetMaxAxis: number): number {
  const maxAxis = Math.max(size.x, size.y, size.z);
  const scale = maxAxis > 0 ? targetMaxAxis / maxAxis : 1;
  return size.y * scale;
}
