import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { createLlmAdapter } from "@/lib/llm/adapters";
import { LLM_PROVIDER_OPTIONS } from "@/lib/llm/providerOptions";
import type { BaseProviderConfig, LlmProviderId } from "@/lib/llm/types";
import { createAsrAdapter } from "@/lib/speech/asr";
import { createTtsAdapter } from "@/lib/speech/tts";
import {
  buildGoogleLiveSetupMessage,
  buildGoogleLiveWebSocketUrl,
  GOOGLE_LIVE_DEFAULT_VOICE
} from "@/lib/speech/googleLive";
import {
  buildOpenAiRealtimeSessionUpdateMessage,
  buildOpenAiRealtimeWebSocketProtocols,
  buildOpenAiRealtimeWebSocketUrl,
  OPENAI_REALTIME_DEFAULT_VOICE
} from "@/lib/speech/openAiRealtime";
import { STT_PROVIDER_OPTIONS, TTS_PROVIDER_OPTIONS } from "@/lib/speech/providerOptions";
import type { AsrConfig, AsrProviderId, TtsConfig, TtsProviderId } from "@/lib/speech/types";

export type SmokeProviderKind = "llm" | "tts" | "stt";

export type SmokeProviderCase =
  | {
      kind: "llm";
      provider: LlmProviderId;
      label: string;
      envNames: string[];
      config: BaseProviderConfig;
    }
  | {
      kind: "tts";
      provider: TtsProviderId;
      label: string;
      envNames: string[];
      config: TtsConfig;
    }
  | {
      kind: "stt";
      provider: AsrProviderId;
      label: string;
      envNames: string[];
      config: AsrConfig;
    };

export type SmokeProviderResult = {
  skipped: boolean;
  detail: string;
};

type EnvMap = Record<string, string | undefined>;

const SHARED_ENV_NAMES: Record<string, string[]> = {
  openai: ["OPENAI_API_KEY"],
  "openai-realtime": ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  google: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
  "google-live": ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
  xai: ["XAI_API_KEY"],
  mistral: ["MISTRAL_API_KEY"],
  cerebras: ["CEREBRAS_API_KEY"],
  nvidia: ["NVIDIA_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  groq: ["GROQ_API_KEY"],
  together: ["TOGETHER_API_KEY"],
  fireworks: ["FIREWORKS_API_KEY"],
  qwen: ["QWEN_API_KEY", "DASHSCOPE_API_KEY"],
  elevenlabs: ["ELEVENLABS_API_KEY"],
  deepgram: ["DEEPGRAM_API_KEY"],
  deepinfra: ["DEEPINFRA_API_KEY"],
  inworld: ["INWORLD_API_KEY"],
  minimax: ["MINIMAX_API_KEY"],
  gradium: ["GRADIUM_API_KEY"],
  vydra: ["VYDRA_API_KEY"],
  xiaomi: ["XIAOMI_API_KEY", "MIMO_API_KEY"],
  "azure-speech": ["AZURE_SPEECH_KEY"],
  volcengine: ["VOLCENGINE_API_KEY", "BYTEPLUS_API_KEY"]
};

const ENV_FILE_ORDER = [".env", ".env.local", ".env.test", ".env.test.local"];
const STT_SMOKE_AUDIO_FIXTURE = join(process.cwd(), "lib", "smoke", "fixtures", "smoke-test-audio.mp3");
const SMOKE_LLM_MODEL_OVERRIDES: Partial<Record<LlmProviderId, string>> = {
  anthropic: "claude-haiku-4-5-20251001",
  google: "gemini-2.5-flash",
  "google-live": "gemini-3.1-flash-live-preview"
};
const SKIPPED_LLM_PROVIDERS = new Set<LlmProviderId>([
  "browser-local-gemma",
  "browser-local-qwen",
  "openclaw",
  "ollama",
  "lmstudio",
  "claude-cli",
  "openai-codex"
]);
const SKIPPED_TTS_PROVIDERS = new Set<TtsProviderId>(["kokoro", "microsoft"]);
const SKIPPED_STT_PROVIDERS = new Set<AsrProviderId>(["distil-whisper"]);

export function loadSmokeEnv(cwd = process.cwd()): EnvMap {
  const env: EnvMap = { ...process.env };
  for (const fileName of ENV_FILE_ORDER) {
    const filePath = join(cwd, fileName);
    if (!existsSync(filePath)) continue;
    Object.assign(env, parseEnvFile(readFileSync(filePath, "utf8")));
  }
  return env;
}

export function parseEnvFile(input: string): EnvMap {
  const parsed: EnvMap = {};
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    parsed[match[1]] = normalizeEnvValue(match[2]);
  }
  return parsed;
}

