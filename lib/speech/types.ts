export type SpeechDevice = "webgpu" | "wasm";

export type KokoroDtype = "fp32" | "fp16" | "q8" | "q4" | "q4f16";

export type TtsProviderId =
  | "kokoro"
  | "elevenlabs"
  | "deepgram"
  | "openai"
  | "google"
  | "xai"
  | "deepinfra"
  | "openrouter"
  | "inworld"
  | "minimax"
  | "gradium"
  | "vydra"
  | "xiaomi"
  | "azure-speech"
  | "microsoft"
  | "volcengine";

export type AsrProviderId = "distil-whisper" | "deepgram" | "elevenlabs" | "openai" | "xai" | "mistral";

export type WordTiming = {
  word: string;
  start: number;
  end: number;
};

export type TtsResult = {
  audio: ArrayBuffer;
  sampleRate?: number;
  mimeType: string;
  lipSyncGain?: number;
  lipSyncMaxWeight?: number;
  lipSyncPreferMorphTarget?: boolean;
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
  seed?: number;
  languageCode?: string;
  applyTextNormalization?: "auto" | "on" | "off";
};

export type DeepgramTtsConfig = {
  provider: "deepgram";
  credential?: string;
  baseUrl?: string;
  voice?: string;
  model?: string;
};

/** Generic shape shared by all new REST-based TTS providers. */
type RestTtsConfig<P extends TtsProviderId> = {
  provider: P;
  credential?: string;
  baseUrl?: string;
  model?: string;
  voice?: string;
};

export type OpenAiTtsConfig = RestTtsConfig<"openai"> & {
  speed?: number;
  instructions?: string;
  responseFormat?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
};
export type GoogleTtsConfig = RestTtsConfig<"google">;
export type XaiTtsConfig = RestTtsConfig<"xai">;
export type DeepInfraTtsConfig = RestTtsConfig<"deepinfra">;
export type OpenRouterTtsConfig = RestTtsConfig<"openrouter">;
export type InworldTtsConfig = RestTtsConfig<"inworld">;
export type MiniMaxTtsConfig = RestTtsConfig<"minimax"> & {
  speed?: number;
  vol?: number;
  pitch?: number;
};
export type GradiumTtsConfig = RestTtsConfig<"gradium">;
export type VydraTtsConfig = RestTtsConfig<"vydra">;
export type XiaomiTtsConfig = RestTtsConfig<"xiaomi">;
export type AzureSpeechTtsConfig = RestTtsConfig<"azure-speech">;
export type MicrosoftTtsConfig = RestTtsConfig<"microsoft">;
export type VolcengineTtsConfig = RestTtsConfig<"volcengine">;

export type TtsConfig =
  | KokoroTtsConfig
  | ElevenLabsTtsConfig
  | DeepgramTtsConfig
  | OpenAiTtsConfig
  | GoogleTtsConfig
  | XaiTtsConfig
  | DeepInfraTtsConfig
  | OpenRouterTtsConfig
  | InworldTtsConfig
  | MiniMaxTtsConfig
  | GradiumTtsConfig
  | VydraTtsConfig
  | XiaomiTtsConfig
  | AzureSpeechTtsConfig
  | MicrosoftTtsConfig
  | VolcengineTtsConfig;

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
  prompt?: string;
  autoSend?: boolean;
  sampleRate?: number;
  encoding?: string;
  endpointingMs?: number;
  interimResults?: boolean;
};

export type ElevenLabsAsrConfig = {
  provider: "elevenlabs";
  credential?: string;
  baseUrl?: string;
  model?: string;
  language?: string;
  prompt?: string;
  autoSend?: boolean;
  sampleRate?: number;
  encoding?: string;
  endpointingMs?: number;
  interimResults?: boolean;
};

/** Generic shape shared by all new REST-based STT providers. */
type RestAsrConfig<P extends AsrProviderId> = {
  provider: P;
  credential?: string;
  baseUrl?: string;
  model?: string;
  language?: string;
  prompt?: string;
  autoSend?: boolean;
  sampleRate?: number;
  encoding?: string;
  endpointingMs?: number;
  interimResults?: boolean;
};

export type OpenAiAsrConfig = RestAsrConfig<"openai">;
export type XaiAsrConfig = RestAsrConfig<"xai">;
export type MistralAsrConfig = RestAsrConfig<"mistral">;

export type AsrConfig =
  | DistilWhisperAsrConfig
  | DeepgramAsrConfig
  | ElevenLabsAsrConfig
  | OpenAiAsrConfig
  | XaiAsrConfig
  | MistralAsrConfig;

export type AsrResult = {
  text: string;
  language?: string;
  confidence?: number;
};

export type ModelLoadProgress = {
  status: "idle" | "loading" | "ready" | "error";
  /** Omitted for message-only updates (e.g. cache probe status). */
  progress?: number;
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
