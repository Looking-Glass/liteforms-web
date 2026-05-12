import { createAsrAdapter } from "./asr";
import {
  isCloudRealtimeAsrProvider,
  normalizeCloudRealtimeAsrConfig,
  type AsrRelayServerMessage
} from "./asrRealtimeRelay";
import { normalizeAsrConfig } from "./config";
import type { AsrConfig, AsrWorkerLike, AsrWorkerRequest } from "./types";

export const DEFAULT_ASR_REALTIME_CHUNK_MS = 5000;
export const DEFAULT_ASR_REALTIME_PCM_HOP_MS = 2000;
export const DEFAULT_ASR_REALTIME_PCM_WINDOW_MS = 6000;
export const ASR_REALTIME_PCM_SAMPLE_RATE = 16000;
// Must stay in sync with DYNAMIC_MIC_RMS_THRESHOLD in ChatPanel — same environment, same speech floor.
export const ASR_REALTIME_SILENCE_RMS_THRESHOLD = 0.015;

const ASR_REALTIME_DEBUG = false;

export type AsrTranscriptEvent = {
  final: boolean;
};

export type AsrRealtimeSession = {
  start(stream: MediaStream): void;
  stop(): Promise<string>;
  isActive(): boolean;
  sendAudio(audio: Blob): void;
};

type CreateAsrRealtimeSessionInput = {
  config: AsrConfig;
  worker?: AsrWorkerLike;
  chunkMs?: number;
  pcmHopMs?: number;
  pcmWindowMs?: number;
  onPartial?: (text: string) => void;
  onTranscript?: (text: string, event: AsrTranscriptEvent) => void;
  onRecording?: (audio: Blob) => void;
  onError?: (error: Error) => void;
};

export function createAsrRealtimeSession({
  config,
  worker,
  chunkMs = DEFAULT_ASR_REALTIME_CHUNK_MS,
  pcmHopMs = DEFAULT_ASR_REALTIME_PCM_HOP_MS,
  pcmWindowMs = DEFAULT_ASR_REALTIME_PCM_WINDOW_MS,
  onPartial,
  onTranscript,
  onRecording,
  onError
}: CreateAsrRealtimeSessionInput): AsrRealtimeSession {
  if (config.provider === "distil-whisper" && worker) {
    return createRollingPcmAsrRealtimeSession({
      config,
      worker,
      pcmHopMs,
      pcmWindowMs,
      fallback: () =>
        createMediaRecorderAsrRealtimeSession({
          config,
          worker,
          chunkMs,
          onPartial,
          onTranscript,
          onRecording,
          onError
        }),
      onPartial,
      onTranscript,
      onRecording,
      onError
    });
  }

  if (isCloudRealtimeAsrProvider(config.provider)) {
    return createMediaRecorderAsrRealtimeSession({
      config,
      worker,
      chunkMs,
      onPartial,
      onTranscript,
      onRecording,
      onError
    });
  }

  return createMediaRecorderAsrRealtimeSession({
    config,
    worker,
    chunkMs,
    onPartial,
    onTranscript,
    onRecording,
    onError
  });
}