export function buildSmokeProviderCases(): SmokeProviderCase[] {
  return [
    ...LLM_PROVIDER_OPTIONS
      .filter((option) => !SKIPPED_LLM_PROVIDERS.has(option.id))
      .map((option): SmokeProviderCase => ({
        kind: "llm",
        provider: option.id,
        label: option.label,
        envNames: envNamesFor("llm", option.id),
        config: {
          provider: option.id,
          model: SMOKE_LLM_MODEL_OVERRIDES[option.id] ?? option.defaultModel,
          ...(option.defaultBaseUrl ? { baseUrl: option.defaultBaseUrl } : {})
        }
      })),
    ...TTS_PROVIDER_OPTIONS
      .filter((option) => option.needsCredential && !SKIPPED_TTS_PROVIDERS.has(option.id))
      .map((option): SmokeProviderCase => ({
        kind: "tts",
        provider: option.id,
        label: option.label,
        envNames: envNamesFor("tts", option.id),
        config: {
          provider: option.id,
          ...(option.defaultBaseUrl ? { baseUrl: option.defaultBaseUrl } : {}),
          ...(option.defaultModel ? { model: option.defaultModel } : {}),
          ...(option.defaultVoice ? defaultVoiceConfig(option.id, option.defaultVoice) : {})
        } as TtsConfig
      })),
    ...STT_PROVIDER_OPTIONS
      .filter((option) => option.needsCredential && !SKIPPED_STT_PROVIDERS.has(option.id))
      .map((option): SmokeProviderCase => ({
        kind: "stt",
        provider: option.id,
        label: option.label,
        envNames: envNamesFor("stt", option.id),
        config: {
          provider: option.id,
          ...(option.defaultBaseUrl ? { baseUrl: option.defaultBaseUrl } : {}),
          ...(option.defaultModel ? { model: option.defaultModel } : {}),
          language: "en"
        } as AsrConfig
      }))
  ];
}

export function resolveSmokeCredential(testCase: SmokeProviderCase, env: EnvMap) {
  for (const envName of testCase.envNames) {
    const value = env[envName]?.trim();
    if (value) return { envName, value };
  }
  return undefined;
}

