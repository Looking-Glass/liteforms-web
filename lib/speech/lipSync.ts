import type { WordTiming } from "./types";

export type VisemeGroup = "Silence" | "A" | "E" | "U" | "O" | "S";
export type VrmMouthExpression = "aa" | "ih" | "ou" | "ee" | "oh";

export type VisemeFrame = {
  target: string;
  group: VisemeGroup;
  vrmExpression: VrmMouthExpression | null;
  start: number;
  end: number;
  weight: number;
};

export type RmsLipSyncFrame = {
  target: "viseme_aa";
  group: "A";
  vrmExpression: "aa";
  weight: number;
  preferMorphTarget?: boolean;
};

const leadingPhonemeTargets: Array<[RegExp, string]> = [
  [/^[bmp]/i, "viseme_PP"],
  [/^[fv]/i, "viseme_FF"],
  [/^th/i, "viseme_TH"],
  [/^[dt]/i, "viseme_DD"],
  [/^[kgcq]/i, "viseme_kk"],
  [/^ch|^j|^sh/i, "viseme_CH"],
  [/^[sz]/i, "viseme_SS"],
  [/^[nr]/i, "viseme_nn"],
  [/^[ae]/i, "viseme_E"],
  [/^[iy]/i, "viseme_I"],
  [/^[ou]/i, "viseme_O"]
];

export function mapWordTimingsToVisemes(words: WordTiming[]): VisemeFrame[] {
  return words.map((word) => {
    const group = inferVisemeGroup(word.word);

    return {
      target: inferRpmVisemeTarget(word.word),
      group,
      vrmExpression: mapVisemeGroupToVrmExpression(group),
      start: word.start,
      end: word.end,
      weight: 1
    };
  });
}

export function createRmsLipSyncFrame(rms: number, options: { maxWeight?: number; preferMorphTarget?: boolean } = {}): RmsLipSyncFrame {
  return {
    target: "viseme_aa",
    group: "A",
    vrmExpression: "aa",
    weight: clamp(rms, 0, options.maxWeight ?? 1),
    ...(options.preferMorphTarget ? { preferMorphTarget: true } : {})
  };
}

export function inferRpmVisemeTarget(word: string) {
  const normalized = word.trim().toLowerCase();
  for (const [pattern, target] of leadingPhonemeTargets) {
    if (pattern.test(normalized)) {
      return target;
    }
  }
  return "viseme_aa";
}

export function inferVisemeGroup(word: string): VisemeGroup {
  const normalized = word.trim().toLowerCase();

  if (!normalized) {
    return "Silence";
  }
  if (/^s|^z|^sh|^ch|^j/i.test(normalized)) {
    return "S";
  }
  if (/^[eiy]/i.test(normalized)) {
    return "E";
  }
  if (/^[u]/i.test(normalized)) {
    return "U";
  }
  if (/^[o]/i.test(normalized)) {
    return "O";
  }
  return "A";
}

export function mapVisemeGroupToVrmExpression(group: VisemeGroup): VrmMouthExpression | null {
  switch (group) {
    case "A":
      return "aa";
    case "E":
      return "ee";
    case "U":
      return "ou";
    case "O":
      return "oh";
    case "S":
      return "ih";
    case "Silence":
      return null;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
