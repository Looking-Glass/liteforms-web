"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createLlmAdapter, getDefaultProviderConfig, getProviderLabel, normalizeProviderConfig } from "@/lib/llm";
import { sanitizeAssistantText } from "@/lib/llm/output";
import { LocalGemmaWorkerClient } from "@/lib/llm/localGemmaWorker";
import type { BaseProviderConfig, ChatMessage, LlmProviderId } from "@/lib/llm";
import {
  createAsrAdapter,
  createTtsAdapter,
  getAsrProviderLabel,
  getTtsProviderLabel,
  normalizeAsrConfig,
  normalizeTtsConfig,
  playTtsResult,
  splitSpeakableText
} from "@/lib/speech";
import { DistilWhisperWorkerClient, KokoroWorkerClient } from "@/lib/speech/workerClient";
import type { AsrConfig, AsrProviderId, TtsConfig, TtsProviderId } from "@/lib/speech";
import { dispatchAvatarLipSyncFrame } from "@/lib/avatar/lipSyncEvents";
import {
  formatBytes,
  formatCacheUsage,
  isModelCacheName,
  updateEndpointMode
} from "./chatPanelUtils";
import type { CacheUsage } from "./chatPanelUtils";

export type CharacterConfig = {
  name: string;
  pronouns: "HE" | "SHE" | "THEY";
  personality: string;
  greeting: string;
};

type ChatPanelProps = {
  character: CharacterConfig;
  onCharacterChange: (character: CharacterConfig) => void;
  onModelUrlChange: (url: string) => void;
  shouldPreloadLocalModels?: boolean;
  preloadSessionId?: number;
  initialLlmConfig?: BaseProviderConfig;
  initialTtsConfig?: TtsConfig;
  initialAsrConfig?: AsrConfig;
  onLocalModelLoadStateChange?: (state: LocalModelLoadState[]) => void;
};

type ChatStatus = "idle" | "streaming" | "error";
type SpeechStatus = "idle" | "speaking" | "listening" | "transcribing" | "testing" | "error";
export type LocalModelId = "gemma" | "kokoro" | "distil-whisper";
export type LocalModelLoadState = {
  id: LocalModelId;
  label: string;
  status: "idle" | "loading" | "ready" | "error";
  progress: number;
  message: string;
};

const localModelStorageKey = "liteforms.localModels";
export const initialLocalModelLoadState: LocalModelLoadState[] = [
  { id: "gemma", label: "Gemma 4 E2B q8", status: "idle", progress: 0, message: "Waiting" },
  { id: "kokoro", label: "Kokoro", status: "idle", progress: 0, message: "Waiting" },
  { id: "distil-whisper", label: "Distil-Whisper", status: "idle", progress: 0, message: "Waiting" }
];

// Module-level guard for preload start. Survives across all ChatPanel instances
// (including remounts triggered by chatPanelKey changes in the parent and
// StrictMode dev double-invokes). Keyed by `preloadSessionId` so each distinct
// session can preload exactly once.
const preloadStartedSessions = new Set<number>();

const providerOptions: { id: LlmProviderId; label: string; defaultModel: string; defaultBaseUrl?: string }[] = [
  {
    id: "browser-local-gemma",
    label: "Browser local",
    defaultModel: "onnx-community/gemma-4-E2B-it-ONNX"
  },
  { id: "openai", label: "OpenAI API", defaultModel: "gpt-4.1-mini", defaultBaseUrl: "https://api.openai.com/v1" },
  {
    id: "chatgpt-subscription",
    label: "ChatGPT connector",
    defaultModel: "gpt-5.4",
    defaultBaseUrl: "http://127.0.0.1:1455"
  },
  {
    id: "anthropic",
    label: "Anthropic API",
    defaultModel: "claude-3-5-sonnet-latest",
    defaultBaseUrl: "https://api.anthropic.com"
  },
  {
    id: "claude-subscription",
    label: "Claude connector",
    defaultModel: "claude-code",
    defaultBaseUrl: "http://127.0.0.1:1456"
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultModel: "openai/gpt-4.1-mini",
    defaultBaseUrl: "https://openrouter.ai/api/v1"
  },
  { id: "ollama", label: "Ollama", defaultModel: "llama3.2", defaultBaseUrl: "http://localhost:11434" },
  { id: "lmstudio", label: "LM Studio", defaultModel: "local-model", defaultBaseUrl: "http://localhost:1234/v1" },
  { id: "openclaw", label: "OpenClaw Gateway", defaultModel: "default", defaultBaseUrl: "ws://127.0.0.1:18789" }
];

