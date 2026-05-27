import { Matrix4, Vector3 } from "three";
import type { Object3D } from "three";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

const footBoneNames = ["leftFoot", "rightFoot"] as const satisfies VRMHumanBoneName[];
const defaultMaxCorrection = 0.12;
const browserDebugStorageKey = "liteforms:debugFootLock";

type FootBoneName = (typeof footBoneNames)[number];
type FootBoneSource = "normalized" | "raw";

type FootPlantState = {
  bone: Object3D;
  name: FootBoneName;
  normalizedBone: Object3D | null;
  rawBone: Object3D | null;
  source: FootBoneSource;
  anchorLocal: Vector3 | null;
  rawAnchorLocal: Vector3 | null;
};

type ResolvedFootBone = {
  bone: Object3D;
  normalizedBone: Object3D | null;
  rawBone: Object3D | null;
  source: FootBoneSource;
};

export type VrmFootPlantDebugEvent =
  | {
      type: "init";
      feet: Array<{ boneName: string; foot: FootBoneName; found: boolean; source: FootBoneSource | null }>;
      maxCorrection: number;
      strength: number;
    }
  | {
      type: "anchor";
      foot: FootBoneName;
      source: FootBoneSource;
      anchorWorld: DebugVector;
    }
  | {
      type: "correction";
      afterWorld: DebugVector;
      anchorWorld: DebugVector;
      appliedCorrection: number;
      beforeWorld: DebugVector;
      clamped: boolean;
      drift: number;
      foot: FootBoneName;
      source: FootBoneSource;
      targetWorld: DebugVector;
    }
  | {
      type: "postVrmUpdate";
      anchorWorld: DebugVector;
      foot: FootBoneName;
      normalizedDrift: number | null;
      normalizedWorld: DebugVector | null;
      rawAnchorWorld: DebugVector | null;
      rawBeforeDrift: number | null;
      rawBeforeWorld: DebugVector | null;
      rawDrift: number | null;
      rawWorld: DebugVector | null;
      source: FootBoneSource;
    };

export type VrmFootPlantDebugOptions = {
  enabled?: boolean;
  logger?: (event: VrmFootPlantDebugEvent) => void;
  sampleEveryFrames?: number;
};

export type VrmFootPlantLockOptions = {
  debug?: VrmFootPlantDebugOptions;
  enabled?: boolean;
  strength?: number;
  maxCorrection?: number;
};

type DebugVector = {
  x: number;
  y: number;
  z: number;
};

export class VrmFootPlantLock {
  private readonly states: FootPlantState[];
  private readonly inverseParentWorld = new Matrix4();
  private readonly currentWorld = new Vector3();
  private readonly correctionWorld = new Vector3();
  private readonly targetWorld = new Vector3();
  private readonly afterWorld = new Vector3();
  private readonly anchorWorld = new Vector3();
  private readonly normalizedWorld = new Vector3();
  private readonly rawWorld = new Vector3();
  private readonly rawAfterWorld = new Vector3();
  private readonly targetLocal = new Vector3();
  private readonly debugEnabled: boolean;
  private readonly debugLogger: (event: VrmFootPlantDebugEvent) => void;
  private readonly debugSampleEveryFrames: number;
  private readonly enabled: boolean;
  private readonly strength: number;
  private readonly maxCorrection: number;
  private frame = 0;

  constructor(
    private readonly vrm: VRM,
    options: VrmFootPlantLockOptions = {}
  ) {
    this.enabled = options.enabled ?? true;
    this.strength = options.strength ?? 1;
    this.maxCorrection = options.maxCorrection ?? defaultMaxCorrection;
    this.debugEnabled = options.debug?.enabled ?? false;
    this.debugLogger = options.debug?.logger ?? defaultDebugLogger;
    this.debugSampleEveryFrames = Math.max(1, Math.floor(options.debug?.sampleEveryFrames ?? 30));

    const resolvedFeet = footBoneNames.map((name) => ({ name, resolved: resolveFootBone(vrm, name) }));
    this.states = resolvedFeet
      .filter((entry): entry is { name: FootBoneName; resolved: ResolvedFootBone } => entry.resolved !== null)
      .map(({ name, resolved }) => ({
        anchorLocal: null,
        bone: resolved.bone,
        name,
        normalizedBone: resolved.normalizedBone,
        rawAnchorLocal: null,
        rawBone: resolved.rawBone,
        source: resolved.source
      }));
    this.debug({
      feet: resolvedFeet.map(({ name, resolved }) => ({
        boneName: resolved?.bone.name ?? "",
        foot: name,
        found: resolved !== null,
        source: resolved?.source ?? null
      })),
      maxCorrection: this.maxCorrection,
      strength: this.strength,
      type: "init"
    });
  }

