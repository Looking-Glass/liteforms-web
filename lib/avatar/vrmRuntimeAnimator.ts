import { MathUtils, Object3D } from "three";
import type { VRM } from "@pixiv/three-vrm";
import type { AvatarLipSyncFrame } from "@/lib/avatar/lipSyncEvents";
import type { VrmMouthExpression } from "@/lib/speech";
import {
  clearMorphTargetWeights,
  getAvailableVrm0MouthMorphTargets,
  resolveMorphTargetName,
  resolveVrm0MouthMorphTarget,
  setMorphTargetWeight
} from "./morphTargetController";
import { hasBoundVrmExpression } from "./vrmExpressionController";

const vrmMouthExpressions: VrmMouthExpression[] = ["aa", "ih", "ou", "ee", "oh"];
const blinkExpressionNames = ["blink", "blinkLeft", "blinkRight"];
const blinkMorphTargetCandidates = ["Blink", "blink", "BLINK", "Fcl_EYE_Close"];

type AnimatorClock = {
  now(): number;
  random(): number;
};

type MouthTarget =
  | {
      mode: "expression";
      expression: VrmMouthExpression | null;
      weight: number;
      holdUntil: number;
    }
  | {
      mode: "morph";
      targetName: string | null;
      weight: number;
      holdUntil: number;
    };

export class VrmRuntimeAnimator {
  private readonly clock: AnimatorClock;
  private readonly lookTarget = new Object3D();
  private readonly mouthWeights = new Map<string, number>();
  private readonly morphMouthTargets: string[];
  private readonly blinkExpressionNames: string[];
  private readonly blinkMorphTargetName: string | null;
  private mouthTarget: MouthTarget | null = null;
  private blinkWeight = 0;
  private blinkTarget = 0;
  private nextBlinkAt = 0;
  private blinkReleaseAt = 0;
  private nextEyeMoveAt = 0;

  constructor(
    private readonly vrm: VRM,
    clock: Partial<AnimatorClock> = {}
  ) {
    this.clock = {
      now: clock.now ?? (() => performance.now()),
      random: clock.random ?? Math.random
    };
    this.morphMouthTargets = getAvailableVrm0MouthMorphTargets(vrm.scene);
    this.blinkExpressionNames = blinkExpressionNames.filter((name) => hasBoundVrmExpression(vrm.expressionManager, name));
    this.blinkMorphTargetName = this.resolveBlinkMorphTarget();
    this.nextBlinkAt = this.clock.now() + this.randomRange(1800, 5200);
    this.nextEyeMoveAt = this.clock.now();

    if (vrm.lookAt) {
      this.lookTarget.name = "Liteforms VRM look target";
      vrm.scene.add(this.lookTarget);
      vrm.lookAt.target = this.lookTarget;
    }
  }

  setLipSyncFrame(frame: AvatarLipSyncFrame) {
    const holdUntil = this.clock.now() + getMouthHoldMs(frame);
    const expression = frame.vrmExpression;

    if (hasBoundVrmExpression(this.vrm.expressionManager, expression)) {
      this.mouthTarget = {
        mode: "expression",
        expression,
        weight: frame.weight,
        holdUntil
      };
      return;
    }

    this.mouthTarget = {
      mode: "morph",
      targetName: resolveVrm0MouthMorphTarget(this.vrm.scene, expression),
      weight: frame.weight,
      holdUntil
    };
  }

  clearMouth() {
    this.mouthTarget = null;
  }

  update(delta: number) {
    const now = this.clock.now();

    this.updateMouth(delta, now);
    this.updateBlink(delta, now);
    this.updateEyeTarget(now);
    this.vrm.expressionManager?.update?.();
  }

  dispose() {
    if (this.vrm.lookAt?.target === this.lookTarget) {
      this.vrm.lookAt.target = null;
    }
    this.lookTarget.removeFromParent();
  }

  private updateMouth(delta: number, now: number) {
    const target = this.mouthTarget && now <= this.mouthTarget.holdUntil ? this.mouthTarget : null;
    const speed = target ? 24 : 14;
    const alpha = dampAlpha(speed, delta);

    for (const expression of vrmMouthExpressions) {
      const desired = target?.mode === "expression" && target.expression === expression ? target.weight : 0;
      const current = this.mouthWeights.get(expression) ?? 0;
      const next = MathUtils.lerp(current, desired, alpha);
      this.mouthWeights.set(expression, next);

      if (hasBoundVrmExpression(this.vrm.expressionManager, expression)) {
        this.vrm.expressionManager?.setValue(expression, next);
      }
    }

    if (this.morphMouthTargets.length > 0) {
      for (const targetName of this.morphMouthTargets) {
        const desired = target?.mode === "morph" && target.targetName === targetName ? target.weight : 0;
        const current = this.mouthWeights.get(targetName) ?? 0;
        const next = MathUtils.lerp(current, desired, alpha);
        this.mouthWeights.set(targetName, next);
        setMorphTargetWeight(this.vrm.scene, targetName, next);
      }
    }

    if (target === null && this.mouthTarget !== null) {
      this.mouthTarget = null;
    }
  }

  private updateBlink(delta: number, now: number) {
    if (this.blinkExpressionNames.length === 0 && !this.blinkMorphTargetName) {
      return;
    }

    if (now >= this.nextBlinkAt) {
      this.blinkTarget = 1;
      this.blinkReleaseAt = now + this.randomRange(75, 115);
      this.nextBlinkAt = now + this.randomRange(2200, 6200);
    }

    if (this.blinkTarget > 0 && now >= this.blinkReleaseAt) {
      this.blinkTarget = 0;
    }

    this.blinkWeight = MathUtils.lerp(this.blinkWeight, this.blinkTarget, dampAlpha(this.blinkTarget > 0 ? 34 : 24, delta));

    for (const expressionName of this.blinkExpressionNames) {
      this.vrm.expressionManager?.setValue(expressionName, this.blinkWeight);
    }
    if (this.blinkMorphTargetName) {
      setMorphTargetWeight(this.vrm.scene, this.blinkMorphTargetName, this.blinkWeight);
    }
  }

  private updateEyeTarget(now: number) {
    if (!this.vrm.lookAt || now < this.nextEyeMoveAt) {
      return;
    }

    this.nextEyeMoveAt = now + this.randomRange(1400, 4200);
    this.lookTarget.position.set(this.randomRange(-0.35, 0.35), this.randomRange(1.25, 1.65), this.randomRange(1.1, 1.6));
  }

  private resolveBlinkMorphTarget() {
    for (const targetName of blinkMorphTargetCandidates) {
      const resolved = resolveMorphTargetName(this.vrm.scene, targetName);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }

  private randomRange(min: number, max: number) {
    return MathUtils.lerp(min, max, this.clock.random());
  }
}

function getMouthHoldMs(frame: AvatarLipSyncFrame) {
  if ("end" in frame) {
    return MathUtils.clamp((frame.end - frame.start) * 1000, 90, 260);
  }
  return 120;
}

function dampAlpha(speed: number, delta: number) {
  return 1 - Math.exp(-speed * delta);
}

export function clearVrmRuntimeMouth(vrm: VRM | undefined) {
  if (!vrm) {
    return;
  }

  for (const expression of vrmMouthExpressions) {
    vrm.expressionManager?.setValue(expression, 0);
  }
  clearMorphTargetWeights(vrm.scene, getAvailableVrm0MouthMorphTargets(vrm.scene));
  vrm.expressionManager?.update?.();
}
