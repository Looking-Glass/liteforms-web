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
  IncrementalSpeechBuffer,
  rewriteDecimalsForTts,
  getSafeTextForTts
} from "@/lib/speech";
import type { TtsResult } from "@/lib/speech";
import { DistilWhisperWorkerClient, KokoroWorkerClient } from "@/lib/speech/workerClient";
import type { AsrConfig, TtsConfig } from "@/lib/speech";
import { dispatchAvatarLipSyncFrame } from "@/lib/avatar/lipSyncEvents";
import {
  capPreloadUiProgress,
  clampModelProgress,
  formatBytes,
  formatCacheUsage,
  isModelCacheName,
  normalizeHuggingfaceProgress,
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
  /** Filename to display for a VRM that was restored from persistent storage. */
  initialVrmFileName?: string;
  /** Called when the user loads a new VRM file so the caller can persist it. */
  onVrmFileLoad?: (file: File) => void;
  /** Called when the user resets to the built-in default VRM model. */
  onVrmReset?: () => void;
  shouldPreloadLocalModels?: boolean;
  preloadSessionId?: number;
  initialLlmConfig?: BaseProviderConfig;
  initialTtsConfig?: TtsConfig;
  initialAsrConfig?: AsrConfig;
  onLocalModelLoadStateChange?: (state: LocalModelLoadState[]) => void;
  /** Called whenever the user changes any provider/model/credential setting mid-session. */
  onConfigChange?: (llm: BaseProviderConfig, tts: TtsConfig, asr: AsrConfig) => void;
  /** Called when the user clicks the Configure button in Settings. */
  onOpenConfigure?: () => void;
};

type ChatStatus = "idle" | "streaming" | "error";
type SpeechStatus = "idle" | "speaking" | "listening" | "transcribing" | "testing" | "error";
export type LocalModelId = "gemma" | "qwen-local" | "kokoro" | "distil-whisper";
export type LocalModelLoadState = {
  id: LocalModelId;
  label: string;
  status: "idle" | "loading" | "ready" | "error";
  progress: number;
  message: string;
};

const GEMMA_MODEL_ID = "onnx-community/gemma-4-E2B-it-ONNX";
const QWEN_MODEL_ID = "onnx-community/Qwen3.5-0.8B-ONNX";

const localModelStorageKey = "liteforms.localModels";
export const initialLocalModelLoadState: LocalModelLoadState[] = [
  { id: "gemma", label: "Gemma 4 E2B q8", status: "idle", progress: 0, message: "Waiting" },
  { id: "qwen-local", label: "Qwen 3.5 0.8B", status: "idle", progress: 0, message: "Waiting" },
  { id: "kokoro", label: "Kokoro", status: "idle", progress: 0, message: "Waiting" },
  { id: "distil-whisper", label: "Distil-Whisper", status: "idle", progress: 0, message: "Waiting" }
];

/** Returns true for provider IDs that run entirely in the browser with no endpoint/credential. */
function isBrowserLocalProvider(provider: LlmProviderId): boolean {
  return provider === "browser-local-gemma" || provider === "browser-local-qwen";
}

function SettingsReadout({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-readout" role="group" aria-label={label}>
      <span>{label}</span>
      <strong>{value || "Not set"}</strong>
    </div>
  );
}

// Module-level guard for preload start. Survives across all ChatPanel instances
// (including remounts triggered by chatPanelKey changes in the parent and
// StrictMode dev double-invokes). Keyed by `preloadSessionId` so each distinct
// session can preload exactly once.
const preloadStartedSessions = new Set<number>();

/** Exposed for tests only — clears the preload session guard between test cases. */
export function _clearPreloadSessionsForTesting() {
  preloadStartedSessions.clear();
}