  update(): void {
    if (!this.enabled || this.states.length === 0) {
      return;
    }

    this.frame += 1;
    this.vrm.scene.updateWorldMatrix(true, true);

    for (const state of this.states) {
      state.bone.getWorldPosition(this.currentWorld);

      if (state.anchorLocal === null) {
        state.anchorLocal = this.vrm.scene.worldToLocal(this.currentWorld.clone());
        state.rawAnchorLocal = resolveRawAnchorLocal(this.vrm.scene, state.rawBone);
        this.debug({
          anchorWorld: toDebugVector(this.currentWorld),
          foot: state.name,
          source: state.source,
          type: "anchor"
        });
        continue;
      }

      const anchorWorld = resolveAnchorWorld(this.vrm.scene, state.anchorLocal, this.anchorWorld);
      this.correctionWorld.subVectors(anchorWorld, this.currentWorld);
      if (this.correctionWorld.lengthSq() < 1e-10) {
        continue;
      }

      const correctionLength = this.correctionWorld.length();
      const clamped = correctionLength > this.maxCorrection;
      if (correctionLength > this.maxCorrection) {
        this.correctionWorld.multiplyScalar(this.maxCorrection / correctionLength);
      }

      this.targetWorld.copy(this.currentWorld).addScaledVector(this.correctionWorld, this.strength);
      setWorldPosition(state.bone, this.targetWorld, this.inverseParentWorld, this.targetLocal);
      state.bone.getWorldPosition(this.afterWorld);
      if (this.frame % this.debugSampleEveryFrames === 0) {
        this.debug({
          afterWorld: toDebugVector(this.afterWorld),
          anchorWorld: toDebugVector(anchorWorld),
          appliedCorrection: roundVectorLength(this.correctionWorld),
          beforeWorld: toDebugVector(this.currentWorld),
          clamped,
          drift: round(correctionLength),
          foot: state.name,
          source: state.source,
          targetWorld: toDebugVector(this.targetWorld),
          type: "correction"
        });
      }
    }
  }

  applyPostVrmUpdate(): void {
    if (!this.enabled || this.states.length === 0) {
      return;
    }

    this.vrm.scene.updateWorldMatrix(true, true);

    for (const state of this.states) {
      if (state.anchorLocal === null) {
        continue;
      }

      const anchorWorld = resolveAnchorWorld(this.vrm.scene, state.anchorLocal, this.anchorWorld);
      const rawAnchorWorld = state.rawAnchorLocal
        ? resolveAnchorWorld(this.vrm.scene, state.rawAnchorLocal, this.targetWorld)
        : anchorWorld;
      const normalizedWorld = state.normalizedBone?.getWorldPosition(this.normalizedWorld) ?? null;
      const rawWorld = state.rawBone?.getWorldPosition(this.rawWorld) ?? null;
      const rawBeforeWorld = rawWorld ? this.rawWorld.clone() : null;
      const rawBeforeDrift = rawBeforeWorld ? round(rawBeforeWorld.distanceTo(rawAnchorWorld)) : null;
      if (state.rawBone) {
        setWorldPosition(state.rawBone, rawAnchorWorld, this.inverseParentWorld, this.targetLocal);
      }
      const rawAfterWorld = state.rawBone?.getWorldPosition(this.rawAfterWorld) ?? null;
      if (!this.debugEnabled || this.frame % this.debugSampleEveryFrames !== 0) {
        continue;
      }
      this.debug({
        anchorWorld: toDebugVector(anchorWorld),
        foot: state.name,
        normalizedDrift: normalizedWorld ? round(normalizedWorld.distanceTo(anchorWorld)) : null,
        normalizedWorld: normalizedWorld ? toDebugVector(normalizedWorld) : null,
        rawAnchorWorld: rawAnchorWorld ? toDebugVector(rawAnchorWorld) : null,
        rawBeforeDrift,
        rawBeforeWorld: rawBeforeWorld ? toDebugVector(rawBeforeWorld) : null,
        rawDrift: rawAfterWorld ? round(rawAfterWorld.distanceTo(rawAnchorWorld)) : null,
        rawWorld: rawAfterWorld ? toDebugVector(rawAfterWorld) : null,
        source: state.source,
        type: "postVrmUpdate"
      });
    }
  }

