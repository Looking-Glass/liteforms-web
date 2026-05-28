import { normalizeProviderConfig } from "./config";
import { LITEFORMS_PROXY_DEFAULT_BASE_URL } from "./liteformsProxy";
import { LocalGemmaWorkerClient } from "./localGemmaWorker";
import { buildChatMessages } from "./persona";
import { parseAnthropicSseLine, parseOllamaJsonLine, parseOpenAiCompatibleSseLine } from "./stream-parsers";
import type { BaseProviderConfig, ChatMessage, ChatRequest, FetchLike, LlmAdapter, LocalGemmaWorkerLike } from "./types";

type CreateAdapterInput = {
  config: BaseProviderConfig;
  fetch?: FetchLike;
  localGemmaWorker?: LocalGemmaWorkerLike;
};

/** Cloud providers whose APIs block direct browser requests due to CORS. */
const CLOUD_PROVIDER_IDS = new Set<string>([
  "liteforms-proxy",
  "openai", "anthropic", "google", "xai", "mistral",
  "cerebras", "nvidia", "openrouter", "groq", "together", "fireworks", "qwen"
]);

export function createLlmAdapter(input: CreateAdapterInput): LlmAdapter {
  const config = normalizeProviderConfig(input.config);
  if (config.provider === "google-live" || config.provider === "openai-realtime") {
    return {
      id: config.provider,
      async *streamText() {
        throw new Error(`${config.provider} uses a realtime voice session instead of the text LLM adapter.`);
      }
    };
  }
  const fetchImpl = input.fetch ?? fetch;
  // When no custom fetch is injected, assume browser context.
  const useProxy = !input.fetch;

  return {
    id: config.provider,
    streamText(request) {
      const normalizedRequest = { ...request, config: normalizeProviderConfig(request.config) };

      if (useProxy && shouldProxyBrowserRequest(normalizedRequest.config.provider)) {
        return streamViaProxy(normalizedRequest, fetchImpl);
      }

      if (normalizedRequest.config.provider === "anthropic") {
        return streamAnthropic(normalizedRequest, fetchImpl);
      }
      if (normalizedRequest.config.provider === "liteforms-proxy") {
        return streamLiteformsProxy(normalizedRequest, fetchImpl);
      }
      if (normalizedRequest.config.provider === "ollama" && normalizedRequest.config.endpointMode !== "openai-compatible") {
        return streamOllama(normalizedRequest, fetchImpl);
      }
      if (
        normalizedRequest.config.provider === "browser-local-gemma" ||
        normalizedRequest.config.provider === "browser-local-qwen"
      ) {
        return streamBrowserLocalGemma(normalizedRequest, input.localGemmaWorker);
      }
      return streamOpenAiCompatible(normalizedRequest, fetchImpl);
    }
  };
}

function shouldProxyBrowserRequest(provider: string) {
  if (CLOUD_PROVIDER_IDS.has(provider)) {
    return true;
  }
  if (provider === "openai-codex" || provider === "claude-cli") {
    return true;
  }
  return provider === "openclaw" && isLocalAppOrigin();
}

function isLocalAppOrigin() {
  const hostname = globalThis.location?.hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

async function* streamViaProxy(request: ChatRequest, fetchImpl: FetchLike): AsyncIterable<string> {
  const response = await fetchImpl("/api/llm/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail.trim() || `LLM proxy request failed with ${response.status}`);
  }
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    yield decoder.decode(value, { stream: true });
  }
}

async function* streamOpenAiCompatible(request: ChatRequest, fetchImpl: FetchLike): AsyncIterable<string> {
  const config = normalizeProviderConfig(request.config);
  const baseUrl = requireBaseUrl(config);
  const messages = buildChatMessages({
    provider: config.provider,
    persona: request.persona,
    messages: request.messages
  });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.credential) {
    headers.Authorization = `Bearer ${config.credential}`;
  }

  const response = await fetchImpl(`${trimTrailingSlash(baseUrl)}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: config.model, messages, stream: true })
  });

  yield* readTextStream(response, parseOpenAiCompatibleSseLine, config);
}

async function* streamLiteformsProxy(request: ChatRequest, fetchImpl: FetchLike): AsyncIterable<string> {
  const config = normalizeProviderConfig(request.config);
  const messages = buildChatMessages({
    provider: config.provider,
    persona: request.persona,
    messages: request.messages
  });

  const response = await fetchImpl(config.baseUrl ?? LITEFORMS_PROXY_DEFAULT_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "X-Slack-No-Retry": "1"
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: 1024,
      stream: true
    })
  });

  yield* readTextStream(response, parseOpenAiCompatibleSseLine, config);
}

async function* streamAnthropic(request: ChatRequest, fetchImpl: FetchLike): AsyncIterable<string> {
  const config = normalizeProviderConfig(request.config);
  const baseUrl = requireBaseUrl(config);
  const messages = buildChatMessages({
    provider: config.provider,
    persona: request.persona,
    messages: request.messages
  });
  const system = messages.find((message) => message.role === "system")?.content;
  const userMessages = messages.filter((message) => message.role !== "system");

  const response = await fetchImpl(`${trimTrailingSlash(baseUrl)}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.credential ?? "",
      "anthropic-version": "2023-06-01",
      // Anthropic's opt-in header allowing server-side and browser direct access
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1024,
      messages: userMessages,
      stream: true,
      ...(system ? { system } : {})
    })
  });

  yield* readTextStream(response, parseAnthropicSseLine, config);
}

