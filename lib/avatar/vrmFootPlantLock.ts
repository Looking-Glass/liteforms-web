import { Box3, Matrix4, Vector3 } from "three";
import type { Object3D } from "three";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

const footBonePairs = [
  { foot: "leftFoot", toes: "leftToes" },
  { foot: "rightFoot", toes: "rightToes" }
] as const satisfies ReadonlyArray<{ foot: VRMHumanBoneName; toes: VRMHumanBoneName }>;
const defaultMaxCorrection = 0.12;
const defaultMaxSoleDrop = 0.22;
const browserDebugStorageKey = "liteforms:debugFootLock";

type FootBoneName = (typeof footBonePairs)[number]["foot"];
type ToeBoneName = (typeof footBonePairs)[number]["toes"];
type FootBoneSource = "normalized" | "raw";
type FootContactSource = "foot" | "toes";

type FootPlantState = {
  bone: Object3D;
  name: FootBoneName;
  normalizedBone: Object3D | null;
  normalizedToes: Object3D | null;
  rawBone: Object3D | null;
  rawToes: Object3D | null;
  source: FootBoneSource;
  anchorLocal: Vector3 | null;
  contactOffsetLocal: Vector3 | null;
  contactSource: FootContactSource | null;
  rawAnchorLocal: Vector3 | null;
  rawContactOffsetLocal: Vector3 | null;
  rawContactSource: FootContactSource | null;
};

type ResolvedFootBone = {
  bone: Object3D;
  contactBone: Object3D | null;
  normalizedBone: Object3D | null;
  normalizedToes: Object3D | null;
  rawBone: Object3D | null;
  rawToes: Object3D | null;
  source: FootBoneSource;
};

type CapturedFootContact = {
  anchorLocal: Vector3;
  contactOffsetLocal: Vector3;
  contactSource: FootContactSource;
  contactWorld: Vector3;
};

export type VrmFootPlantDebugEvent =
  | {
      type: "init";
      feet: Array<{
        boneName: string;
        foot: FootBoneName;
        found: boolean;
        normalizedToesName: string;
        rawToesName: string;
        source: FootBoneSource | null;
        toesFound: boolean;
      }>;
      maxCorrection: number;
      strength: number;
    }
  | {
      type: "anchor";
      foot: FootBoneName;
      source: FootBoneSource;
      anchorWorld: DebugVector;
      contactSource: FootContactSource;
    }
  | {
      type: "correction";
      afterWorld: DebugVector;
      anchorWorld: DebugVector;
      appliedCorrection: number;
      beforeWorld: DebugVector;
      clamped: boolean;
      contactSource: FootContactSource;
      drift: number;
      foot: FootBoneName;
      source: FootBoneSource;
      targetWorld: DebugVector;
    }
  | {
      type: "postVrmUpdate";
      anchorWorld: DebugVector;
      contactSource: FootContactSource | null;
      foot: FootBoneName;
      normalizedDrift: number | null;
      normalizedWorld: DebugVector | null;
      rawAnchorWorld: DebugVector | null;
      rawBeforeDrift: number | null;
      rawBeforeWorld: DebugVector | null;
      rawContactSource: FootContactSource | null;
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
  maxSoleDrop?: number;
  settleFrames?: number;
};

type DebugVector = {
  x: number;
  y: number;
  z: number;
};

export class VrmFootPlantLock {
  private readonly states: FootPlantState[];
  private readonly inverseParentWorld = new Matrix4();
  private readonly sceneBounds = new Box3();
  private readonly boneWorld = new Vector3();
  private readonly targetBoneWorld = new Vector3();
  private readonly currentWorld = new Vector3();
  private readonly correctionWorld = new Vector3();
  private readonly targetWorld = new Vector3();
  private readonly afterWorld = new Vector3();
  private readonly anchorWorld = new Vector3();
  private readonly rawAnchorWorld = new Vector3();
  private readonly normalizedWorld = new Vector3();
  private readonly rawWorld = new Vector3();
  private readonly rawAfterWorld = new Vector3();
  private readonly rawBoneWorld = new Vector3();
  private readonly rawTargetBoneWorld = new Vector3();
  private readonly targetLocal = new Vector3();
  private readonly debugEnabled: boolean;
  private readonly debugLogger: (event: VrmFootPlantDebugEvent) => void;
  private readonly debugSampleEveryFrames: number;
  private readonly enabled: boolean;
  private readonly strength: number;
  private readonly maxCorrection: number;
  private readonly maxSoleDrop: number;
  private readonly defaultSettleFrames: number;
  private settleFramesRemaining: number;
  private frame = 0;

