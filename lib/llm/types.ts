export type LlmProviderId =
  | "browser-local-gemma"
  | "browser-local-qwen"
  | "openai"
  | "chatgpt-subscription"
  | "anthropic"
  | "claude-subscription"
  | "openrouter"
  | "ollama"
  | "lmstudio"
  | "openclaw"
  | "google"
  | "xai"
  | "mistral"
  | "cerebras"
  | "nvidia"
  | "groq"
  | "together"
  | "fireworks"
  | "qwen";

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type CharacterPersona = {
  name: string;
  pronouns: "HE" | "SHE" | "THEY";
  personality: string;
};

export type BaseProviderConfig = {
  provider: LlmProviderId;
  model: string;
  credential?: string;
  baseUrl?: string;
  endpointMode?: "native" | "openai-compatible";
};

export type ChatRequest = {
  config: BaseProviderConfig;
  persona?: CharacterPersona;
  messages: ChatMessage[];
};

export type FetchLike = typeof fetch;

export type LlmAdapter = {
  id: LlmProviderId;
  streamText(request: ChatRequest): AsyncIterable<string>;
};

export type LocalGemmaWorkerRequest = {
  model: string;
  messages: ChatMessage[];
  maxNewTokens?: number;
};

export type ModelLoadProgress = {
  status: "idle" | "loading" | "ready" | "error";
  /** Omitted for message-only updates (e.g. cache probe status). */
  progress?: number;
  message?: string;
};

export type LocalGemmaPreloadRequest = Pick<LocalGemmaWorkerRequest, "model">;

export type LocalGemmaWorkerLike = {
  preload?(request: LocalGemmaPreloadRequest, onProgress?: (progress: ModelLoadProgress) => void): Promise<void>;
  streamText(request: LocalGemmaWorkerRequest): AsyncIterable<string>;
};