async function* streamOllama(request: ChatRequest, fetchImpl: FetchLike): AsyncIterable<string> {
  const config = normalizeProviderConfig(request.config);
  const baseUrl = requireBaseUrl(config);
  const messages = buildChatMessages({
    provider: config.provider,
    persona: request.persona,
    messages: request.messages
  });

  const response = await fetchImpl(`${trimTrailingSlash(baseUrl)}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, messages, stream: true })
  });

  yield* readTextStream(response, parseOllamaJsonLine, config);
}

function streamBrowserLocalGemma(request: ChatRequest, worker: LocalGemmaWorkerLike = new LocalGemmaWorkerClient()): AsyncIterable<string> {
  const messages = buildChatMessages({
    provider: "browser-local-gemma",
    persona: request.persona,
    messages: request.messages
  });
  return worker.streamText({
    model: request.config.model,
    messages,
    maxNewTokens: 256
  });
}

async function* readTextStream(
  response: Response,
  parser: (line: string) => string | null,
  config: BaseProviderConfig
): AsyncIterable<string> {
  if (!response.ok) {
    throw new Error(await formatProviderResponseError(response, config));
  }
  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const chunk = parser(line);
      if (chunk) {
        yield chunk;
      }
    }
  }

  const finalChunk = parser(buffer);
  if (finalChunk) {
    yield finalChunk;
  }
}

async function formatProviderResponseError(response: Response, config: BaseProviderConfig) {
  const detail = await readProviderErrorDetail(response);
  if (config.provider === "liteforms-proxy") {
    return detail
      ? `Liteforms hosted proxy returned ${response.status}: ${detail}`
      : `Liteforms hosted proxy returned ${response.status}.`;
  }
  if (config.provider === "openclaw" && response.status === 404) {
    return [
      "OpenClaw returned 404 for /v1/chat/completions.",
      "Enable gateway.http.endpoints.chatCompletions.enabled in OpenClaw, then restart or reload the Gateway.",
      `Configured endpoint: ${trimTrailingSlash(requireBaseUrl(config))}/chat/completions`
    ].join(" ");
  }
  if (config.provider === "openclaw" && response.status === 401) {
    return [
      "OpenClaw returned 401 for /v1/chat/completions.",
      "Enter the OpenClaw gateway token from gateway.auth.token as the OpenClaw gateway token in Liteforms.",
      `Configured endpoint: ${trimTrailingSlash(requireBaseUrl(config))}/chat/completions`
    ].join(" ");
  }
  return detail ? `LLM provider request failed with ${response.status}: ${detail}` : `LLM provider request failed with ${response.status}`;
}

async function readProviderErrorDetail(response: Response) {
  const body = await response.text().catch(() => "");
  if (!body.trim()) return "";
  try {
    const parsed = JSON.parse(body) as { message?: unknown; error?: unknown };
    if (typeof parsed.message === "string") return parsed.message;
    if (typeof parsed.error === "string") return parsed.error;
    if (
      parsed.error &&
      typeof parsed.error === "object" &&
      "message" in parsed.error &&
      typeof parsed.error.message === "string"
    ) {
      return parsed.error.message;
    }
  } catch {
    // Fall through to the raw body text below.
  }
  return body.trim();
}

export function providerNeedsCredential(config: BaseProviderConfig) {
  return [
    "openai", "openai-realtime", "anthropic", "openrouter", "openclaw",
    "google", "google-live", "xai", "mistral", "cerebras", "nvidia", "groq", "together", "fireworks", "qwen"
  ].includes(config.provider);
}

export function createChatRequest(config: BaseProviderConfig, messages: ChatMessage[], persona?: ChatRequest["persona"]): ChatRequest {
  return { config: normalizeProviderConfig(config), messages, persona };
}

function requireBaseUrl(config: BaseProviderConfig) {
  if (!config.baseUrl) {
    throw new Error(`${config.provider} requires a base URL.`);
  }
  return config.baseUrl;
}

function trimTrailingSlash(input: string) {
  return input.replace(/\/+$/, "");
}
