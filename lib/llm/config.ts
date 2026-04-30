import { z } from "zod";
import type { BaseProviderConfig } from "./types";

const defaultBaseUrls = {
  "browser-local-gemma": undefined,
  "browser-local-qwen": undefined,
  openai: "https://api.openai.com/v1",
  "chatgpt-subscription": "http://127.0.0.1:1455",
  anthropic: "https://api.anthropic.com",
  "claude-subscription": "http://127.0.0.1:1456",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434",
  lmstudio: "http://localhost:1234/v1",
  openclaw: "ws://127.0.0.1:18789",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  xai: "https://api.x.ai/v1",
  mistral: "https://api.mistral.ai/v1",
  cerebras: "https://api.cerebras.ai/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
  groq: "https://api.groq.com/openai/v1",
  together: "https://api.together.xyz/v1",
  fireworks: "https://api.fireworks.ai/inference/v1",
  qwen: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
} satisfies Record<BaseProviderConfig["provider"], string | undefined>;

const defaultEndpointModes = {
  "browser-local-gemma": "native",
  "browser-local-qwen": "native",
  openai: "openai-compatible",
  "chatgpt-subscription": "openai-compatible",
  anthropic: "native",
  "claude-subscription": "openai-compatible",
  openrouter: "openai-compatible",
  ollama: "native",
  lmstudio: "openai-compatible",
  openclaw: "native",
  google: "openai-compatible",
  xai: "openai-compatible",
  mistral: "openai-compatible",
  cerebras: "openai-compatible",
  nvidia: "openai-compatible",
  groq: "openai-compatible",
  together: "openai-compatible",
  fireworks: "openai-compatible",
  qwen: "openai-compatible"
} satisfies Record<BaseProviderConfig["provider"], NonNullable<BaseProviderConfig["endpointMode"]>>;

const liteformsProxyPattern = /(^\/api\/|liteforms\/llm|\/api\/liteforms|\/api\/llm)/i;

export const providerConfigSchema = z
  .object({
    provider: z.enum([
      "browser-local-gemma",
      "browser-local-qwen",
      "openai",
      "chatgpt-subscription",
      "anthropic",
      "claude-subscription",
      "openrouter",
      "ollama",
      "lmstudio",
      "openclaw",
      "google",
      "xai",
      "mistral",
      "cerebras",
      "nvidia",
      "groq",
      "together",
      "fireworks",
      "qwen"
    ]),
    model: z.string().trim().min(1),
    credential: z.string().optional(),
    baseUrl: z.string().trim().optional(),
    endpointMode: z.enum(["native", "openai-compatible"]).optional(),
    injectLiteformsPersona: z.boolean().optional()
  })
  .transform((config) => ({
    ...config,
    baseUrl: config.baseUrl ?? defaultBaseUrls[config.provider],
    endpointMode: config.endpointMode ?? defaultEndpointModes[config.provider]
  }))
  .superRefine((config, ctx) => {
    if (config.baseUrl && liteformsProxyPattern.test(config.baseUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MVP LLM requests must not route through a Liteforms proxy server.",
        path: ["baseUrl"]
      });
    }
  });

export function getDefaultProviderConfig(): BaseProviderConfig {
  return {
    provider: "browser-local-gemma",
    model: "onnx-community/gemma-4-E2B-it-ONNX",
    endpointMode: "native"
  };
}

export function normalizeProviderConfig(config: BaseProviderConfig): BaseProviderConfig {
  return providerConfigSchema.parse(config);
}

export function getProviderLabel(provider: BaseProviderConfig["provider"]) {
  return {
    "browser-local-gemma": "Browser local (Gemma)",
    "browser-local-qwen": "Browser local (Qwen)",
    openai: "OpenAI API",
    "chatgpt-subscription": "ChatGPT connector",
    anthropic: "Anthropic API",
    "claude-subscription": "Claude connector",
    openrouter: "OpenRouter",
    ollama: "Ollama",
    lmstudio: "LM Studio",
    openclaw: "OpenClaw Gateway",
    google: "Google AI Studio",
    xai: "xAI (Grok)",
    mistral: "Mistral AI",
    cerebras: "Cerebras",
    nvidia: "NVIDIA",
    groq: "Groq",
    together: "Together AI",
    fireworks: "Fireworks",
    qwen: "Qwen Cloud"
  }[provider];
}
