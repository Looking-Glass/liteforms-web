export const CHARACTER_CONFIG_KEY = "liteforms.characterConfig";

type Pronouns = "HE" | "SHE" | "THEY";

export type CharacterConfigStore = {
  version: 1;
  name: string;
  pronouns: Pronouns;
  personality: string;
  greeting: string;
};

export function saveCharacterConfig(config: Omit<CharacterConfigStore, "version">): void {
  try {
    localStorage.setItem(CHARACTER_CONFIG_KEY, JSON.stringify({ version: 1, ...config }));
  } catch {
    // localStorage may be unavailable in private browsing or when quota is exceeded.
  }
}

export function loadCharacterConfig(): CharacterConfigStore | null {
  try {
    const raw = localStorage.getItem(CHARACTER_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isCharacterConfigStore(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearCharacterConfig(): void {
  try {
    localStorage.removeItem(CHARACTER_CONFIG_KEY);
  } catch {
    // ignore
  }
}

const VALID_PRONOUNS = new Set<string>(["HE", "SHE", "THEY"]);

function isCharacterConfigStore(value: unknown): value is CharacterConfigStore {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    typeof v.name === "string" &&
    typeof v.pronouns === "string" &&
    VALID_PRONOUNS.has(v.pronouns) &&
    typeof v.personality === "string" &&
    typeof v.greeting === "string"
  );
}