function createCloudRelayAsrRealtimeSession({
  config,
  worker,
  onPartial,
  onTranscript,
  onRecording,
  onError
}: Pick<CreateAsrRealtimeSessionInput, "config" | "worker" | "onPartial" | "onTranscript" | "onRecording" | "onError">): AsrRealtimeSession {
  const realtimeConfig = normalizeCloudRealtimeAsrConfig(config);
  if (!realtimeConfig) {
    return createMediaRecorderAsrRealtimeSession({ config, worker, chunkMs: DEFAULT_ASR_REALTIME_CHUNK_MS, onPartial, onTranscript, onRecording, onError });
  }

  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let processor: ScriptProcessorNode | null = null;
  let socket: WebSocket | null = null;
  let active = false;
  let stopping = false;
  let finalizing: Promise<string> | null = null;
  let transcript = "";
  let partialPrefix = "";
  let failed: Error | null = null;
  let recordedPcm = new Float32Array(0);
  let fallbackRecording: Blob | null = null;

  const appendRecording = (samples: Float32Array) => {
    if (samples.length === 0) return;
    const next = new Float32Array(recordedPcm.length + samples.length);
    next.set(recordedPcm, 0);
    next.set(samples, recordedPcm.length);
    recordedPcm = next;
  };

  const emitError = (caught: unknown) => {
    const error = caught instanceof Error ? caught : new Error("Realtime transcription failed.");
    failed = error;
    onError?.(error);
  };

  const handleMessage = (message: AsrRelayServerMessage) => {
    if (message.type === "partial") {
      const text = mergeTranscriptText(transcript, message.text);
      partialPrefix = text;
      onPartial?.(text);
      onTranscript?.(text, { final: false });
      return;
    }
    if (message.type === "transcript") {
      transcript = mergeTranscriptText(transcript, message.text);
      partialPrefix = transcript;
      onPartial?.(transcript);
      onTranscript?.(transcript, { final: false });
      return;
    }
    if (message.type === "error") {
      emitError(new Error(message.error));
    }
  };

  const cleanupAudio = () => {
    processor?.disconnect();
    source?.disconnect();
    void context?.close?.();
    processor = null;
    source = null;
    context = null;
    active = false;
  };

  const finalize = () => {
    if (finalizing) return finalizing;
    stopping = true;
    cleanupAudio();
    socket?.send(JSON.stringify({ type: "finalize" }));
    socket?.send(JSON.stringify({ type: "close" }));
    socket?.close();
    fallbackRecording = encodeWav(recordedPcm, ASR_REALTIME_PCM_SAMPLE_RATE);
    if (fallbackRecording.size > 44) onRecording?.(fallbackRecording);
    finalizing = Promise.resolve().then(async () => {
      stopping = false;
      if (failed && fallbackRecording && fallbackRecording.size > 44) {
        const adapter = createAsrAdapter({ config, worker });
        const result = await adapter.transcribe(fallbackRecording);
        transcript = result.text.trim();
      } else if (failed) {
        throw failed;
      }
      const finalText = transcript.trim() || partialPrefix.trim();
      onTranscript?.(finalText, { final: true });
      return finalText;
    });
    return finalizing;
  };

  return {
    start(stream) {
      if (active) return;
      try {
        const AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
        if (!AudioContextCtor) throw new Error("Web Audio capture is unavailable.");
        socket = new WebSocket(toRelayWebSocketUrl("/api/asr/realtime"));
        socket.binaryType = "arraybuffer";
        socket.addEventListener("open", () => {
          socket?.send(JSON.stringify({ type: "start", provider: realtimeConfig.provider, config: realtimeConfig }));
        });
        socket.addEventListener("message", (event) => {
          try {
            handleMessage(JSON.parse(String(event.data)) as AsrRelayServerMessage);
          } catch (caught) {
            emitError(caught);
          }
        });
        socket.addEventListener("error", () => emitError(new Error("Realtime transcription relay failed.")));

        context = new AudioContextCtor();
        source = context.createMediaStreamSource(stream);
        processor = context.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (event) => {
          const samples = mixAndResampleInputBuffer(event.inputBuffer, ASR_REALTIME_PCM_SAMPLE_RATE);
          appendRecording(samples);
          const providerSamples = realtimeConfig.sampleRate === ASR_REALTIME_PCM_SAMPLE_RATE
            ? samples
            : resamplePcm(samples, ASR_REALTIME_PCM_SAMPLE_RATE, realtimeConfig.sampleRate);
          const encoded = realtimeConfig.encoding.includes("mulaw") || realtimeConfig.encoding === "mulaw"
            ? encodeMuLaw(providerSamples)
            : encodePcm16(providerSamples);
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(encoded);
          }
        };
        source.connect(processor);
        processor.connect(context.destination);
        active = true;
        stopping = false;
        failed = null;
        transcript = "";
        partialPrefix = "";
        recordedPcm = new Float32Array(0);
      } catch (caught) {
        emitError(caught);
      }
    },
    stop() {
      return finalize();
    },
    isActive() {
      return active || stopping;
    },
    sendAudio(audio) {
      void audio.arrayBuffer().then((buffer) => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(buffer);
      });
    }
  };
}

