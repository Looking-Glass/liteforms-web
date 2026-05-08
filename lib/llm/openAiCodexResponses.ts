import { normalizeProviderConfig } from "./config";
import { getOpenAiCodexAccessToken, getOpenAiCodexAuthStore, setOpenAiCodexCredential } from "./openAiCodexAuthStore";
import { refreshOpenAiCodexCredential } from "./openAiCodexDeviceAuth";
import { buildChatMessages } from "./persona";
import type { ChatMessage, ChatRequest, FetchLike } from "./types";

export const OPENAI_CODEX_RESPONSES_BASE_URL = "https://chatgpt.com/backend-api/codex";

type ResponsesInputMessage = {
  role: "user" | "assistant";
  content: string;
};

export function buildOpenAiCodexResponsesPayload(request: ChatRequest) {
  const config = normalizeProviderConfig(request.config);
  const messages = buildChatMessages({
    provider: config.provider,
    persona: request.persona,
    messages: request.messages
  });
  const instructions = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n") || undefined;

  return {
    model: config.model,
    input: messages.filter(isResponsesInputMessage).map(toResponsesInputMessage),
    stream: true,
    store: false,
    ...(instructions ? { instructions } : {})
  };
}

export async function* streamOpenAiCodexResponsesText(
  request: ChatRequest,
  fetchImpl: FetchLike = fetch
): AsyncIterable<string> {
  const accessToken = await resolveOpenAiCodexAccessToken(fetchImpl);
  if (!accessToken) {
    throw new Error("OpenAI Codex is not signed in. Use Sign in with ChatGPT, then Check sign-in.");
  }

  const response = await fetchImpl(`${OPENAI_CODEX_RESPONSES_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(buildOpenAiCodexResponsesPayload(request))
  });

  if (!response.ok) {
    throw new Error(await formatOpenAiCodexResponsesError(response));
  }
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const chunk = parseOpenAiResponsesSseLine(line);
      if (chunk) yield chunk;
    }
  }

  const finalChunk = parseOpenAiResponsesSseLine(buffer);
  if (finalChunk) yield finalChunk;
}

async function resolveOpenAiCodexAccessToken(fetchImpl: FetchLike) {
  const currentToken = getOpenAiCodexAccessToken();
  if (currentToken) return currentToken;

  const credential = getOpenAiCodexAuthStore().credential;
  if (!credential?.refresh) return undefined;

  const refreshed = await refreshOpenAiCodexCredential(credential.refresh, fetchImpl);
  setOpenAiCodexCredential(refreshed);
  return refreshed.access;
}

export function parseOpenAiResponsesSseLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") return null;

  const parsed = safeJson(payload);
  if (!parsed || typeof parsed !== "object") return null;

  const delta = (parsed as { delta?: unknown }).delta;
  if (
    ((parsed as { type?: unknown }).type === "response.output_text.delta" ||
      (parsed as { type?: unknown }).type === "response.refusal.delta") &&
    typeof delta === "string"
  ) {
    return delta;
  }

  const outputText = (parsed as { output_text?: unknown }).output_text;
  return typeof outputText === "string" ? outputText : null;
}

async function formatOpenAiCodexResponsesError(response: Response) {
  const bodyText = await response.text().catch(() => "");
  const body = safeJson(bodyText);
  const message =
    body && typeof body === "object" && typeof (body as { error?: { message?: unknown } }).error?.message === "string"
      ? (body as { error: { message: string } }).error.message
      : bodyText.trim();
  return message
    ? `OpenAI Codex Responses request failed with ${response.status}: ${message}`
    : `OpenAI Codex Responses request failed with ${response.status}`;
}

function isResponsesInputMessage(message: ChatMessage): message is ChatMessage & { role: "user" | "assistant" } {
  return message.role === "user" || message.role === "assistant";
}

function toResponsesInputMessage(message: ChatMessage & { role: "user" | "assistant" }): ResponsesInputMessage {
  return {
    role: message.role,
    content: message.content
  };
}

function safeJson(input: string) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}
