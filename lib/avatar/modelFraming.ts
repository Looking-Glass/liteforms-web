import { Box3, Vector3 } from "three";
import type { Object3D } from "three";

export type ModelFraming = {
  scale: number;
  position: Vector3;
  cameraTarget: Vector3;
};

export type ModelFootprint = {
  width: number;
  height: number;
};

export type FootprintInsetOptions = {
  widthFill?: number;
  heightFill?: number;
};

export type ModelBounds = {
  size: Vector3;
  center: Vector3;
  meshCount: number;
};

type ScaleSolveOptions = {
  iterations?: number;
  maxMultiplier?: number;
};

const DEFAULT_IMPORTED_WIDTH_FILL = 0.9;
const DEFAULT_IMPORTED_HEIGHT_FILL = 0.82;

type MeasurableMesh = Object3D & {
  isMesh?: boolean;
  geometry?: {
    attributes?: {
      position?: { count: number };
    };
    boundingBox?: Box3 | null;
    computeBoundingBox?: () => void;
  };
  boundingBox?: Box3 | null;
  computeBoundingBox?: () => void;
  getVertexPosition?: (index: number, target: Vector3) => Vector3;
};

/**
 * Measures renderable meshes under an object using exact vertices plus each
 * mesh's bounding envelope, matching Unity-style combined renderer bounds.
 */