function createMediaRecorderAsrRealtimeSession({
  config,
  worker,
  chunkMs,
  onPartial,
  onTranscript,
  onRecording,
  onError
}: Required<Pick<CreateAsrRealtimeSessionInput, "config" | "chunkMs">> &
  Pick<CreateAsrRealtimeSessionInput, "worker" | "onPartial" | "onTranscript" | "onRecording" | "onError">): AsrRealtimeSession {
  const adapter = createAsrAdapter({ config, worker });
  let recorder: MediaRecorder | null = null;
  let active = false;
  let stopping = false;
  let stopRequested = false;
  let finalizing: Promise<string> | null = null;
  let queue: Promise<void> = Promise.resolve();
  let transcript = "";
  let recordingChunks: BlobPart[] = [];
  let failed: Error | null = null;
  let errorEmitted = false;
  let resolveStopped: (() => void) | null = null;
  let stopped = Promise.resolve();
  let chunkIndex = 0;

  const log = (message: string, details?: Record<string, unknown>) => {
    if (isAsrRealtimeDebugEnabled()) {
      console.log(`[ASR realtime] ${message}`, details ?? "");
    }
  };

  const emitError = (caught: unknown) => {
    const error = caught instanceof Error ? caught : new Error("Transcription failed.");
    if (isAsrRealtimeDebugEnabled()) {
      console.error("[ASR realtime] error", {
        message: error.message,
        name: error.name,
        stack: error.stack,
        transcript,
        recorderState: recorder?.state,
        recordedChunks: recordingChunks.length
      });
    }
    failed = error;
    if (!errorEmitted) {
      errorEmitted = true;
      onError?.(error);
    }
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Best effort: the failure path is already represented by `failed`.
      }
    }
  };

  const appendTranscript = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      log("chunk transcript empty");
      return;
    }
    transcript = trimmed;
    log("chunk transcript appended", {
      chunkTextLength: trimmed.length,
      totalTextLength: transcript.length,
      transcript
    });
    onPartial?.(transcript);
    onTranscript?.(transcript, { final: false });
  };

  const enqueueRecordingSnapshot = () => {
    const currentChunk = ++chunkIndex;
    const snapshotChunks = recordingChunks.slice();
    const audio = new Blob(snapshotChunks, { type: recorder?.mimeType || "audio/webm" });
    if (audio.size <= 0 || failed) {
      log("chunk skipped", { chunk: currentChunk, size: audio.size, failed: Boolean(failed) });
      return;
    }
    log("recording snapshot queued", {
      chunk: currentChunk,
      size: audio.size,
      type: audio.type,
      sourceChunks: snapshotChunks.length
    });
    queue = queue.then(async () => {
      if (failed) return;
      try {
        log("recording snapshot transcription starting", {
          chunk: currentChunk,
          size: audio.size,
          type: audio.type,
          sourceChunks: snapshotChunks.length
        });
        const result = await adapter.transcribe(audio);
        log("recording snapshot transcription finished", {
          chunk: currentChunk,
          resultTextLength: result.text.length,
          language: result.language
        });
        appendTranscript(result.text);
      } catch (caught) {
        log("recording snapshot transcription failed", {
          chunk: currentChunk,
          size: audio.size,
          type: audio.type,
          sourceChunks: snapshotChunks.length
        });
        emitError(caught);
      }
    });
  };

  const finalize = () => {
    if (finalizing) return finalizing;
    active = false;
    stopping = true;
    finalizing = queue.then(() => {
      stopping = false;
      if (failed) throw failed;
      if (recordingChunks.length > 0) {
        const recording = new Blob(recordingChunks, { type: recorder?.mimeType || "audio/webm" });
        log("recording finalized", {
          size: recording.size,
          type: recording.type,
          chunks: recordingChunks.length
        });
        onRecording?.(recording);
      }
      log("final transcript emitted", {
        textLength: transcript.length,
        transcript
      });
      onTranscript?.(transcript, { final: true });
      return transcript;
    });
    return finalizing;
  };

  return {
    start(stream) {
      if (active) return;
      log("session starting", {
        provider: config.provider,
        chunkMs,
        mediaRecorderAvailable: typeof MediaRecorder !== "undefined",
        supportedTypes: getSupportedRecorderTypes()
      });
      recorder = new MediaRecorder(stream);
      log("recorder created", {
        mimeType: recorder.mimeType,
        state: recorder.state,
        streamTracks: stream.getTracks?.().map((track) => ({
          kind: track.kind,
          readyState: track.readyState,
          enabled: track.enabled,
          muted: track.muted
        }))
      });
      stopped = new Promise<void>((resolve) => {
        resolveStopped = resolve;
      });
      recordingChunks = [];
      recorder.addEventListener("dataavailable", (event) => {
        const data = (event as BlobEvent).data;
        log("recorder dataavailable", {
          size: data?.size,
          type: data?.type,
          recorderMimeType: recorder?.mimeType,
          state: recorder?.state
        });
        if (data?.size > 0) {
          recordingChunks.push(data);
          enqueueRecordingSnapshot();
        }
      });
      recorder.addEventListener("stop", () => {
        log("recorder stop event", {
          state: recorder?.state,
          recordedChunks: recordingChunks.length
        });
        resolveStopped?.();
        resolveStopped = null;
        void finalize().catch(() => {
          // onError already surfaced the failure; callers that awaited stop()
          // receive the same rejection from the shared finalization promise.
        });
      });
      active = true;
      stopping = false;
      stopRequested = false;
      recorder.start(chunkMs);
      log("recorder started", {
        state: recorder.state,
        mimeType: recorder.mimeType,
        chunkMs
      });
    },

    async stop() {
      if (!recorder) return finalize();
      if (!stopRequested && recorder.state !== "inactive") {
        stopRequested = true;
        log("session stop requested", {
          state: recorder.state,
          recordedChunks: recordingChunks.length
        });
        try {
          recorder.requestData?.();
          log("recorder requestData called");
        } catch {
          log("recorder requestData threw");
          // Some implementations only emit final data from stop().
        }
        recorder.stop();
      } else if (recorder.state === "inactive") {
        void finalize();
      }
      await stopped;
      return finalize();
    },

    isActive() {
      return active || stopping;
    },

    sendAudio(audio) {
      log("external audio received", {
        size: audio.size,
        type: audio.type
      });
      recordingChunks.push(audio);
      enqueueRecordingSnapshot();
    }
  };
}