export async function runSmokeProviderCase(
  testCase: SmokeProviderCase,
  options: { env?: EnvMap; fetch?: typeof fetch; WebSocketCtor?: typeof WebSocket } = {}
): Promise<SmokeProviderResult> {
  const credential = resolveSmokeCredential(testCase, options.env ?? loadSmokeEnv());
  if (!credential) {
    return { skipped: true, detail: `missing ${testCase.envNames.join(" or ")}` };
  }

  if (testCase.kind === "llm") {
    if (testCase.provider === "google-live") {
      return runGoogleLiveSmoke(
        { ...testCase.config, provider: "google-live", credential: credential.value, voice: GOOGLE_LIVE_DEFAULT_VOICE },
        options.WebSocketCtor
      );
    }
    if (testCase.provider === "openai-realtime") {
      return runOpenAiRealtimeSmoke(
        { ...testCase.config, provider: "openai-realtime", credential: credential.value, voice: OPENAI_REALTIME_DEFAULT_VOICE },
        options.WebSocketCtor
      );
    }
    const config = { ...testCase.config, credential: credential.value };
    const text = await collectText(
      createLlmAdapter({ config, fetch: options.fetch ?? fetch }).streamText({
        config,
        messages: [{ role: "user", content: "Reply with exactly: liteforms smoke ok" }]
      })
    );
    if (!text.trim()) throw new Error(`${testCase.label} returned an empty LLM response.`);
    return { skipped: false, detail: `${credential.envName}: ${text.trim().slice(0, 80)}` };
  }

  if (testCase.kind === "tts") {
    const result = await createTtsAdapter({
      config: { ...testCase.config, credential: credential.value } as TtsConfig,
      fetch: options.fetch ?? fetch
    }).synthesize("Liteforms smoke test.");
    if (result.audio.byteLength <= 0) throw new Error(`${testCase.label} returned empty audio.`);
    return { skipped: false, detail: `${credential.envName}: ${result.mimeType}, ${result.audio.byteLength} bytes` };
  }

  const result = await createAsrAdapter({
    config: { ...testCase.config, credential: credential.value } as AsrConfig,
    fetch: options.fetch ?? fetch
  }).transcribe(loadSmokeAudioBlob());
  if (typeof result.text !== "string") throw new Error(`${testCase.label} returned a malformed STT response.`);
  if (!result.text.trim()) throw new Error(`${testCase.label} returned an empty transcript.`);
  return { skipped: false, detail: `${credential.envName}: "${result.text.trim().slice(0, 80)}"` };
}

function envNamesFor(kind: SmokeProviderKind, provider: string) {
  const normalized = provider.toUpperCase().replace(/-/g, "_");
  return [
    `LITEFORMS_${kind.toUpperCase()}_${normalized}_API_KEY`,
    `LITEFORMS_${normalized}_API_KEY`,
    ...(SHARED_ENV_NAMES[provider] ?? [`${normalized}_API_KEY`])
  ];
}

function defaultVoiceConfig(provider: TtsProviderId, defaultVoice: string) {
  return provider === "elevenlabs" ? { voiceId: defaultVoice } : { voice: defaultVoice };
}

function normalizeEnvValue(value: string) {
  let normalized = value.trim();
  const hashIndex = normalized.search(/\s+#/);
  if (hashIndex >= 0) normalized = normalized.slice(0, hashIndex).trimEnd();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1);
  }
  return normalized;
}

async function collectText(source: AsyncIterable<string>) {
  let output = "";
  for await (const chunk of source) {
    output += chunk;
    if (output.trim().length > 0) break;
  }
  return output;
}

async function runGoogleLiveSmoke(
  config: Omit<BaseProviderConfig, "provider"> & { provider: "google-live"; voice: string },
  WebSocketCtor: typeof WebSocket = WebSocket
): Promise<SmokeProviderResult> {
  if (!WebSocketCtor) throw new Error("Google Live smoke test requires a WebSocket implementation.");

  await new Promise<void>((resolve, reject) => {
    const googleLiveConfig = {
      provider: "google-live" as const,
      credential: config.credential,
      model: config.model,
      voice: config.voice,
      websocketUrl: config.baseUrl
    };
    const socket = new WebSocketCtor(buildGoogleLiveWebSocketUrl(googleLiveConfig));
    let settled = false;
    const receivedMessages: string[] = [];
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`Google Live smoke test timed out. Received: ${receivedMessages.join(" | ") || "no messages"}`));
    }, 30000);

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.close();
      if (error) reject(error);
      else resolve();
    };

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify(buildGoogleLiveSetupMessage(googleLiveConfig)));
    });
    socket.addEventListener("message", (event) => {
      void readWebSocketMessageText(event.data)
        .then((text) => {
          receivedMessages.push(text.slice(0, 300));
          const payload = JSON.parse(text) as {
            setupComplete?: unknown;
            setup_complete?: unknown;
            error?: { message?: string };
            serverContent?: { outputTranscription?: { text?: string }; modelTurn?: { parts?: unknown[] } };
            server_content?: { output_transcription?: { text?: string }; model_turn?: { parts?: unknown[] } };
          };
          if (payload.error?.message) finish(new Error(payload.error.message));
          if (payload.setupComplete || payload.setup_complete) {
            socket.send(JSON.stringify({
              clientContent: {
                turns: [{ role: "user", parts: [{ text: "Reply with the word OK." }] }],
                turnComplete: true
              }
            }));
          }
          const outputTranscription = payload.serverContent?.outputTranscription ?? payload.server_content?.output_transcription;
          const modelTurn = payload.serverContent?.modelTurn ?? payload.server_content?.model_turn;
          if (outputTranscription?.text || modelTurn?.parts?.length) {
            finish();
          }
        })
        .catch((error) => finish(error instanceof Error ? error : new Error(String(error))));
    });
    socket.addEventListener("error", () => finish(new Error("Google Live WebSocket failed.")));
  });

  return { skipped: false, detail: "Google Live WebSocket returned realtime content." };
}

