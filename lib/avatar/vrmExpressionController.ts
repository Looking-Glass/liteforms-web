import type { VisemeFrame, RmsLipSyncFrame, VrmMouthExpression } from "@/lib/speech";

export type VrmExpressionManagerLike = {
  expressionMap?: Record<string, unknown>;
  setValue(name: string, value: number): void;
  resetValues?: () => void;
  update?: () => void;
};

export type VrmMouthFrame = Pick<VisemeFrame, "vrmExpression" | "weight"> | RmsLipSyncFrame;

const vrmMouthExpressions: VrmMouthExpression[] = ["aa", "ih", "ou", "ee", "oh"];

export function applyVrmMouthFrame(expressionManager: VrmExpressionManagerLike | undefined, frame: VrmMouthFrame) {
  if (!expressionManager) {
    return;
  }

  for (const expression of vrmMouthExpressions) {
    expressionManager.setValue(expression, expression === frame.vrmExpression ? frame.weight : 0);
  }
  expressionManager.update?.();
}

export function clearVrmMouth(expressionManager: VrmExpressionManagerLike | undefined) {
  if (!expressionManager) {
    return;
  }

  for (const expression of vrmMouthExpressions) {
    expressionManager.setValue(expression, 0);
  }
  expressionManager.update?.();
}

export function applyVrmExpression(expressionManager: VrmExpressionManagerLike | undefined, expression: string, weight: number) {
  if (!expressionManager) {
    return;
  }

  expressionManager.setValue(expression, weight);
  expressionManager.update?.();
}

export function resetVrmExpressions(expressionManager: VrmExpressionManagerLike | undefined) {
  if (!expressionManager) {
    return;
  }

  if (expressionManager.resetValues) {
    expressionManager.resetValues();
  } else {
    for (const expression of getVrmExpressionNames(expressionManager)) {
      expressionManager.setValue(expression, 0);
    }
  }
  expressionManager.update?.();
}

export function getVrmExpressionNames(expressionManager: VrmExpressionManagerLike | undefined) {
  if (!expressionManager?.expressionMap) {
    return [];
  }

  return Object.keys(expressionManager.expressionMap).sort((left, right) => left.localeCompare(right));
}

export function hasBoundVrmExpression(expressionManager: VrmExpressionManagerLike | undefined, expressionName: string | null) {
  if (!expressionManager?.expressionMap || !expressionName) {
    return false;
  }

  return getExpressionBindCount(expressionManager.expressionMap[expressionName]) > 0;
}

export function getVrmExpressionDebugSummaries(expressionManager: VrmExpressionManagerLike | undefined) {
  if (!expressionManager?.expressionMap) {
    return [];
  }

  return Object.entries(expressionManager.expressionMap)
    .map(([name, expression]) => {
      const binds = getExpressionBindCount(expression);
      return `${name}(${binds})`;
    })
    .sort((left, right) => left.localeCompare(right));
}

function getExpressionBindCount(expression: unknown) {
  if (!expression) {
    return 0;
  }

  return Array.isArray((expression as { binds?: unknown }).binds) ? (expression as { binds: unknown[] }).binds.length : 0;
}
