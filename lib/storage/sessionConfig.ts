import type { BaseProviderConfig } from "@/lib/llm";
import type { AsrConfig, RealtimeVoiceConfig, TtsConfig } from "@/lib/speech";

export const SESSION_CONFIG_KEY = "liteforms.sessionConfig";

export type SessionConfig = {
  version: 1;
  llm: BaseProviderConfig;
  tts: TtsConfig;
  asr: AsrConfig;
  realtimeVoice?: RealtimeVoiceConfig;
};

export function saveSessionConfig(config: Omit<SessionConfig, "version">): void {
  try {
    localStorage.setItem(SESSION_CONFIG_KEY, JSON.stringify({ version: 1, ...config }));
  } catch {
    // localStorage may be unavailable in private browsing or when quota is exceeded.
  }
}

export function loadSessionConfig(): SessionConfig | null {
  try {
    const raw = localStorage.getItem(SESSION_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isSessionConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearSessionConfig(): void {
  try {
    localStorage.removeItem(SESSION_CONFIG_KEY);
  } catch {
    // ignore
  }
}

function hasStringProp(value: unknown, key: string): boolean {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>)[key] === "string";
}

function isSessionConfig(value: unknown): value is SessionConfig {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    hasStringProp(v.llm, "provider") &&
    hasStringProp(v.tts, "provider") &&
    hasStringProp(v.asr, "provider")
  );
}