type RollingPcmSessionInput = Required<Pick<CreateAsrRealtimeSessionInput, "config" | "worker" | "pcmHopMs" | "pcmWindowMs">> &
  Pick<CreateAsrRealtimeSessionInput, "onPartial" | "onTranscript" | "onRecording" | "onError"> & {
    fallback: () => AsrRealtimeSession;
  };

function createRollingPcmAsrRealtimeSession({
  config,
  worker,
  pcmHopMs,
  pcmWindowMs,
  fallback,
  onPartial,
  onTranscript,
  onRecording,
  onError
}: RollingPcmSessionInput): AsrRealtimeSession {
  const normalizedConfig = normalizeAsrConfig(config);
  if (normalizedConfig.provider !== "distil-whisper") {
    return fallback();
  }
  const workerConfig: Omit<AsrWorkerRequest, "audio"> = normalizedConfig;
  const windowSamples = Math.round((ASR_REALTIME_PCM_SAMPLE_RATE * pcmWindowMs) / 1000);
  let fallbackSession: AsrRealtimeSession | null = null;
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let processor: ScriptProcessorNode | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let active = false;
  let stopping = false;
  let finalizing: Promise<string> | null = null;
  let failed: Error | null = null;
  let errorEmitted = false;
  let transcript = "";
  let busy = false;
  let pendingWindow: Float32Array | null = null;
  let idleResolvers: Array<() => void> = [];
  const buffer = new RollingPcmBuffer(windowSamples);

  const emitError = (caught: unknown) => {
    const error = caught instanceof Error ? caught : new Error("Transcription failed.");
    failed = error;
    if (!errorEmitted) {
      errorEmitted = true;
      onError?.(error);
    }
    cleanupAudio();
  };

  const appendTranscript = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const previous = transcript;
    transcript = mergeTranscriptText(transcript, trimmed);
    debugAsrRealtime("pcm window merged", {
      previous,
      next: trimmed,
      merged: transcript
    });
    onPartial?.(transcript);
    onTranscript?.(transcript, { final: false });
  };

  const resolveIdleIfNeeded = () => {
    if (busy || pendingWindow) return;
    const resolvers = idleResolvers;
    idleResolvers = [];
    resolvers.forEach((resolve) => resolve());
  };

  const waitForIdle = () => {
    if (!busy && !pendingWindow) return Promise.resolve();
    return new Promise<void>((resolve) => idleResolvers.push(resolve));
  };

  const processWindow = (audio: Float32Array) => {
    busy = true;
    void worker
      .transcribe({ ...workerConfig, audio })
      .then((result) => {
        debugAsrRealtime("pcm transcript chunk", { text: result.text });
        appendTranscript(result.text);
      })
      .catch((caught) => {
        emitError(caught);
      })
      .finally(() => {
        busy = false;
        if (!failed && pendingWindow) {
          const next = pendingWindow;
          pendingWindow = null;
          processWindow(next);
          return;
        }
        resolveIdleIfNeeded();
      });
  };

  const hasSpeechActivity = (audio: Float32Array) => {
    // Check in ~256ms chunks so a single moment of speech in a longer silence window still passes.
    const chunkSize = 4096;
    let peakChunkRms = 0;
    for (let start = 0; start < audio.length; start += chunkSize) {
      const end = Math.min(start + chunkSize, audio.length);
      let sum = 0;
      for (let i = start; i < end; i++) sum += audio[i] * audio[i];
      const chunkRms = Math.sqrt(sum / (end - start));
      if (chunkRms > peakChunkRms) peakChunkRms = chunkRms;
      if (chunkRms >= ASR_REALTIME_SILENCE_RMS_THRESHOLD) {
        debugAsrRealtime("pcm speech gate passed", {
          peakChunkRms,
          threshold: ASR_REALTIME_SILENCE_RMS_THRESHOLD
        });
        return true;
      }
    }
    debugAsrRealtime("pcm speech gate skipped", {
      peakChunkRms,
      threshold: ASR_REALTIME_SILENCE_RMS_THRESHOLD
    });
    return false;
  };

  const enqueueWindow = (audio: Float32Array) => {
    if (failed || audio.length === 0) return;
    if (!hasSpeechActivity(audio)) return;
    if (busy) {
      pendingWindow = audio;
      return;
    }
    processWindow(audio);
  };

  const enqueueLatestWindow = () => {
    enqueueWindow(buffer.snapshot(windowSamples));
  };

  const cleanupAudio = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    processor?.disconnect();
    source?.disconnect();
    void context?.close?.();
    processor = null;
    source = null;
    context = null;
    active = false;
  };

  const finalize = () => {
    if (fallbackSession) return fallbackSession.stop();
    if (finalizing) return finalizing;
    stopping = true;
    cleanupAudio();
    const tailWindow = buffer.snapshot(windowSamples);
    pendingWindow = tailWindow.length > 0 && hasSpeechActivity(tailWindow) ? tailWindow : null;
    finalizing = waitForIdle().then(() => {
      stopping = false;
      if (failed) throw failed;
      if (tailWindow.length > 0) {
        onRecording?.(encodeWav(tailWindow, ASR_REALTIME_PCM_SAMPLE_RATE));
      }
      onTranscript?.(transcript, { final: true });
      return transcript;
    });
    if (!busy && pendingWindow) {
      const next = pendingWindow;
      pendingWindow = null;
      processWindow(next);
    }
    return finalizing;
  };

  return {
    start(stream) {
      if (fallbackSession) {
        fallbackSession.start(stream);
        return;
      }
      if (active) return;
      try {
        const AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
        if (!AudioContextCtor) throw new Error("Web Audio capture is unavailable.");
        context = new AudioContextCtor();
        source = context.createMediaStreamSource(stream);
        processor = context.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (event) => {
          const input = event.inputBuffer;
          buffer.append(mixAndResampleInputBuffer(input, ASR_REALTIME_PCM_SAMPLE_RATE));
        };
        source.connect(processor);
        processor.connect(context.destination);
        active = true;
        stopping = false;
        failed = null;
        errorEmitted = false;
        transcript = "";
        pendingWindow = null;
        timer = setInterval(enqueueLatestWindow, pcmHopMs);
        debugAsrRealtime("pcm session started", {
          hopMs: pcmHopMs,
          windowMs: pcmWindowMs,
          threshold: ASR_REALTIME_SILENCE_RMS_THRESHOLD
        });
      } catch (err) {
        debugAsrRealtime("pcm setup failed; using MediaRecorder fallback", {
          error: err instanceof Error ? err.message : String(err)
        });
        cleanupAudio();
        fallbackSession = fallback();
        fallbackSession.start(stream);
      }
    },

    stop() {
      return finalize();
    },

    isActive() {
      return fallbackSession ? fallbackSession.isActive() : active || stopping;
    },

    sendAudio(audio) {
      if (fallbackSession) {
        fallbackSession.sendAudio(audio);
      }
    }
  };
}