  reset(): void {
    for (const state of this.states) {
      state.anchorLocal = null;
      state.rawAnchorLocal = null;
    }
  }

  private debug(event: VrmFootPlantDebugEvent): void {
    if (this.debugEnabled) {
      this.debugLogger(event);
    }
  }
}

function resolveFootBone(vrm: VRM, name: FootBoneName): ResolvedFootBone | null {
  const humanoid = vrm.humanoid as VRM["humanoid"] | undefined;
  const normalizedBone = humanoid?.getNormalizedBoneNode(name) ?? null;
  const rawBone = humanoid?.getRawBoneNode(name) ?? null;
  if (normalizedBone) {
    return { bone: normalizedBone, normalizedBone, rawBone, source: "normalized" };
  }
  return rawBone ? { bone: rawBone, normalizedBone, rawBone, source: "raw" } : null;
}

function setWorldPosition(
  object: Object3D,
  worldPosition: Vector3,
  inverseParentWorld: Matrix4,
  targetLocal: Vector3
): void {
  if (!object.parent) {
    object.position.copy(worldPosition);
    object.updateWorldMatrix(false, true);
    return;
  }

  object.parent.updateWorldMatrix(true, false);
  inverseParentWorld.copy(object.parent.matrixWorld).invert();
  targetLocal.copy(worldPosition).applyMatrix4(inverseParentWorld);
  object.position.copy(targetLocal);
  object.updateWorldMatrix(false, true);
}

function resolveAnchorWorld(root: Object3D, anchorLocal: Vector3, target: Vector3): Vector3 {
  return target.copy(anchorLocal).applyMatrix4(root.matrixWorld);
}

function resolveRawAnchorLocal(root: Object3D, rawBone: Object3D | null): Vector3 | null {
  if (!rawBone) {
    return null;
  }

  const rawAnchorWorld = rawBone.getWorldPosition(new Vector3());
  return root.worldToLocal(rawAnchorWorld);
}

function defaultDebugLogger(event: VrmFootPlantDebugEvent): void {
  console.log(`[Liteforms foot lock] ${JSON.stringify(event)}`);
}

function toDebugVector(vector: Vector3): DebugVector {
  return {
    x: round(vector.x),
    y: round(vector.y),
    z: round(vector.z)
  };
}

function roundVectorLength(vector: Vector3): number {
  return round(vector.length());
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function shouldEnableBrowserFootPlantDebug({
  localStorageValue,
  search
}: {
  localStorageValue?: string | null;
  search: string;
}): boolean {
  const params = new URLSearchParams(search);
  return params.get("debugFootLock") === "1" || localStorageValue === "1";
}

export function createBrowserFootPlantDebugOptions(): Pick<VrmFootPlantLockOptions, "debug"> {
  if (typeof window === "undefined") {
    return {};
  }

  const localStorageValue = safeReadDebugStorage();
  if (!shouldEnableBrowserFootPlantDebug({ localStorageValue, search: window.location.search })) {
    return {};
  }

  return {
    debug: {
      enabled: true,
      logger: defaultDebugLogger
    }
  };
}

function safeReadDebugStorage(): string | null {
  try {
    return window.localStorage.getItem(browserDebugStorageKey);
  } catch {
    return null;
  }
}