export function ChatPanel({
  character,
  onCharacterChange,
  onModelUrlChange,
  shouldPreloadLocalModels = false,
  preloadSessionId = 0,
  initialLlmConfig,
  initialTtsConfig,
  initialAsrConfig,
  onLocalModelLoadStateChange
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: character.greeting }]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [speechStatus, setSpeechStatus] = useState<SpeechStatus>("idle");
  const [error, setError] = useState("");
  const [speechError, setSpeechError] = useState("");
  const [lastTtsDebug, setLastTtsDebug] = useState("");
  const [lastAsrDebug, setLastAsrDebug] = useState("");
  const [transcript, setTranscript] = useState("");
  const [config, setConfig] = useState<BaseProviderConfig>(initialLlmConfig ?? getDefaultProviderConfig());
  const [ttsConfig, setTtsConfig] = useState<TtsConfig>(initialTtsConfig ?? { provider: "kokoro" });
  const [asrConfig, setAsrConfig] = useState<AsrConfig>(initialAsrConfig ?? { provider: "distil-whisper" });
  const [localModelLoadState, setLocalModelLoadState] = useState<LocalModelLoadState[]>(initialLocalModelLoadState);
  const [cacheUsage, setCacheUsage] = useState<CacheUsage>({
    status: "Checking cache",
    bytes: 0,
    fileCount: 0,
    unknownCount: 0
  });
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [vrmFileName, setVrmFileName] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const lastAudioRef = useRef<Blob | null>(null);
  const composerFormRef = useRef<HTMLFormElement>(null);
  const localGemmaWorkerRef = useRef(new LocalGemmaWorkerClient());
  const kokoroWorkerRef = useRef(new KokoroWorkerClient());
  const distilWhisperWorkerRef = useRef(new DistilWhisperWorkerClient());
  const vrmInputRef = useRef<HTMLInputElement>(null);
  const preloadCancelledRef = useRef(false);

  const providerMeta = useMemo(
    () => providerOptions.find((provider) => provider.id === config.provider) ?? providerOptions[0],
    [config.provider]
  );
  const localModelProgress = useMemo(
    () => Math.round(localModelLoadState.reduce((sum, model) => sum + model.progress, 0) / localModelLoadState.length),
    [localModelLoadState]
  );
  const isOpenClaw = config.provider === "openclaw";

  useEffect(() => {
    let cancelled = false;
    getModelCacheUsage().then((usage) => {
      if (!cancelled) setCacheUsage(usage);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    onLocalModelLoadStateChange?.(localModelLoadState);
  }, [localModelLoadState, onLocalModelLoadStateChange]);

  useEffect(() => {
    if (!shouldPreloadLocalModels) return;

    // Un-cancel any in-progress preload so its worker callbacks can continue
    // updating state. This handles cleanup→re-invoke cycles where cleanup sets
    // cancelled=true while the download is still running.
    preloadCancelledRef.current = false;

    // Prevent starting a second download if one is already underway for this
    // session. The guard lives at module scope so it survives across:
    //   1. StrictMode's dev mount→unmount→mount double-invoke (same instance)
    //   2. Remounts triggered by `chatPanelKey` changes in the parent (new instance)
    // Per-instance refs alone cannot cover case (2) because new instances start
    // with fresh refs.
    if (preloadStartedSessions.has(preloadSessionId)) return;
    preloadStartedSessions.add(preloadSessionId);

    const updateLocalModel = (id: LocalModelId, patch: Partial<LocalModelLoadState>) => {
      if (preloadCancelledRef.current) return;
      setLocalModelLoadState((models) => models.map((model) => (model.id === id ? { ...model, ...patch } : model)));
    };

    async function preloadLocalModel(id: LocalModelId, preload: () => Promise<void> | undefined) {
      try {
        await preload();
        updateLocalModel(id, { status: "ready", progress: 100, message: "Ready" });
      } catch (caught) {
        const label = initialLocalModelLoadState.find((model) => model.id === id)?.label ?? "Local model";
        updateLocalModel(id, {
          status: "error",
          progress: 0,
          message: caught instanceof Error ? caught.message : `${label} failed to load`
        });
      }
    }

    const normalizedTtsConfig = normalizeTtsConfig(ttsConfig);
    const normalizedAsrConfig = normalizeAsrConfig(asrConfig);
    const llmProvider = config.provider;
    const wantGemma = llmProvider === "browser-local-gemma";
    const wantKokoro = normalizedTtsConfig.provider === "kokoro";
    const wantDistilWhisper = normalizedAsrConfig.provider === "distil-whisper";

    async function runPreload() {
      // Each branch marks unselected models as "ready / Not used" so the onboarding loading
      // screen's Continue button can enable for any combination, including all-cloud configs.
      if (wantGemma) {
        await preloadLocalModel("gemma", () =>
          localGemmaWorkerRef.current.preload?.({ model: providerOptions[0].defaultModel }, (progress) =>
            updateLocalModel("gemma", {
              status: progress.status,
              progress: progress.progress,
              message: progress.message ?? "Loading Gemma"
            })
          )
        );
      } else {
        updateLocalModel("gemma", { status: "ready", progress: 100, message: "Not used" });
      }
      if (wantKokoro) {
        await preloadLocalModel("kokoro", () =>
          kokoroWorkerRef.current.preload?.(normalizedTtsConfig, (progress) =>
            updateLocalModel("kokoro", {
              status: progress.status,
              progress: progress.progress,
              message: progress.message ?? "Loading Kokoro"
            })
          )
        );
      } else {
        updateLocalModel("kokoro", { status: "ready", progress: 100, message: "Not used" });
      }
      if (wantDistilWhisper) {
        await preloadLocalModel("distil-whisper", () =>
          distilWhisperWorkerRef.current.preload?.(normalizedAsrConfig, (progress) =>
            updateLocalModel("distil-whisper", {
              status: progress.status,
              progress: progress.progress,
              message: progress.message ?? "Loading Distil-Whisper"
            })
          )
        );
      } else {
        updateLocalModel("distil-whisper", { status: "ready", progress: 100, message: "Not used" });
      }
      if (!preloadCancelledRef.current) {
        persistLocalModelMetadata();
        const usage = await getModelCacheUsage();
        if (!preloadCancelledRef.current) setCacheUsage(usage);
      }
    }

    void runPreload();
    return () => {
      preloadCancelledRef.current = true;
      // The module-level `preloadStartedSessions` is intentionally NOT cleared here.
      // On StrictMode re-invoke (same instance), the next setup will see the session
      // is already started, skip the double-start, and un-cancel preloadCancelledRef
      // so the in-progress download can keep updating state. On a true remount
      // (different chatPanelKey → new preloadSessionId), the new instance gets a
      // brand-new entry in the Set the first time its effect fires.
    };
  }, [shouldPreloadLocalModels, preloadSessionId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const content = String(formData.get("message") ?? "").trim();
    if (!content || status === "streaming") {
      return;
    }

    form.reset();
    setError("");
    setStatus("streaming");

    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);

    try {
      const normalizedConfig = normalizeProviderConfig(config);
      const adapter = createLlmAdapter({ config: normalizedConfig, localGemmaWorker: localGemmaWorkerRef.current });
      let responseText = "";

      for await (const chunk of adapter.streamText({
        config: normalizedConfig,
        persona: {
          name: character.name,
          pronouns: character.pronouns,
          personality: character.personality
        },
        messages: nextMessages
      })) {
        responseText += chunk;
        setMessages([...nextMessages, { role: "assistant", content: sanitizeAssistantText(responseText) }]);
      }
      const assistantText = sanitizeAssistantText(responseText);
      setMessages([...nextMessages, { role: "assistant", content: assistantText }]);
      setStatus("idle");
      void speakAssistantResponse(assistantText);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Provider request failed.";
      setError(message);
      setMessages(nextMessages);
      setStatus("error");
    }
  }

  async function speakAssistantResponse(text: string) {
    const chunks = splitSpeakableText(text);
    const speakableChunks = chunks.remainder ? [...chunks.chunks, chunks.remainder] : chunks.chunks;
    if (speakableChunks.length === 0) {
      return;
    }
    setSpeechError("");
    setSpeechStatus("speaking");
    try {
      const adapter = createTtsAdapter({ config: ttsConfig, worker: kokoroWorkerRef.current });
      for (const chunk of speakableChunks) {
        setLastTtsDebug(`TTS: "${chunk}"`);
        const audio = await adapter.synthesize(chunk);
        await playTtsResult(audio, { onLipSyncFrame: dispatchAvatarLipSyncFrame });
      }
      setSpeechStatus("idle");
    } catch (caught) {
      setSpeechError(caught instanceof Error ? caught.message : "Speech playback failed.");
      setSpeechStatus("error");
    }
  }

  async function testTtsProvider() {
    setSpeechError("");
    setSpeechStatus("testing");
    try {
      const adapter = createTtsAdapter({ config: ttsConfig, worker: kokoroWorkerRef.current });
      const testText = "Liteforms voice test.";
      setLastTtsDebug(`TTS: "${testText}"`);
      const audio = await adapter.synthesize(testText);
      await playTtsResult(audio, { onLipSyncFrame: dispatchAvatarLipSyncFrame });
      setSpeechStatus("idle");
    } catch (caught) {
      setSpeechError(caught instanceof Error ? caught.message : "TTS test failed.");
      setSpeechStatus("error");
    }
  }

  async function testAsrProvider() {
    if (!lastAudioRef.current) {
      setSpeechError("Record microphone audio before testing transcription.");
      setSpeechStatus("error");
      return;
    }
    setSpeechError("");
    setLastAsrDebug(`STT: transcribing ${formatBytes(lastAudioRef.current.size)} ${lastAudioRef.current.type || "audio"}`);
    setSpeechStatus("transcribing");
    await transcribeRecordedAudio(lastAudioRef.current);
  }

  async function startMicRecording() {
    setSpeechError("");
    setLastAsrDebug("STT: recording...");
    setTranscript("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      });
      recorder.addEventListener("stop", () => {
        stream.getTracks().forEach((track) => track.stop());
        const audio = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        lastAudioRef.current = audio;
        setLastAsrDebug(`STT: transcribing ${formatBytes(audio.size)} ${audio.type || "audio"}`);
        void transcribeRecordedAudio(audio, { autoSubmit: true });
      });
      recorderRef.current = recorder;
      recorder.start();
      setSpeechStatus("listening");
    } catch (caught) {
      setSpeechError(caught instanceof Error ? caught.message : "Microphone access failed.");
      setSpeechStatus("error");
    }
  }

  function stopMicRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
      setSpeechStatus("transcribing");
    }
  }

  async function transcribeRecordedAudio(audio: Blob, { autoSubmit = false }: { autoSubmit?: boolean } = {}) {
    try {
      const adapter = createAsrAdapter({ config: asrConfig, worker: distilWhisperWorkerRef.current });
      const result = await adapter.transcribe(audio);
      const text = result.text.trim();
      setLastAsrDebug(text ? `STT: "${text}"` : "STT: finished with no transcript");
      setSpeechStatus("idle");
      if (autoSubmit && text) {
        const input = document.getElementById("message") as HTMLInputElement | null;
        if (input) {
          input.value = text;
        }
        composerFormRef.current?.requestSubmit();
      } else {
        setTranscript(text);
      }
    } catch (caught) {
      setSpeechError(caught instanceof Error ? caught.message : "Transcription failed.");
      setSpeechStatus("error");
    }
  }

  async function clearModelCache() {
    setIsClearingCache(true);
    setCacheUsage({ status: "Clearing cache", bytes: 0, fileCount: 0, unknownCount: 0 });
    const usage = await deleteModelCaches();
    setCacheUsage(usage);
    setLocalModelLoadState(initialLocalModelLoadState);
    setIsClearingCache(false);
  }

  function useTranscript() {
    const input = document.getElementById("message") as HTMLInputElement | null;
    if (input) {
      input.value = transcript;
      input.focus();
    }
  }

  function updateProvider(providerId: LlmProviderId) {
    const option = providerOptions.find((provider) => provider.id === providerId) ?? providerOptions[0];
    setConfig({
      provider: option.id,
      model: option.defaultModel,
      baseUrl: option.defaultBaseUrl,
      endpointMode: updateEndpointMode(option.id)
    });
  }

  function updateTtsProvider(providerId: TtsProviderId) {
    if (providerId === "kokoro") {
      setTtsConfig({ provider: "kokoro" });
      return;
    }
    if (providerId === "elevenlabs") {
      setTtsConfig({ provider: "elevenlabs", voiceId: "Rachel" });
      return;
    }
    setTtsConfig({ provider: "deepgram", voice: "aura-asteria-en", model: "aura-asteria-en" });
  }

  function updateAsrProvider(providerId: AsrProviderId) {
    if (providerId === "distil-whisper") {
      setAsrConfig({ provider: "distil-whisper" });
      return;
    }
    if (providerId === "deepgram") {
      setAsrConfig({ provider: "deepgram" });
      return;
    }
    setAsrConfig({ provider: "elevenlabs" });
  }

  function handleVrmLoad(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setVrmFileName(file.name);
    onModelUrlChange(url);
    event.target.value = "";
  }

  return (
    <aside className="chat-panel" aria-label="Chat">

      {/* ── Character section (open by default) ── */}
      <details className="panel-section" open>
        <summary>Character</summary>
        <div className="panel-section-body">
          {isOpenClaw ? (
            <p className="openclaw-note">
              Character identity is managed by OpenClaw&apos;s soul system. Switch to a different provider to define a
              custom persona here.
            </p>
          ) : (
            <div className="character-settings">
              <label>
                Name
                <input
                  value={character.name}
                  onChange={(e) => onCharacterChange({ ...character, name: e.target.value })}
                  maxLength={80}
                  placeholder="Character name"
                />
              </label>
              <label>
                Pronouns
                <select
                  value={character.pronouns}
                  onChange={(e) =>
                    onCharacterChange({ ...character, pronouns: e.target.value as CharacterConfig["pronouns"] })
                  }
                >
                  <option value="HE">He / Him</option>
                  <option value="SHE">She / Her</option>
                  <option value="THEY">They / Them</option>
                </select>
              </label>
              <label>
                Personality
                <textarea
                  value={character.personality}
                  onChange={(e) => onCharacterChange({ ...character, personality: e.target.value })}
                  rows={4}
                  maxLength={4000}
                  placeholder="Describe the character's personality and role..."
                />
              </label>
            </div>
          )}

          {/* Advanced: VRM load */}
          <details className="advanced-section">
            <summary>Advanced</summary>
            <div className="advanced-body">
              <input ref={vrmInputRef} type="file" accept=".vrm" className="sr-only" onChange={handleVrmLoad} />
              <div className="vrm-row">
                <button type="button" className="btn-ghost" onClick={() => vrmInputRef.current?.click()}>
                  Load VRM
                </button>
                <span className="vrm-filename">{vrmFileName || "Default (lobster)"}</span>
              </div>
            </div>
          </details>
        </div>
      </details>

      {/* ── Settings section (collapsed by default) ── */}
      <details className="panel-section">
        <summary>Settings</summary>
        <div className="panel-section-body">

          {/* Provider */}
          <div className="model-settings">
            <label>
              Model provider
              <select value={config.provider} onChange={(event) => updateProvider(event.target.value as LlmProviderId)}>
                {providerOptions.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </label>
            {["openai", "chatgpt-subscription", "anthropic", "claude-subscription", "openrouter", "openclaw"].includes(
              config.provider
            ) ? (
              <label>
                API key
                <input
                  type="password"
                  value={config.credential ?? ""}
                  onChange={(event) => setConfig({ ...config, credential: event.target.value })}
                  placeholder="Stored in browser only"
                />
              </label>
            ) : null}
          </div>

          {/* Voice */}
          <div className="speech-settings">
            <div className="speech-grid">
              <label>
                Voice
                <select
                  value={ttsConfig.provider}
                  onChange={(event) => updateTtsProvider(event.target.value as TtsProviderId)}
                >
                  <option value="kokoro">Kokoro (local)</option>
                  <option value="elevenlabs">ElevenLabs</option>
                  <option value="deepgram">Deepgram</option>
                </select>
              </label>
              <label>
                Mic input
                <select
                  value={asrConfig.provider}
                  onChange={(event) => updateAsrProvider(event.target.value as AsrProviderId)}
                >
                  <option value="distil-whisper">Whisper (local)</option>
                  <option value="deepgram">Deepgram</option>
                  <option value="elevenlabs">ElevenLabs</option>
                </select>
              </label>
            </div>
            {ttsConfig.provider !== "kokoro" ? (
              <label>
                Voice API key
                <input
                  type="password"
                  value={"credential" in ttsConfig ? ttsConfig.credential ?? "" : ""}
                  onChange={(event) => setTtsConfig({ ...ttsConfig, credential: event.target.value } as TtsConfig)}
                  placeholder="Stored in browser only"
                />
              </label>
            ) : null}
            {asrConfig.provider !== "distil-whisper" ? (
              <label>
                Transcription API key
                <input
                  type="password"
                  value={"credential" in asrConfig ? asrConfig.credential ?? "" : ""}
                  onChange={(event) => setAsrConfig({ ...asrConfig, credential: event.target.value } as AsrConfig)}
                  placeholder="Stored in browser only"
                />
              </label>
            ) : null}
          </div>

          {/* Advanced: model name, endpoint, local model status, cache, test buttons */}
          <details className="advanced-section">
            <summary>Advanced</summary>
            <div className="advanced-body">
              <div className="model-settings">
                <label>
                  Model
                  <input value={config.model} onChange={(event) => setConfig({ ...config, model: event.target.value })} />
                </label>
                {config.provider !== "browser-local-gemma" ? (
                  <label>
                    Endpoint
                    <input
                      value={config.baseUrl ?? providerMeta.defaultBaseUrl ?? ""}
                      onChange={(event) => setConfig({ ...config, baseUrl: event.target.value })}
                    />
                  </label>
                ) : null}
                {isOpenClaw ? (
                  <label className="inline-toggle">
                    <input
                      type="checkbox"
                      checked={config.injectLiteformsPersona === true}
                      onChange={(event) => setConfig({ ...config, injectLiteformsPersona: event.target.checked })}
                    />
                    Inject Liteforms persona
                  </label>
                ) : null}
                {ttsConfig.provider === "elevenlabs" ? (
                  <label>
                    ElevenLabs voice ID
                    <input
                      value={ttsConfig.voiceId ?? "Rachel"}
                      onChange={(event) => setTtsConfig({ ...ttsConfig, voiceId: event.target.value })}
                    />
                  </label>
                ) : null}
                {ttsConfig.provider === "deepgram" ? (
                  <label>
                    Deepgram voice model
                    <input
                      value={ttsConfig.voice ?? ttsConfig.model ?? "aura-asteria-en"}
                      onChange={(event) =>
                        setTtsConfig({ ...ttsConfig, voice: event.target.value, model: event.target.value })
                      }
                    />
                  </label>
                ) : null}
              </div>

              <div className="local-model-progress">
                <div className="cache-row">
                  <span>Local models</span>
                  <span>{localModelProgress}%</span>
                </div>
                <progress value={localModelProgress} max={100} />
                <div className="local-model-list">
                  {localModelLoadState.map((model) => (
                    <div className="local-model-row" key={model.id}>
                      <span>{model.label}</span>
                      <span className={`local-model-status ${model.status}`}>{model.message}</span>
                    </div>
                  ))}
                </div>
                <div className="cache-row">
                  <span>Cache</span>
                  <span className="cache-actions">
                    {formatCacheUsage(cacheUsage)}
                    <button type="button" onClick={clearModelCache} disabled={isClearingCache || cacheUsage.fileCount === 0}>
                      {isClearingCache ? "Clearing…" : "Clear"}
                    </button>
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ flex: 1, justifyContent: "center" }}
                  onClick={testTtsProvider}
                  disabled={speechStatus === "testing" || speechStatus === "speaking"}
                >
                  Test voice
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ flex: 1, justifyContent: "center" }}
                  onClick={testAsrProvider}
                  disabled={speechStatus === "listening"}
                >
                  Test STT
                </button>
              </div>

              {lastTtsDebug ? <p className="provider-note">{lastTtsDebug}</p> : null}
              {lastAsrDebug ? <p className="provider-note">{lastAsrDebug}</p> : null}
              <p className="provider-note">All requests made directly from this browser.</p>
            </div>
          </details>
        </div>
      </details>

      {/* ── Chat ── */}
      <div className="message-list">
        {messages.map((message, index) => (
          <div className={`message ${message.role}`} key={`${message.role}-${index}`}>
            <span>{message.content || (status === "streaming" && index === messages.length - 1 ? "…" : "")}</span>
          </div>
        ))}
      </div>
      {transcript ? (
        <div style={{ padding: "0 20px 8px" }}>
          <div className="transcript-box">
            <span>{transcript}</span>
            <button type="button" onClick={useTranscript}>Use</button>
          </div>
        </div>
      ) : null}
      {error ? <p className="chat-error">{error}</p> : null}
      {speechError ? <p className="chat-error">{speechError}</p> : null}
      <form ref={composerFormRef} className="composer" onSubmit={onSubmit}>
        <button
          type="button"
          className={`mic-btn${speechStatus === "listening" ? " listening" : ""}`}
          aria-label={speechStatus === "listening" ? "Release to send" : "Hold to talk"}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); void startMicRecording(); }}
          onPointerUp={() => stopMicRecording()}
          onPointerLeave={() => { if (speechStatus === "listening") stopMicRecording(); }}
          disabled={speechStatus === "transcribing" || speechStatus === "testing" || speechStatus === "speaking"}
        >
          {speechStatus === "listening" ? "◉" : "🎙"}
        </button>
        <label className="sr-only" htmlFor="message">Message</label>
        <input id="message" name="message" placeholder="Type a message…" disabled={status === "streaming"} />
        <button type="submit" className="send-btn" disabled={status === "streaming"}>
          {status === "streaming" ? "…" : "Send"}
        </button>
      </form>
    </aside>
  );
}