function getSupportedRecorderTypes() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return [];
  return [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4"
  ].filter((type) => MediaRecorder.isTypeSupported(type));
}

class RollingPcmBuffer {
  private samples = new Float32Array(0);

  constructor(private readonly capacity: number) {}

  append(input: Float32Array) {
    if (input.length === 0) return;
    if (input.length >= this.capacity) {
      this.samples = input.slice(input.length - this.capacity);
      return;
    }
    const next = new Float32Array(Math.min(this.capacity, this.samples.length + input.length));
    const keep = next.length - input.length;
    if (keep > 0) {
      next.set(this.samples.slice(this.samples.length - keep), 0);
    }
    next.set(input, keep);
    this.samples = next;
  }

  snapshot(maxSamples: number) {
    return this.samples.slice(Math.max(0, this.samples.length - maxSamples));
  }
}

function mixAndResampleInputBuffer(buffer: AudioBuffer, targetSampleRate: number) {
  const mono = new Float32Array(buffer.length);
  for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
    const channel = buffer.getChannelData(channelIndex);
    for (let sampleIndex = 0; sampleIndex < mono.length; sampleIndex += 1) {
      mono[sampleIndex] += channel[sampleIndex] / buffer.numberOfChannels;
    }
  }

  if (buffer.sampleRate === targetSampleRate) return mono;

  const outputLength = Math.max(1, Math.round((mono.length * targetSampleRate) / buffer.sampleRate));
  const output = new Float32Array(outputLength);
  const ratio = buffer.sampleRate / targetSampleRate;
  for (let outputIndex = 0; outputIndex < output.length; outputIndex += 1) {
    const sourceIndex = outputIndex * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(left + 1, mono.length - 1);
    const weight = sourceIndex - left;
    output[outputIndex] = mono[left] * (1 - weight) + mono[right] * weight;
  }
  return output;
}