export function measureRenderableMeshBounds(object: Object3D): ModelBounds {
  object.updateWorldMatrix(true, true);

  const bounds = new Box3();
  const meshBounds = new Box3();
  const vertex = new Vector3();
  let meshCount = 0;

  object.traverse((child) => {
    const mesh = child as MeasurableMesh;
    const geometry = mesh.geometry;
    if (mesh.isMesh !== true || !geometry) {
      return;
    }

    const position = mesh.geometry?.attributes?.position;

    mesh.updateWorldMatrix(true, false);
    meshCount += 1;

    if (position && typeof mesh.getVertexPosition === "function") {
      for (let i = 0; i < position.count; i += 1) {
        mesh.getVertexPosition(i, vertex);
        vertex.applyMatrix4(mesh.matrixWorld);
        bounds.expandByPoint(vertex);
      }
    }

    if (mesh.boundingBox === null && typeof mesh.computeBoundingBox === "function") {
      mesh.computeBoundingBox();
    }
    if (mesh.boundingBox && !mesh.boundingBox.isEmpty()) {
      meshBounds.copy(mesh.boundingBox).applyMatrix4(mesh.matrixWorld);
      bounds.union(meshBounds);
    }

    if (geometry.boundingBox === null && typeof geometry.computeBoundingBox === "function") {
      geometry.computeBoundingBox();
    }
    if (geometry.boundingBox && !geometry.boundingBox.isEmpty()) {
      meshBounds.copy(geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      bounds.union(meshBounds);
    }
  });

  if (bounds.isEmpty()) {
    return {
      size: new Vector3(),
      center: new Vector3(),
      meshCount,
    };
  }

  return {
    size: bounds.getSize(new Vector3()),
    center: bounds.getCenter(new Vector3()),
    meshCount,
  };
}

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
  const bounds = measureRenderableMeshBounds(scene);
  return computeModelFramingFromBounds(
    bounds.size,
    bounds.center,
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
  const bounds = measureRenderableMeshBounds(scene);
  return computeModelFramingByHeight(
    bounds.size,
    bounds.center,
    targetHeight
  );
}

/**
 * Computes scale, position offset, and camera target for a model so that its
 * X/Y footprint fits inside a reference model's X/Y footprint.
 *
 * The larger required reduction wins: tall models match the reference height,
 * wide models match the reference width, and both axes stay within the target.
 */
export function computeModelFramingByFootprint(
  size: Vector3,
  center: Vector3,
  targetFootprint: ModelFootprint
): ModelFraming {
  const scaleCandidates = [
    size.x > 0 ? targetFootprint.width / size.x : null,
    size.y > 0 ? targetFootprint.height / size.y : null,
  ].filter((scale): scale is number => scale !== null && Number.isFinite(scale) && scale > 0);
  const scale = scaleCandidates.length > 0 ? Math.min(...scaleCandidates) : 1;

  const position = center.clone().multiplyScalar(-scale);
  position.y += size.y * scale * 0.5 - 0.05;

  return {
    scale,
    position,
    cameraTarget: new Vector3(0, Math.max(0.75, size.y * scale * 0.45), 0),
  };
}

export function computeModelPositionFromBounds(
  basePosition: Vector3,
  boundsCenter: Vector3,
  finalSize: Vector3,
  targetBottom = -0.05
): Vector3 {
  const desiredCenter = new Vector3(
    0,
    finalSize.y * 0.5 + targetBottom,
    0
  );
  return basePosition.clone().add(desiredCenter.sub(boundsCenter));
}

export function solveUniformScaleMultiplierForFootprint(
  measureSizeAtMultiplier: (multiplier: number) => Vector3,
  targetFootprint: ModelFootprint,
  options: ScaleSolveOptions = {}
): number {
  const iterations = options.iterations ?? 18;
  const maxMultiplier = options.maxMultiplier ?? 100;
  const fits = (size: Vector3) =>
    size.x <= targetFootprint.width && size.y <= targetFootprint.height;

  return solveUniformScaleMultiplier(measureSizeAtMultiplier, fits, iterations, maxMultiplier);
}

export function computeInsetFootprint(
  referenceFootprint: ModelFootprint,
  options: FootprintInsetOptions = {}
): ModelFootprint {
  const widthFill = normalizeFill(options.widthFill, DEFAULT_IMPORTED_WIDTH_FILL);
  const heightFill = normalizeFill(options.heightFill, DEFAULT_IMPORTED_HEIGHT_FILL);

  return {
    width: referenceFootprint.width * widthFill,
    height: referenceFootprint.height * heightFill,
  };
}

function normalizeFill(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function solveUniformScaleMultiplierForMaxAxis(
  measureSizeAtMultiplier: (multiplier: number) => Vector3,
  targetMaxAxis: number,
  options: ScaleSolveOptions = {}
): number {
  const iterations = options.iterations ?? 18;
  const maxMultiplier = options.maxMultiplier ?? 100;
  const fits = (size: Vector3) => Math.max(size.x, size.y, size.z) <= targetMaxAxis;

  return solveUniformScaleMultiplier(measureSizeAtMultiplier, fits, iterations, maxMultiplier);
}

function solveUniformScaleMultiplier(
  measureSizeAtMultiplier: (multiplier: number) => Vector3,
  fits: (size: Vector3) => boolean,
  iterations: number,
  maxMultiplier: number
): number {
  const baseSize = measureSizeAtMultiplier(1);
  if (baseSize.x === 0 && baseSize.y === 0 && baseSize.z === 0) {
    return 1;
  }

  let lower = 0;
  let upper = 1;
  let upperSize = baseSize;

  if (fits(upperSize)) {
    lower = upper;
    while (upper < maxMultiplier) {
      const nextUpper = Math.min(upper * 2, maxMultiplier);
      const nextSize = measureSizeAtMultiplier(nextUpper);
      if (!fits(nextSize)) {
        upper = nextUpper;
        upperSize = nextSize;
        break;
      }
      lower = nextUpper;
      upper = nextUpper;
      upperSize = nextSize;
      if (upper === maxMultiplier) {
        return lower;
      }
    }

    if (fits(upperSize)) {
      return lower;
    }
  }

  for (let i = 0; i < iterations; i += 1) {
    const midpoint = (lower + upper) * 0.5;
    const size = measureSizeAtMultiplier(midpoint);
    if (fits(size)) {
      lower = midpoint;
    } else {
      upper = midpoint;
    }
  }

  return lower > 0 ? lower : 1;
}

/**
 * Computes framing for an Object3D so its X/Y footprint fits in targetFootprint.
 */
export function computeModelFramingMatchFootprint(
  scene: Object3D,
  targetFootprint: ModelFootprint
): ModelFraming {
  const bounds = measureRenderableMeshBounds(scene);
  return computeModelFramingByFootprint(
    bounds.size,
    bounds.center,
    targetFootprint
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

/**
 * Returns the X/Y footprint (in scene units) that a model will occupy when
 * framed with computeModelFraming(scene, targetMaxAxis).
 */
export function computeModelSceneFootprint(size: Vector3, targetMaxAxis: number): ModelFootprint {
  const maxAxis = Math.max(size.x, size.y, size.z);
  const scale = maxAxis > 0 ? targetMaxAxis / maxAxis : 1;
  return {
    width: size.x * scale,
    height: size.y * scale,
  };
}
