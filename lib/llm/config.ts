import { z } from "zod";
import type { BaseProviderConfig } from "./types";

const defaultBaseUrls = {
  "browser-local-gemma": undefined,
  openai: "https://api.openai.com/v1",
  "chatgpt-subscription": "http://127.0.0.1:1455",
  anthropic: "https://api.anthropic.com",
  "claude-subscription": "http://127.0.0.1:1456",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434",
  lmstudio: "http://localhost:1234/v1",
  openclaw: "ws://127.0.0.1:18789"
} satisfies Record<BaseProviderConfig["provider"], string | undefined>;

const defaultEndpointModes = {
  "browser-local-gemma": "native",
  openai: "openai-compatible",
  "chatgpt-subscription": "openai-compatible",
  anthropic: "native",
  "claude-subscription": "openai-compatible",
  openrouter: "openai-compatible",
  ollama: "native",
  lmstudio: "openai-compatible",
  openclaw: "native"
} satisfies Record<BaseProviderConfig["provider"], NonNullable<BaseProviderConfig["endpointMode"]>>;

const liteformsProxyPattern = /(^\/api\/|liteforms\/llm|\/api\/liteforms|\/api\/llm)/i;

export const providerConfigSchema = z
  .object({
    provider: z.enum([
      "browser-local-gemma",
      "openai",
      "chatgpt-subscription",
      "anthropic",
      "claude-subscription",
      "openrouter",
      "ollama",
      "lmstudio",
      "openclaw"
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
    "browser-local-gemma": "Browser local",
    openai: "OpenAI API",
    "chatgpt-subscription": "ChatGPT connector",
    anthropic: "Anthropic API",
    "claude-subscription": "Claude connector",
    openrouter: "OpenRouter",
    ollama: "Ollama",
    lmstudio: "LM Studio",
    openclaw: "OpenClaw Gateway"
  }[provider];
}