export function mergeTranscriptText(existing: string, next: string) {
  const left = existing.trim();
  const right = next.trim();
  if (!left) return right;
  if (!right) return left;
  if (left.endsWith(right)) return left;
  if (right.startsWith(left)) return right;

  const shortRepeatMerge = mergeShortRepeatedTail(left, right);
  if (shortRepeatMerge) return shortRepeatMerge;

  const leftTokens = tokenizeTranscript(left);
  const rightTokens = tokenizeTranscript(right);
  const overlap = findBestTranscriptOverlap(leftTokens, rightTokens);
  if (overlap) {
    debugAsrRealtime("merge overlap", {
      left,
      right,
      overlap
    });
    const leftPrefixTokens = leftTokens.slice(0, leftTokens.length - overlap.size);
    const leftPrefix = leftPrefixTokens.map((token) => token.raw);
    if (overlap.rightStart === 0) {
      const leftOverlap = leftTokens.slice(leftTokens.length - overlap.size);
      const prefixTail = leftPrefixTokens.at(-1);
      const shouldSkipRightHead =
        shouldPreserveLeftOverlapHead(leftOverlap[0], rightTokens[0]) || shouldPreserveLeftOverlapHead(prefixTail, rightTokens[0]);
      const rightStart = shouldSkipRightHead ? 1 : 0;
      const preservedHead = rightStart === 1 && shouldPreserveLeftOverlapHead(leftOverlap[0], rightTokens[0]) ? [leftOverlap[0].raw] : [];
      return joinTranscriptTokens([...leftPrefix, ...preservedHead, ...rightTokens.slice(rightStart).map((token) => token.raw)]);
    }
    const leftOverlap = leftTokens.slice(leftTokens.length - overlap.size).map((token) => token.raw);
    const rightSuffix = rightTokens.slice(overlap.rightStart + overlap.size).map((token) => token.raw);
    return joinTranscriptTokens([...leftPrefix, ...leftOverlap, ...rightSuffix]);
  }

  const leftTail = leftTokens.at(-1);
  if (shouldPreserveLeftOverlapHead(leftTail, rightTokens[0])) {
    debugAsrRealtime("merge suffix-contained head", {
      left,
      right,
      leftTail,
      rightHead: rightTokens[0]
    });
    return joinTranscriptTokens([...leftTokens.map((token) => token.raw), ...rightTokens.slice(1).map((token) => token.raw)]);
  }
  const leftPenultimate = leftTokens.at(-2);
  if (
    shouldPreserveLeftOverlapHead(leftPenultimate, rightTokens[0]) &&
    leftTail?.normalized === rightTokens[1]?.normalized
  ) {
    debugAsrRealtime("merge suffix-contained phrase", {
      left,
      right,
      leftPenultimate,
      leftTail,
      rightHead: rightTokens[0]
    });
    return joinTranscriptTokens([...leftTokens.map((token) => token.raw), ...rightTokens.slice(2).map((token) => token.raw)]);
  }

  return `${left} ${right}`;
}