function persistLocalModelMetadata() {
  try {
    localStorage.setItem(
      localModelStorageKey,
      JSON.stringify({
        version: 1,
        storedAt: new Date().toISOString(),
        models: [
          { id: "gemma", model: providerOptions[0].defaultModel, dtype: "q4f16", device: "webgpu" },
          { id: "kokoro", model: "onnx-community/Kokoro-82M-v1.0-ONNX", dtype: "fp32", device: "webgpu" },
          { id: "distil-whisper", model: "onnx-community/distil-small.en", dtype: "q4", device: "webgpu" }
        ]
      })
    );
  } catch {
    // localStorage can be disabled in private browsing or hardened contexts.
  }
}

async function getModelCacheUsage(): Promise<CacheUsage> {
  if (typeof caches === "undefined") {
    return { status: "Browser cache unavailable", bytes: 0, fileCount: 0, unknownCount: 0 };
  }

  try {
    const cacheNames = (await caches.keys()).filter((name) => name.includes("transformers") || name.includes("liteforms"));
    let bytes = 0;
    let fileCount = 0;
    let unknownCount = 0;

    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      for (const request of requests) {
        const response = await cache.match(request);
        if (!response) {
          continue;
        }
        fileCount += 1;
        const contentLength = response.headers.get("content-length");
        const parsedLength = contentLength ? Number.parseInt(contentLength, 10) : Number.NaN;
        if (Number.isFinite(parsedLength)) {
          bytes += parsedLength;
        } else {
          unknownCount += 1;
        }
      }
    }

    return {
      status: fileCount === 0 ? "Empty" : "Ready",
      bytes,
      fileCount,
      unknownCount
    };
  } catch {
    return { status: "Cache check failed", bytes: 0, fileCount: 0, unknownCount: 0 };
  }
}

async function deleteModelCaches(): Promise<CacheUsage> {
  if (typeof caches === "undefined") {
    return { status: "Browser cache unavailable", bytes: 0, fileCount: 0, unknownCount: 0 };
  }

  try {
    const cacheNames = (await caches.keys()).filter(isModelCacheName);
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    return { status: "Empty", bytes: 0, fileCount: 0, unknownCount: 0 };
  } catch {
    return { status: "Cache clear failed", bytes: 0, fileCount: 0, unknownCount: 0 };
  }
}

