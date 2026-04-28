import { normalizeProviderConfig } from "./config";
import { LocalGemmaWorkerClient } from "./localGemmaWorker";
import { buildOpenClawConnectPayload, buildOpenClawSendPayload, buildOpenClawSubscribePayload, parseOpenClawMessage } from "./openclaw";
import { buildChatMessages } from "./persona";
import { parseAnthropicSseLine, parseOllamaJsonLine, parseOpenAiCompatibleSseLine } from "./stream-parsers";
import type { BaseProviderConfig, ChatMessage, ChatRequest, FetchLike, LlmAdapter, LocalGemmaWorkerLike, WebSocketFactory } from "./types";

type CreateAdapterInput = {
  config: BaseProviderConfig;
  fetch?: FetchLike;
  webSocketFactory?: WebSocketFactory;
  localGemmaWorker?: LocalGemmaWorkerLike;
};

export function createLlmAdapter(input: CreateAdapterInput): LlmAdapter {
  const config = normalizeProviderConfig(input.config);
  const fetchImpl = input.fetch ?? fetch;

  if (config.provider === "openclaw") {
    return createOpenClawAdapter(config, input.webSocketFactory);
  }

  return {
    id: config.provider,
    streamText(request) {
      const normalizedRequest = { ...request, config: normalizeProviderConfig(request.config) };
      if (normalizedRequest.config.provider === "anthropic") {
        return streamAnthropic(normalizedRequest, fetchImpl);
      }
      if (normalizedRequest.config.provider === "ollama" && normalizedRequest.config.endpointMode !== "openai-compatible") {
        return streamOllama(normalizedRequest, fetchImpl);
      }
      if (normalizedRequest.config.provider === "browser-local-gemma") {
        return streamBrowserLocalGemma(normalizedRequest, input.localGemmaWorker);
      }
      return streamOpenAiCompatible(normalizedRequest, fetchImpl);
    }
  };
}

async function* streamOpenAiCompatible(request: ChatRequest, fetchImpl: FetchLike): AsyncIterable<string> {
  const config = normalizeProviderConfig(request.config);
  const baseUrl = requireBaseUrl(config);
  const messages = buildChatMessages({
    provider: config.provider,
    persona: request.persona,
    injectLiteformsPersona: config.injectLiteformsPersona,
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

  yield* readTextStream(response, parseOpenAiCompatibleSseLine);
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
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1024,
      messages: userMessages,
      stream: true,
      ...(system ? { system } : {})
    })
  });

  yield* readTextStream(response, parseAnthropicSseLine);
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

  yield* readTextStream(response, parseOllamaJsonLine);
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

function createOpenClawAdapter(config: BaseProviderConfig, webSocketFactory?: WebSocketFactory): LlmAdapter {
  return {
    id: "openclaw",
    async *streamText(request: ChatRequest): AsyncIterable<string> {
      const socketFactory = webSocketFactory ?? ((url) => new WebSocket(url));
      const socket = socketFactory(requireBaseUrl(config));
      const messages = buildChatMessages({
        provider: "openclaw",
        persona: request.persona,
        injectLiteformsPersona: request.config.injectLiteformsPersona,
        messages: request.messages
      });

      const queue: string[] = [];
      let done = false;
      let opened = false;

      socket.addEventListener("open", () => {
        opened = true;
        socket.send(JSON.stringify(buildOpenClawConnectPayload({ token: request.config.credential })));
        socket.send(JSON.stringify(buildOpenClawSubscribePayload()));
        socket.send(JSON.stringify(buildOpenClawSendPayload({ model: request.config.model, messages })));
      });
      socket.addEventListener("message", (event) => {
        const parsed = parseOpenClawMessage(safeJson(String((event as MessageEvent).data)));
        if (parsed?.type === "delta") {
          queue.push(parsed.text);
        }
        if (parsed?.type === "done") {
          done = true;
        }
      });
      socket.addEventListener("close", () => {
        done = true;
      });

      while (!done || queue.length > 0 || !opened) {
        while (queue.length > 0) {
          yield queue.shift() ?? "";
        }
        if (!done) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      socket.close();
    }
  };
}

async function* readTextStream(response: Response, parser: (line: string) => string | null): AsyncIterable<string> {
  if (!response.ok) {
    throw new Error(`LLM provider request failed with ${response.status}`);
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

export function providerNeedsCredential(config: BaseProviderConfig) {
  return [
    "openai", "chatgpt-subscription", "anthropic", "claude-subscription", "openrouter", "openclaw",
    "google", "xai", "mistral", "cerebras", "nvidia", "groq", "together", "fireworks", "qwen"
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

function safeJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}