  constructor(
    private readonly vrm: VRM,
    options: VrmFootPlantLockOptions = {}
  ) {
    this.enabled = options.enabled ?? true;
    this.strength = options.strength ?? 1;
    this.maxCorrection = options.maxCorrection ?? defaultMaxCorrection;
    this.maxSoleDrop = options.maxSoleDrop ?? defaultMaxSoleDrop;
    this.defaultSettleFrames = Math.max(0, Math.floor(options.settleFrames ?? 0));
    this.settleFramesRemaining = this.defaultSettleFrames;
    this.debugEnabled = options.debug?.enabled ?? false;
    this.debugLogger = options.debug?.logger ?? defaultDebugLogger;
    this.debugSampleEveryFrames = Math.max(1, Math.floor(options.debug?.sampleEveryFrames ?? 30));

    const resolvedFeet = footBonePairs.map(({ foot, toes }) => ({ foot, toes, resolved: resolveFootBone(vrm, foot, toes) }));
    this.states = resolvedFeet
      .filter((entry): entry is { foot: FootBoneName; toes: ToeBoneName; resolved: ResolvedFootBone } => entry.resolved !== null)
      .map(({ foot, resolved }) => ({
        anchorLocal: null,
        bone: resolved.bone,
        contactOffsetLocal: null,
        contactSource: null,
        name: foot,
        normalizedBone: resolved.normalizedBone,
        normalizedToes: resolved.normalizedToes,
        rawAnchorLocal: null,
        rawBone: resolved.rawBone,
        rawContactOffsetLocal: null,
        rawContactSource: null,
        rawToes: resolved.rawToes,
        source: resolved.source
      }));
    this.debug({
      feet: resolvedFeet.map(({ foot, resolved }) => ({
        boneName: resolved?.bone.name ?? "",
        foot,
        found: resolved !== null,
        normalizedToesName: resolved?.normalizedToes?.name ?? "",
        rawToesName: resolved?.rawToes?.name ?? "",
        source: resolved?.source ?? null,
        toesFound: (resolved?.contactBone ?? null) !== null
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

    if (this.settleFramesRemaining > 0) {
      this.settleFramesRemaining -= 1;
      return;
    }

    for (const state of this.states) {
      if (state.anchorLocal === null) {
        const contact = captureFootContact({
          contactBone: resolveContactBone(state),
          footBone: state.bone,
          maxSoleDrop: this.maxSoleDrop,
          root: this.vrm.scene,
          sceneBounds: this.sceneBounds
        });
        state.anchorLocal = contact.anchorLocal;
        state.contactOffsetLocal = contact.contactOffsetLocal;
        state.contactSource = contact.contactSource;
        this.debug({
          anchorWorld: toDebugVector(contact.contactWorld),
          contactSource: contact.contactSource,
          foot: state.name,
          source: state.source,
          type: "anchor"
        });
        continue;
      }

      if (state.contactOffsetLocal === null) {
        continue;
      }

      const anchorWorld = resolveAnchorWorld(this.vrm.scene, state.anchorLocal, this.anchorWorld);
      resolveContactWorld(state.bone, state.contactOffsetLocal, this.currentWorld);
      this.correctionWorld.subVectors(anchorWorld, this.currentWorld);
      if (this.correctionWorld.lengthSq() < 1e-10) {
        continue;
      }

      const correctionLength = this.correctionWorld.length();
      const clamped = correctionLength > this.maxCorrection;
      if (correctionLength > this.maxCorrection) {
        this.correctionWorld.multiplyScalar(this.maxCorrection / correctionLength);
      }

      state.bone.getWorldPosition(this.boneWorld);
      this.targetWorld.copy(this.currentWorld).addScaledVector(this.correctionWorld, this.strength);
      this.targetBoneWorld.copy(this.boneWorld).addScaledVector(this.correctionWorld, this.strength);
      setWorldPosition(state.bone, this.targetBoneWorld, this.inverseParentWorld, this.targetLocal);
      resolveContactWorld(state.bone, state.contactOffsetLocal, this.afterWorld);
      if (this.frame % this.debugSampleEveryFrames === 0) {
        this.debug({
          afterWorld: toDebugVector(this.afterWorld),
          anchorWorld: toDebugVector(anchorWorld),
          appliedCorrection: roundVectorLength(this.correctionWorld),
          beforeWorld: toDebugVector(this.currentWorld),
          clamped,
          contactSource: state.contactSource ?? "foot",
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
      const normalizedWorld =
        state.normalizedBone && state.contactOffsetLocal
          ? resolveContactWorld(state.normalizedBone, state.contactOffsetLocal, this.normalizedWorld)
          : null;

      if (state.rawBone && (state.rawAnchorLocal === null || state.rawContactOffsetLocal === null)) {
        const rawContact = captureFootContact({
          contactBone: state.rawToes,
          footBone: state.rawBone,
          maxSoleDrop: this.maxSoleDrop,
          root: this.vrm.scene,
          sceneBounds: this.sceneBounds
        });
        state.rawAnchorLocal = rawContact.anchorLocal;
        state.rawContactOffsetLocal = rawContact.contactOffsetLocal;
        state.rawContactSource = rawContact.contactSource;
        this.debug({
          anchorWorld: toDebugVector(rawContact.contactWorld),
          contactSource: rawContact.contactSource,
          foot: state.name,
          source: "raw",
          type: "anchor"
        });
      }

      const rawAnchorWorld = state.rawAnchorLocal
        ? resolveAnchorWorld(this.vrm.scene, state.rawAnchorLocal, this.rawAnchorWorld)
        : anchorWorld;
      const rawWorld =
        state.rawBone && state.rawContactOffsetLocal
          ? resolveContactWorld(state.rawBone, state.rawContactOffsetLocal, this.rawWorld)
          : null;
      const rawBeforeWorld = rawWorld ? this.rawWorld.clone() : null;
      const rawBeforeDrift = rawBeforeWorld ? round(rawBeforeWorld.distanceTo(rawAnchorWorld)) : null;
      if (state.rawBone && rawBeforeWorld) {
        state.rawBone.getWorldPosition(this.rawBoneWorld);
        this.correctionWorld.subVectors(rawAnchorWorld, rawBeforeWorld);
        this.rawTargetBoneWorld.copy(this.rawBoneWorld).add(this.correctionWorld);
        setWorldPosition(state.rawBone, this.rawTargetBoneWorld, this.inverseParentWorld, this.targetLocal);
      }
      const rawAfterWorld =
        state.rawBone && state.rawContactOffsetLocal
          ? resolveContactWorld(state.rawBone, state.rawContactOffsetLocal, this.rawAfterWorld)
          : null;
      if (!this.debugEnabled || this.frame % this.debugSampleEveryFrames !== 0) {
        continue;
      }
      this.debug({
        anchorWorld: toDebugVector(anchorWorld),
        contactSource: state.contactSource,
        foot: state.name,
        normalizedDrift: normalizedWorld ? round(normalizedWorld.distanceTo(anchorWorld)) : null,
        normalizedWorld: normalizedWorld ? toDebugVector(normalizedWorld) : null,
        rawAnchorWorld: rawAnchorWorld ? toDebugVector(rawAnchorWorld) : null,
        rawBeforeDrift,
        rawBeforeWorld: rawBeforeWorld ? toDebugVector(rawBeforeWorld) : null,
        rawContactSource: state.rawContactSource,
        rawDrift: rawAfterWorld ? round(rawAfterWorld.distanceTo(rawAnchorWorld)) : null,
        rawWorld: rawAfterWorld ? toDebugVector(rawAfterWorld) : null,
        source: state.source,
        type: "postVrmUpdate"
      });
    }
  }

  reset(settleFrames = this.defaultSettleFrames): void {
    for (const state of this.states) {
      state.anchorLocal = null;
      state.contactOffsetLocal = null;
      state.contactSource = null;
      state.rawAnchorLocal = null;
      state.rawContactOffsetLocal = null;
      state.rawContactSource = null;
    }
    this.settleFramesRemaining = Math.max(0, Math.floor(settleFrames));
  }

  private debug(event: VrmFootPlantDebugEvent): void {
    if (this.debugEnabled) {
      this.debugLogger(event);
    }
  }
}

function resolveFootBone(vrm: VRM, name: FootBoneName, toesName: ToeBoneName): ResolvedFootBone | null {
  const humanoid = vrm.humanoid as VRM["humanoid"] | undefined;
  const normalizedBone = humanoid?.getNormalizedBoneNode(name) ?? null;
  const normalizedToes = humanoid?.getNormalizedBoneNode(toesName) ?? null;
  const rawBone = humanoid?.getRawBoneNode(name) ?? null;
  const rawToes = humanoid?.getRawBoneNode(toesName) ?? null;
  if (normalizedBone) {
    return {
      bone: normalizedBone,
      contactBone: normalizedToes,
      normalizedBone,
      normalizedToes,
      rawBone,
      rawToes,
      source: "normalized"
    };
  }
  return rawBone
    ? {
        bone: rawBone,
        contactBone: rawToes,
        normalizedBone,
        normalizedToes,
        rawBone,
        rawToes,
        source: "raw"
      }
    : null;
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

function captureFootContact({
  contactBone,
  footBone,
  maxSoleDrop,
  root,
  sceneBounds
}: {
  contactBone: Object3D | null;
  footBone: Object3D;
  maxSoleDrop: number;
  root: Object3D;
  sceneBounds: Box3;
}): CapturedFootContact {
  const contactWorld = (contactBone ?? footBone).getWorldPosition(new Vector3());
  const boundsBottom = resolveBoundsBottom(root, sceneBounds);
  if (boundsBottom !== null) {
    const soleDrop = contactWorld.y - boundsBottom;
    if (soleDrop > 0 && soleDrop <= maxSoleDrop) {
      contactWorld.y = boundsBottom;
    }
  }

  return {
    anchorLocal: root.worldToLocal(contactWorld.clone()),
    contactOffsetLocal: footBone.worldToLocal(contactWorld.clone()),
    contactSource: contactBone ? "toes" : "foot",
    contactWorld
  };
}

function resolveContactBone(state: FootPlantState): Object3D | null {
  return state.source === "normalized" ? state.normalizedToes : state.rawToes;
}

function resolveContactWorld(bone: Object3D, contactOffsetLocal: Vector3, target: Vector3): Vector3 {
  return target.copy(contactOffsetLocal).applyMatrix4(bone.matrixWorld);
}

function resolveBoundsBottom(root: Object3D, sceneBounds: Box3): number | null {
  sceneBounds.setFromObject(root);
  return sceneBounds.isEmpty() ? null : sceneBounds.min.y;
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