export function ChatPanel({
  character,
  onCharacterChange,
  onModelUrlChange,
  initialVrmFileName,
  onVrmFileLoad,
  onVrmReset,
  shouldPreloadLocalModels = false,
  preloadSessionId = 0,
  initialLlmConfig,
  initialTtsConfig,
  initialAsrConfig,
  onLocalModelLoadStateChange,
  onConfigChange,
  onOpenConfigure
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    character.greeting ? [{ role: "assistant" as const, content: character.greeting }] : []
  );
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
  const [vrmFileName, setVrmFileName] = useState(initialVrmFileName ?? "");

  useEffect(() => {
    if (initialVrmFileName) setVrmFileName(initialVrmFileName);
  }, [initialVrmFileName]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const lastAudioRef = useRef<Blob | null>(null);
  const composerFormRef = useRef<HTMLFormElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const localGemmaWorkerRef = useRef(new LocalGemmaWorkerClient());
  const kokoroWorkerRef = useRef(new KokoroWorkerClient());
  const distilWhisperWorkerRef = useRef(new DistilWhisperWorkerClient());
  const vrmInputRef = useRef<HTMLInputElement>(null);
  const preloadCancelledRef = useRef(false);
  // Throttle rapid progress updates from worker message events to avoid
  // overwhelming React's render loop ("Maximum update depth exceeded") on
  // slow connections where Transformers.js fires many small-chunk events.
  const pendingProgressRef = useRef<Map<LocalModelId, Partial<LocalModelLoadState>>>(new Map());
  const progressFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** IDs of local models that are currently wanted based on configured providers. */
  const activeLocalModelIds = useMemo<Set<LocalModelId>>(() => {
    const ids = new Set<LocalModelId>();
    if (config.provider === "browser-local-gemma") ids.add("gemma");
    if (config.provider === "browser-local-qwen") ids.add("qwen-local");
    if (normalizeTtsConfig(ttsConfig).provider === "kokoro") ids.add("kokoro");
    if (normalizeAsrConfig(asrConfig).provider === "distil-whisper") ids.add("distil-whisper");
    return ids;
  }, [config.provider, ttsConfig, asrConfig]);

  /** Only models that are actively selected — shown in the UI and propagated to the parent. */
  const activeLocalModels = useMemo(
    () => localModelLoadState.filter((m) => activeLocalModelIds.has(m.id)),
    [localModelLoadState, activeLocalModelIds]
  );

  const localModelProgress = useMemo(() => {
    if (activeLocalModels.length === 0) return 0;
    return Math.round(activeLocalModels.reduce((sum, m) => sum + m.progress, 0) / activeLocalModels.length);
  }, [activeLocalModels]);

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
    onLocalModelLoadStateChange?.(activeLocalModels);
  }, [activeLocalModels, onLocalModelLoadStateChange]);

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    let cancelled = false;
    async function requestMicrophonePermission() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        microphoneStreamRef.current = stream;
      } catch (caught) {
        if (!cancelled) {
          setSpeechError(caught instanceof Error ? caught.message : "Microphone access failed.");
          setSpeechStatus("error");
        }
      }
    }

    void requestMicrophonePermission();
    return () => {
      cancelled = true;
      microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
      microphoneStreamRef.current = null;
    };
  }, []);

  // Persist config only on actual user edits, not on the initial mount.
  // React fires child effects before parent effects, so on a page refresh this
  // effect would otherwise run with the unhydrated Gemma defaults BEFORE the
  // page-level useEffect could pass the restored config through props — the
  // initial call would overwrite the saved sessionConfig with stale defaults.
  const configChangeFirstRunRef = useRef(true);
  useEffect(() => {
    if (configChangeFirstRunRef.current) {
      configChangeFirstRunRef.current = false;
      return;
    }
    onConfigChange?.(config, ttsConfig, asrConfig);
  }, [config, ttsConfig, asrConfig, onConfigChange]);

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

    const flushProgress = () => {
      progressFlushTimerRef.current = null;
      if (preloadCancelledRef.current) {
        pendingProgressRef.current.clear();
        return;
      }
      const patches = new Map(pendingProgressRef.current);
      pendingProgressRef.current.clear();
      if (patches.size === 0) return;
      setLocalModelLoadState((models) =>
        models.map((model) => {
          const patch = patches.get(model.id as LocalModelId);
          if (!patch) return model;
          const progress = clampModelProgress(model.progress, model.status, patch.progress, patch.status);
          return { ...model, ...patch, progress };
        })
      );
    };

    const updateLocalModel = (id: LocalModelId, patch: Partial<LocalModelLoadState>) => {
      if (preloadCancelledRef.current) return;
      // Terminal states (ready / error / informational) apply immediately so
      // the final status is never held back by the throttle window.
      const isTerminal = patch.status === "ready" || patch.status === "error";
      if (isTerminal) {
        pendingProgressRef.current.delete(id);
        setLocalModelLoadState((models) =>
          models.map((model) => {
            if (model.id !== id) return model;
            const progress = clampModelProgress(model.progress, model.status, patch.progress, patch.status);
            return { ...model, ...patch, progress };
          })
        );
        return;
      }
      // Progress-only updates are coalesced: the latest patch wins per model,
      // and a single setState is scheduled at most once per 100 ms.
      const pending = pendingProgressRef.current;
      pending.set(id, { ...(pending.get(id) ?? {}), ...patch });
      if (progressFlushTimerRef.current === null) {
        progressFlushTimerRef.current = setTimeout(flushProgress, 100);
      }
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
    const wantQwen = llmProvider === "browser-local-qwen";
    const wantKokoro = normalizedTtsConfig.provider === "kokoro";
    const wantDistilWhisper = normalizedAsrConfig.provider === "distil-whisper";

    async function runPreload() {
      // Check previously-downloaded models upfront. If a model is already in the
      // browser cache we skip its worker entirely — only missing models download.
      // This prevents re-running Transformers.js workers (and re-writing metadata)
      // on every page load while still triggering downloads for newly-added models.
      const meta = readLocalModelMetadata();
      const prevDownloaded = new Set(meta?.downloadedIds ?? []);
      let cacheHasFiles = false;
      if (prevDownloaded.size > 0) {
        const usageCheck = await getModelCacheUsage();
        cacheHasFiles = usageCheck.fileCount > 0;
      }
      // A model is safe to skip only if it was previously recorded as downloaded
      // AND the browser cache still contains files (i.e. it wasn't cleared).
      const alreadyCached = (id: LocalModelId) =>
        !preloadCancelledRef.current && prevDownloaded.has(id) && cacheHasFiles;

      if (wantGemma) {
        if (alreadyCached("gemma")) {
          updateLocalModel("gemma", { status: "ready", progress: 100, message: "Cached" });
        } else {
          await preloadLocalModel("gemma", () =>
            localGemmaWorkerRef.current.preload?.({ model: GEMMA_MODEL_ID }, (progress) => {
              const normalized = normalizeHuggingfaceProgress(progress.progress);
              const capped = capPreloadUiProgress(normalized);
              updateLocalModel("gemma", {
                status: "loading",
                ...(capped !== undefined ? { progress: capped } : {}),
                message: progress.message ?? "Loading Gemma"
              });
            })
          );
        }
      } else {
        updateLocalModel("gemma", { status: "ready", progress: 100, message: "Not used" });
      }

      if (wantQwen) {
        if (alreadyCached("qwen-local")) {
          updateLocalModel("qwen-local", { status: "ready", progress: 100, message: "Cached" });
        } else {
          await preloadLocalModel("qwen-local", () =>
            localGemmaWorkerRef.current.preload?.({ model: QWEN_MODEL_ID }, (progress) => {
              const normalized = normalizeHuggingfaceProgress(progress.progress);
              const capped = capPreloadUiProgress(normalized);
              updateLocalModel("qwen-local", {
                status: "loading",
                ...(capped !== undefined ? { progress: capped } : {}),
                message: progress.message ?? "Loading Qwen"
              });
            })
          );
        }
      } else {
        updateLocalModel("qwen-local", { status: "ready", progress: 100, message: "Not used" });
      }

      if (wantKokoro) {
        if (alreadyCached("kokoro")) {
          updateLocalModel("kokoro", { status: "ready", progress: 100, message: "Cached" });
        } else {
          await preloadLocalModel("kokoro", () =>
            kokoroWorkerRef.current.preload?.(normalizedTtsConfig, (progress) => {
              const capped = capPreloadUiProgress(normalizeHuggingfaceProgress(progress.progress));
              updateLocalModel("kokoro", {
                status: "loading",
                ...(capped !== undefined ? { progress: capped } : {}),
                message: progress.message ?? "Loading Kokoro"
              });
            })
          );
        }
      } else {
        updateLocalModel("kokoro", { status: "ready", progress: 100, message: "Not used" });
      }

      if (wantDistilWhisper) {
        if (alreadyCached("distil-whisper")) {
          updateLocalModel("distil-whisper", { status: "ready", progress: 100, message: "Cached" });
        } else {
          await preloadLocalModel("distil-whisper", () =>
            distilWhisperWorkerRef.current.preload?.(normalizedAsrConfig, (progress) => {
              const capped = capPreloadUiProgress(normalizeHuggingfaceProgress(progress.progress));
              updateLocalModel("distil-whisper", {
                status: "loading",
                ...(capped !== undefined ? { progress: capped } : {}),
                message: progress.message ?? "Loading Distil-Whisper"
              });
            })
          );
        }
      } else {
        updateLocalModel("distil-whisper", { status: "ready", progress: 100, message: "Not used" });
      }

      if (!preloadCancelledRef.current) {
        // Persist the union of previously-downloaded IDs and all newly-wanted IDs
        // so future page loads can skip workers for any model that's now in cache.
        const wantedIds: LocalModelId[] = [
          ...(wantGemma ? (["gemma"] as const) : []),
          ...(wantQwen ? (["qwen-local"] as const) : []),
          ...(wantKokoro ? (["kokoro"] as const) : []),
          ...(wantDistilWhisper ? (["distil-whisper"] as const) : [])
        ];
        persistLocalModelMetadata([...new Set([...prevDownloaded, ...wantedIds])] as LocalModelId[]);
        const usage = await getModelCacheUsage();
        if (!preloadCancelledRef.current) setCacheUsage(usage);
      }
    }

    void runPreload();
    return () => {
      preloadCancelledRef.current = true;
      if (progressFlushTimerRef.current !== null) {
        clearTimeout(progressFlushTimerRef.current);
        progressFlushTimerRef.current = null;
      }
      pendingProgressRef.current.clear();
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
      const ttsAdapter = createTtsAdapter({ config: ttsConfig, worker: kokoroWorkerRef.current });

      let responseText = "";
      const ttsBuffer = new IncrementalSpeechBuffer();
      // synthQueue holds in-flight synthesis Promises started as each sentence
      // is detected — concurrently with the LLM still streaming.
      const synthQueue: Promise<TtsResult>[] = [];
      let safeCursor = 0;
      let chunkCount = 0;

      // ── Async signal: lets the concurrent drain task wake up immediately
      // when a new synthesis promise is pushed or the stream ends. ──────────
      let pendingSignals = 0;
      let signalResolve: (() => void) | null = null;
      const signal = () => {
        pendingSignals++;
        const r = signalResolve;
        signalResolve = null;
        r?.();
      };
      const waitSignal = (): Promise<void> => {
        if (pendingSignals > 0) { pendingSignals--; return Promise.resolve(); }
        return new Promise<void>(r => { signalResolve = r; });
      };

      // ── Drain task: runs concurrently, starts playing as soon as the first
      // synthesis resolves — without waiting for the LLM stream to end. ─────
      let streamDone = false;
      let drainIdx = 0;
      let drainAborted = false;
      setSpeechError("");
      setSpeechStatus("speaking");
      const drainTask = (async () => {
        try {
          while (!drainAborted) {
            if (drainIdx < synthQueue.length) {
              const result = await synthQueue[drainIdx++];
              if (drainAborted) break;
              await playTtsResult(result, { onLipSyncFrame: dispatchAvatarLipSyncFrame });
            } else if (streamDone) {
              break;
            } else {
              await waitSignal();
            }
          }
          if (!drainAborted) setSpeechStatus("idle");
        } catch (caught) {
          if (!drainAborted) {
            setSpeechError(caught instanceof Error ? caught.message : "Speech playback failed.");
            setSpeechStatus("error");
          }
        }
      })();

      const queueSegment = (segment: string) => {
        const prepared = rewriteDecimalsForTts(segment);
        setLastTtsDebug(`TTS: "${prepared}"`);
        synthQueue.push(ttsAdapter.synthesize(prepared));
        signal(); // wake drain task immediately
      };

      try {
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
          chunkCount++;
          setMessages([...nextMessages, { role: "assistant", content: sanitizeAssistantText(responseText) }]);

          // Feed new safe text into the sentence buffer and immediately queue
          // synthesis for any complete sentences that emerge.
          const safeText = getSafeTextForTts(responseText);
          if (safeText.length > safeCursor) {
            const delta = safeText.slice(safeCursor);
            safeCursor = safeText.length;
            for (const seg of ttsBuffer.ingest(delta, false)) {
              queueSegment(seg);
            }
          } else if (safeText.length < safeCursor) {
            safeCursor = safeText.length;
            ttsBuffer.reset();
          }
        }
      } catch (caught) {
        // LLM stream failed — abort the drain task and re-throw
        drainAborted = true;
        signal();
        throw caught;
      }

      // Flush any remaining buffered text after the stream ends.
      const finalSanitized = sanitizeAssistantText(responseText);
      const finalDelta = finalSanitized.slice(safeCursor);
      const finalSegments = finalDelta
        ? ttsBuffer.ingest(finalDelta, true)
        : ttsBuffer.ingest("", true);
      for (const seg of finalSegments) {
        queueSegment(seg);
      }

      // Signal drain task that no more items are coming.
      streamDone = true;
      signal();

      setMessages([...nextMessages, { role: "assistant", content: finalSanitized }]);
      setStatus("idle");
      // drainTask continues in background — no void needed, just let it run
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Provider request failed.";
      setError(message);
      setMessages(nextMessages);
      setStatus("error");
      setSpeechStatus("idle");
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
      const stream = await getMicrophoneStream();
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      });
      recorder.addEventListener("stop", () => {
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

  async function getMicrophoneStream() {
    const existingStream = microphoneStreamRef.current;
    const existingTracks = existingStream?.getAudioTracks?.() ?? existingStream?.getTracks?.() ?? [];
    const hasLiveAudioTrack = existingTracks.some((track) => track.readyState === "live");
    if (existingStream && hasLiveAudioTrack) {
      return existingStream;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone capture is not available in this browser.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    microphoneStreamRef.current = stream;
    return stream;
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
    clearLocalModelMetadata();
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

  function handleVrmLoad(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setVrmFileName(file.name);
    onModelUrlChange(url);
    onVrmFileLoad?.(file);
    event.target.value = "";
  }

  return (
    <aside className="chat-panel" aria-label="Chat">

      {/* ── Collapsible panels — capped height so chat always has room ── */}
      <div className="panel-sections">

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
                {vrmFileName && (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      setVrmFileName("");
                      onVrmReset?.();
                    }}
                  >
                    Reset
                  </button>
                )}
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

          <div className="model-settings">
            <SettingsReadout label="Model provider" value={getProviderLabel(config.provider)} />
            <SettingsReadout label="Model" value={config.model} />
          </div>
          <div className="speech-settings">
            <SettingsReadout label="Voice provider" value={getTtsProviderLabel(ttsConfig.provider)} />
            <SettingsReadout label="Speech input provider" value={getAsrProviderLabel(asrConfig.provider)} />
          </div>

          <button
            type="button"
            className="btn-ghost"
            style={{ justifyContent: "center", width: "100%" }}
            onClick={onOpenConfigure}
          >
            Configure
          </button>

          {/* Advanced: local model status, cache, test buttons */}
          <details className="advanced-section">
            <summary>Advanced</summary>
            <div className="advanced-body">
              <div className="local-model-progress">
                <div className="cache-row">
                  <span>Local models</span>
                  <span>{localModelProgress}%</span>
                </div>
                <progress value={localModelProgress} max={100} />
                <div className="local-model-list">
                  {activeLocalModels.map((model) => (
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

      </div>{/* end .panel-sections */}

      {/* ── Chat ── */}
      <div className="chat-header">Chat</div>
      <div className="message-list" ref={messageListRef}>
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
          onPointerDown={(e) => {
            if (status === "streaming" || speechStatus === "transcribing" || speechStatus === "testing" || speechStatus === "speaking") return;
            e.currentTarget.setPointerCapture(e.pointerId);
            void startMicRecording();
          }}
          onPointerUp={() => stopMicRecording()}
          onPointerLeave={() => { if (speechStatus === "listening") stopMicRecording(); }}
          disabled={status === "streaming" || speechStatus === "transcribing" || speechStatus === "testing" || speechStatus === "speaking"}
        >
          <span style={{ fontSize: "16px", lineHeight: 1 }}>{speechStatus === "listening" ? "◉" : "🎙"}</span>
          <span style={{ fontSize: "9px", letterSpacing: "0.06em", lineHeight: 1, fontFamily: "var(--font-mono, monospace)" }}>
            {speechStatus === "listening" ? "REC" : "HOLD"}
          </span>
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

type LocalModelMetadata = {
  version: number;
  storedAt: string;
  /** IDs of models that were actually downloaded in the most recent successful preload run. */
  downloadedIds: string[];
  models: Array<{ id: string; model: string; dtype: string; device: string }>;
};

function persistLocalModelMetadata(downloadedIds: LocalModelId[]) {
  try {
    localStorage.setItem(
      localModelStorageKey,
      JSON.stringify({
        version: 2,
        storedAt: new Date().toISOString(),
        downloadedIds,
        models: [
          { id: "gemma", model: GEMMA_MODEL_ID, dtype: "q4f16", device: "webgpu" },
          { id: "qwen-local", model: QWEN_MODEL_ID, dtype: "q8", device: "webgpu" },
          { id: "kokoro", model: "onnx-community/Kokoro-82M-v1.0-ONNX", dtype: "fp32", device: "webgpu" },
          { id: "distil-whisper", model: "onnx-community/distil-small.en", dtype: "q4", device: "webgpu" }
        ]
      })
    );
  } catch {
    // localStorage can be disabled in private browsing or hardened contexts.
  }
}

function readLocalModelMetadata(): LocalModelMetadata | null {
  try {
    const raw = localStorage.getItem(localModelStorageKey);
    if (!raw) return null;
    return JSON.parse(raw) as LocalModelMetadata;
  } catch {
    return null;
  }
}

function clearLocalModelMetadata() {
  try {
    localStorage.removeItem(localModelStorageKey);
  } catch {
    // ignore
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