function mergeShortRepeatedTail(left: string, right: string) {
  const leftTokens = tokenizeTranscript(left);
  const rightTokens = tokenizeTranscript(right);
  const maxSize = Math.min(6, leftTokens.length, rightTokens.length);
  for (let size = maxSize; size >= 1; size -= 1) {
    if (!tokensEqual(leftTokens.slice(leftTokens.length - size), rightTokens.slice(0, size))) continue;
    const leftRawTokens = leftTokens.map((token) => token.raw);
    return joinTranscriptTokens([...leftRawTokens.slice(0, leftRawTokens.length - size), ...rightTokens.map((token) => token.raw)]);
  }
  return null;
}

function tokensEqual(left: TranscriptToken[], right: TranscriptToken[]) {
  return left.length === right.length && left.every((token, index) => token.normalized === right[index].normalized);
}

function isAsrRealtimeDebugEnabled() {
  if (ASR_REALTIME_DEBUG) return true;
  try {
    return globalThis.localStorage?.getItem("liteforms.asrRealtimeDebug") === "1";
  } catch {
    return false;
  }
}

function debugAsrRealtime(message: string, details?: Record<string, unknown>) {
  if (isAsrRealtimeDebugEnabled()) {
    console.log(`[ASR realtime] ${message}`, details ?? "");
  }
}

