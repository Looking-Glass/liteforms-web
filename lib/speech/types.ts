export type SpeechDevice = "webgpu" | "wasm";

export type KokoroDtype = "fp32" | "fp16" | "q8" | "q4" | "q4f16";

export type TtsProviderId = "kokoro" | "elevenlabs" | "deepgram";

export type AsrProviderId = "distil-whisper" | "deepgram" | "elevenlabs";

export type WordTiming = {
  word: string;
  start: number;
  end: number;
};

export type TtsResult = {
  audio: ArrayBuffer;
  sampleRate?: number;
  mimeType: string;
  words?: WordTiming[];
};

export type KokoroTtsConfig = {
  provider: "kokoro";
  model?: string;
  voice?: string;
  dtype?: KokoroDtype;
  device?: SpeechDevice;
  speed?: number;
};

export type ElevenLabsTtsConfig = {
  provider: "elevenlabs";
  credential?: string;
  baseUrl?: string;
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
  speed?: number;
};

export type DeepgramTtsConfig = {
  provider: "deepgram";
  credential?: string;
  baseUrl?: string;
  voice?: string;
  model?: string;
};

export type TtsConfig = KokoroTtsConfig | ElevenLabsTtsConfig | DeepgramTtsConfig;

export type DistilWhisperAsrConfig = {
  provider: "distil-whisper";
  model?: string;
  device?: SpeechDevice;
  dtype?: KokoroDtype;
  language?: string;
  autoSend?: boolean;
};

export type DeepgramAsrConfig = {
  provider: "deepgram";
  credential?: string;
  baseUrl?: string;
  model?: string;
  language?: string;
  autoSend?: boolean;
};

export type ElevenLabsAsrConfig = {
  provider: "elevenlabs";
  credential?: string;
  baseUrl?: string;
  model?: string;
  language?: string;
  autoSend?: boolean;
};

export type AsrConfig = DistilWhisperAsrConfig | DeepgramAsrConfig | ElevenLabsAsrConfig;

export type AsrResult = {
  text: string;
  language?: string;
  confidence?: number;
};

export type ModelLoadProgress = {
  status: "idle" | "loading" | "ready" | "error";
  progress: number;
  message?: string;
};

export type TtsWorkerRequest = Required<Pick<KokoroTtsConfig, "provider" | "model" | "voice" | "dtype" | "device" | "speed">> & {
  text: string;
};

export type TtsWorkerLike = {
  preload?(request: Omit<TtsWorkerRequest, "text">, onProgress?: (progress: ModelLoadProgress) => void): Promise<void>;
  synthesize(request: TtsWorkerRequest): Promise<TtsResult>;
};

export type AsrWorkerRequest = Required<Pick<DistilWhisperAsrConfig, "provider" | "model" | "device" | "dtype" | "language" | "autoSend">> & {
  audio: Float32Array;
};

export type AsrWorkerLike = {
  preload?(request: Omit<AsrWorkerRequest, "audio">, onProgress?: (progress: ModelLoadProgress) => void): Promise<void>;
  transcribe(request: AsrWorkerRequest): Promise<AsrResult>;
};

export type TtsAdapter = {
  provider: TtsProviderId;
  synthesize(text: string): Promise<TtsResult>;
};

export type AsrAdapter = {
  provider: AsrProviderId;
  transcribe(audio: Blob): Promise<AsrResult>;
};
