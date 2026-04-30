import type { VisemeFrame, RmsLipSyncFrame, VrmMouthExpression } from "@/lib/speech";

export type VrmExpressionManagerLike = {
  expressionMap?: Record<string, unknown>;
  setValue(name: string, value: number): void;
  resetValues?: () => void;
  update?: () => void;
};

export type VrmMouthFrame = Pick<VisemeFrame, "vrmExpression" | "weight"> | RmsLipSyncFrame;

const vrmMouthExpressions: VrmMouthExpression[] = ["aa", "ih", "ou", "ee", "oh"];

/**
 * Candidate expression names for each VRM mouth shape, ordered by preference.
 * VRM 1.x names are tried first; VRM 0.x uppercase preset names are tried as fallbacks
 * for models where blendshape groups were not mapped to VRM 1.x standard names.
 */
const vrm0MouthExpressionCandidates: Record<VrmMouthExpression, string[]> = {
  aa: ["aa", "A"],
  ih: ["ih", "I"],
  ou: ["ou", "U"],
  ee: ["ee", "E"],
  oh: ["oh", "O"],
};

/**
 * Finds the actual expression name stored in the expression manager that corresponds
 * to the given VRM mouth expression. Returns the first candidate with bound morph
 * targets, or null if none is found.
 *
 * This handles both VRM 1.x models (expressions named "aa", "ih", etc.) and VRM 0.x
 * models where the blendshape groups may not have been mapped to standard VRM 1.x names
 * and remain stored as "A", "I", "U", "E", "O".
 */
export function resolveVrmMouthExpressionName(
  expressionManager: VrmExpressionManagerLike | undefined,
  expression: VrmMouthExpression
): string | null {
  for (const candidate of vrm0MouthExpressionCandidates[expression]) {
    if (hasBoundVrmExpression(expressionManager, candidate)) {
      return candidate;
    }
  }
  return null;
}

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