type TranscriptToken = {
  raw: string;
  normalized: string;
};

function tokenizeTranscript(input: string): TranscriptToken[] {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({
      raw,
      normalized: raw
        .toLowerCase()
        .replace(/[^\p{L}\p{N}']/gu, "")
        .replace(/^'+|'+$/g, "")
    }));
}

function findBestTranscriptOverlap(leftTokens: TranscriptToken[], rightTokens: TranscriptToken[]) {
  const maxSize = Math.min(28, leftTokens.length, rightTokens.length);
  const minSize = Math.min(3, maxSize);
  let best: { size: number; rightStart: number; score: number } | null = null;
  const maxRightStart = Math.min(10, rightTokens.length - minSize);

  for (let size = maxSize; size >= minSize; size -= 1) {
    const leftStart = leftTokens.length - size;
    for (let rightStart = 0; rightStart <= maxRightStart && rightStart + size <= rightTokens.length; rightStart += 1) {
      const score = transcriptOverlapScore(leftTokens, leftStart, rightTokens, rightStart, size);
      if (score < 0.68) continue;
      if (!best || score * size > best.score * best.size) {
        best = { size, rightStart, score };
      }
    }
    if (best && best.size >= size - 1) return best;
  }

  return best;
}

function shouldPreserveLeftOverlapHead(left: TranscriptToken | undefined, right: TranscriptToken | undefined) {
  if (!left || !right) return false;
  if (left.normalized === right.normalized) return false;
  return left.normalized.endsWith(right.normalized) && left.normalized.length > right.normalized.length + 1;
}

function transcriptOverlapScore(
  leftTokens: TranscriptToken[],
  leftStart: number,
  rightTokens: TranscriptToken[],
  rightStart: number,
  size: number
) {
  let score = 0;
  for (let index = 0; index < size; index += 1) {
    score += transcriptTokenSimilarity(leftTokens[leftStart + index].normalized, rightTokens[rightStart + index].normalized);
  }
  return score / size;
}

function transcriptTokenSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const commonPrefix = countCommonPrefix(left, right);
  if (commonPrefix >= 6 && commonPrefix / Math.max(left.length, right.length) >= 0.58) {
    return 0.82;
  }
  return 0;
}

function countCommonPrefix(left: string, right: string) {
  let count = 0;
  while (count < left.length && count < right.length && left[count] === right[count]) {
    count += 1;
  }
  return count;
}

function joinTranscriptTokens(tokens: string[]) {
  return tokens.join(" ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function resamplePcm(samples: Float32Array, sourceSampleRate: number, targetSampleRate: number) {
  if (sourceSampleRate === targetSampleRate) return samples;
  const outputLength = Math.max(1, Math.round((samples.length * targetSampleRate) / sourceSampleRate));
  const output = new Float32Array(outputLength);
  const ratio = sourceSampleRate / targetSampleRate;
  for (let index = 0; index < output.length; index += 1) {
    const sourceIndex = index * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(left + 1, samples.length - 1);
    const weight = sourceIndex - left;
    output[index] = samples[left] * (1 - weight) + samples[right] * weight;
  }
  return output;
}

function encodePcm16(samples: Float32Array) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return bytes;
}

function encodeMuLaw(samples: Float32Array) {
  const output = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    const sign = sample < 0 ? 0x80 : 0;
    const magnitude = Math.log1p(255 * Math.abs(sample)) / Math.log1p(255);
    const quantized = Math.min(127, Math.floor(magnitude * 127));
    output[i] = (~(sign | quantized)) & 0xff;
  }
  return output;
}

function toRelayWebSocketUrl(path: string) {
  if (typeof window === "undefined") return path;
  const url = new URL(path, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

declare global {
  // Safari still exposes webkitAudioContext in some supported browser ranges.
  // eslint-disable-next-line no-var
  var webkitAudioContext: typeof AudioContext | undefined;
}