async function runOpenAiRealtimeSmoke(
  config: Omit<BaseProviderConfig, "provider"> & { provider: "openai-realtime"; voice: string },
  WebSocketCtor: typeof WebSocket = WebSocket
): Promise<SmokeProviderResult> {
  if (!WebSocketCtor) throw new Error("OpenAI Realtime smoke test requires a WebSocket implementation.");

  await new Promise<void>((resolve, reject) => {
    const realtimeConfig = {
      provider: "openai-realtime" as const,
      credential: config.credential,
      model: config.model,
      voice: config.voice,
      websocketUrl: config.baseUrl
    };
    const socket = new WebSocketCtor(
      buildOpenAiRealtimeWebSocketUrl(realtimeConfig),
      buildOpenAiRealtimeWebSocketProtocols(realtimeConfig)
    );
    let settled = false;
    const receivedMessages: string[] = [];
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`OpenAI Realtime smoke test timed out. Received: ${receivedMessages.join(" | ") || "no messages"}`));
    }, 30000);

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.close();
      if (error) reject(error);
      else resolve();
    };

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify(buildOpenAiRealtimeSessionUpdateMessage({
        ...realtimeConfig,
        instructions: "Reply with exactly the word OK."
      })));
      socket.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Reply with exactly the word OK." }]
        }
      }));
      socket.send(JSON.stringify({
        type: "response.create",
        response: { output_modalities: ["audio"] }
      }));
    });
    socket.addEventListener("message", (event) => {
      void readWebSocketMessageText(event.data)
        .then((text) => {
          receivedMessages.push(text.slice(0, 300));
          const payload = JSON.parse(text) as {
            type?: string;
            delta?: string;
            transcript?: string;
            error?: { message?: string };
          };
          if (payload.type === "error") finish(new Error(payload.error?.message ?? "OpenAI Realtime WebSocket failed."));
          if (
            (payload.type === "response.output_audio.delta" || payload.type === "response.audio.delta") ||
            ((payload.type === "response.output_audio_transcript.delta" || payload.type === "response.audio_transcript.delta") && payload.delta) ||
            ((payload.type === "response.output_audio_transcript.done" || payload.type === "response.audio_transcript.done") && payload.transcript)
          ) {
            finish();
          }
        })
        .catch((error) => finish(error instanceof Error ? error : new Error(String(error))));
    });
    socket.addEventListener("error", () => finish(new Error("OpenAI Realtime WebSocket failed.")));
  });

  return { skipped: false, detail: "OpenAI Realtime WebSocket returned realtime content." };
}

async function readWebSocketMessageText(data: unknown) {
  if (typeof data === "string") return data;
  if (data instanceof Blob) return data.text();
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  return String(data);
}

function loadSmokeAudioBlob() {
  if (!existsSync(STT_SMOKE_AUDIO_FIXTURE)) {
    throw new Error(`Missing STT smoke audio fixture: ${STT_SMOKE_AUDIO_FIXTURE}`);
  }
  return new Blob([new Uint8Array(readFileSync(STT_SMOKE_AUDIO_FIXTURE))], { type: "audio/mpeg" });
}
