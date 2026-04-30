import type { LlmProviderId } from "./types";

export type ProviderModelOption = { id: string; label: string };

export type LlmProviderOption = {
  id: LlmProviderId;
  label: string;
  defaultModel: string;
  defaultBaseUrl?: string;
  /** Known model list. When present a <select> dropdown is rendered; otherwise a free-text <input>. */
  models?: ProviderModelOption[];
};

export const LLM_PROVIDER_OPTIONS: LlmProviderOption[] = [
  {
    id: "anthropic",
    label: "Anthropic API",
    defaultModel: "claude-opus-4-7",
    defaultBaseUrl: "https://api.anthropic.com",
    models: [
      { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
      { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
      { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
      { id: "claude-haiku-3-5", label: "Claude Haiku 3.5" }
    ]
  },
  {
    id: "openai",
    label: "OpenAI API",
    defaultModel: "gpt-5.5",
    defaultBaseUrl: "https://api.openai.com/v1",
    models: [
      { id: "gpt-5.5", label: "GPT-5.5" },
      { id: "gpt-5.5-pro", label: "GPT-5.5 Pro" },
      { id: "gpt-5.4", label: "GPT-5.4" },
      { id: "gpt-5.4-pro", label: "GPT-5.4 Pro" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 mini" },
      { id: "gpt-5.4-nano", label: "GPT-5.4 nano" }
    ]
  },
  {
    id: "chatgpt-subscription",
    label: "ChatGPT connector",
    defaultModel: "gpt-5.5",
    defaultBaseUrl: "http://127.0.0.1:1455",
    models: [
      { id: "gpt-5.5", label: "GPT-5.5" },
      { id: "gpt-5.5-pro", label: "GPT-5.5 Pro" },
      { id: "gpt-5.4", label: "GPT-5.4" },
      { id: "gpt-5.4-pro", label: "GPT-5.4 Pro" }
    ]
  },
  {
    id: "claude-subscription",
    label: "Claude connector",
    defaultModel: "claude-opus-4-7",
    defaultBaseUrl: "http://127.0.0.1:1456",
    models: [
      { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
      { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" }
    ]
  },
  {
    id: "google",
    label: "Google AI Studio",
    defaultModel: "gemini-3.1-pro-preview",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: [
      { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
      { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite" },
      { id: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
      { id: "gemini-3-pro-preview", label: "Gemini 3 Pro" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
      { id: "gemini-pro-latest", label: "Gemini Pro (latest)" },
      { id: "gemini-flash-latest", label: "Gemini Flash (latest)" }
    ]
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    defaultModel: "grok-4",
    defaultBaseUrl: "https://api.x.ai/v1",
    models: [
      { id: "grok-4", label: "Grok 4" },
      { id: "grok-4-fast", label: "Grok 4 Fast" },
      { id: "grok-4-1-fast", label: "Grok 4.1 Fast" },
      { id: "grok-4.20-beta-latest-reasoning", label: "Grok 4.20 Beta (Reasoning)" },
      { id: "grok-4.20-beta-latest-non-reasoning", label: "Grok 4.20 Beta" },
      { id: "grok-3", label: "Grok 3" },
      { id: "grok-3-fast", label: "Grok 3 Fast" },
      { id: "grok-3-mini", label: "Grok 3 Mini" }
    ]
  },
  {
    id: "mistral",
    label: "Mistral AI",
    defaultModel: "mistral-large-latest",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    models: [
      { id: "mistral-large-latest", label: "Mistral Large" },
      { id: "mistral-medium-2508", label: "Mistral Medium 3.1" },
      { id: "mistral-small-latest", label: "Mistral Small" },
      { id: "magistral-small", label: "Magistral Small" },
      { id: "codestral-latest", label: "Codestral" },
      { id: "devstral-medium-latest", label: "Devstral 2" },
      { id: "pixtral-large-latest", label: "Pixtral Large" }
    ]
  },
  {
    id: "cerebras",
    label: "Cerebras",
    defaultModel: "gpt-oss-120b",
    defaultBaseUrl: "https://api.cerebras.ai/v1",
    models: [
      { id: "gpt-oss-120b", label: "GPT OSS 120B" },
      { id: "zai-glm-4.7", label: "Z.ai GLM 4.7" },
      { id: "qwen-3-235b-a22b-instruct-2507", label: "Qwen 3 235B" },
      { id: "llama3.1-8b", label: "Llama 3.1 8B" }
    ]
  },
  {
    id: "nvidia",
    label: "NVIDIA",
    defaultModel: "nvidia/nemotron-3-super-120b-a12b",
    defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
    models: [
      { id: "nvidia/nemotron-3-super-120b-a12b", label: "Nemotron 3 Super 120B" },
      { id: "moonshotai/kimi-k2.5", label: "Kimi K2.5" },
      { id: "minimaxai/minimax-m2.5", label: "MiniMax M2.5" },
      { id: "z-ai/glm5", label: "GLM-5" }
    ]
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultModel: "openai/gpt-5.5",
    defaultBaseUrl: "https://openrouter.ai/api/v1"
    // No static model list — OpenRouter is a gateway to thousands of models
  },
  {
    id: "groq",
    label: "Groq",
    defaultModel: "llama-3.3-70b-versatile",
    defaultBaseUrl: "https://api.groq.com/openai/v1"
    // No static model list — Groq models are fetched dynamically from the API
  },
  {
    id: "together",
    label: "Together AI",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    defaultBaseUrl: "https://api.together.xyz/v1"
    // No static model list — Together AI hosts hundreds of open models
  },
  {
    id: "fireworks",
    label: "Fireworks",
    defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    defaultBaseUrl: "https://api.fireworks.ai/inference/v1"
    // No static model list — Fireworks hosts hundreds of open models
  },
  {
    id: "qwen",
    label: "Qwen Cloud",
    defaultModel: "qwen-plus",
    defaultBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    // No static model list — Qwen model availability varies by plan/region
  },
  {
    id: "ollama",
    label: "Ollama",
    defaultModel: "llama3.2",
    defaultBaseUrl: "http://localhost:11434"
    // No static model list — models are installed locally
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    defaultModel: "local-model",
    defaultBaseUrl: "http://localhost:1234/v1"
    // No static model list — models are loaded locally in LM Studio
  },
  {
    id: "openclaw",
    label: "OpenClaw Gateway",
    defaultModel: "default",
    defaultBaseUrl: "ws://127.0.0.1:18789"
    // No static model list — OpenClaw routes to whichever provider is configured
  },
  {
    id: "browser-local-qwen",
    label: "Qwen 3.5 0.8B (local)",
    defaultModel: "onnx-community/Qwen3.5-0.8B-ONNX",
    models: [{ id: "onnx-community/Qwen3.5-0.8B-ONNX", label: "Qwen 3.5 0.8B (browser)" }]
  },
  {
    id: "browser-local-gemma",
    label: "Gemma 4 E2B (local)",
    defaultModel: "onnx-community/gemma-4-E2B-it-ONNX",
    models: [{ id: "onnx-community/gemma-4-E2B-it-ONNX", label: "Gemma 4 E2B (browser)" }]
  }
];

/** Provider IDs that require an API key or credential. */
export const CREDENTIAL_PROVIDER_IDS: LlmProviderId[] = [
  "openai",
  "chatgpt-subscription",
  "anthropic",
  "claude-subscription",
  "google",
  "xai",
  "mistral",
  "cerebras",
  "nvidia",
  "openrouter",
  "groq",
  "together",
  "fireworks",
  "qwen",
  "openclaw"
];
