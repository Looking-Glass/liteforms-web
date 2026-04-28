import type { ChatMessage } from "./types";

type JsonRpcPayload = {
  id?: number;
  method: string;
  params?: Record<string, unknown>;
};

export function buildOpenClawConnectPayload({ token }: { token?: string } = {}): JsonRpcPayload {
  return {
    id: 1,
    method: "connect",
    params: {
      role: "operator",
      scopes: ["chat:send", "sessions:read"],
      ...(token ? { token } : {})
    }
  };
}

export function buildOpenClawSubscribePayload(sessionKey = "liteforms:web"): JsonRpcPayload {
  return {
    id: 2,
    method: "sessions.messages.subscribe",
    params: { sessionKey }
  };
}

export function buildOpenClawSendPayload({
  model,
  messages,
  sessionKey = "liteforms:web"
}: {
  model: string;
  messages: ChatMessage[];
  sessionKey?: string;
}): JsonRpcPayload {
  return {
    id: 3,
    method: "chat.send",
    params: {
      sessionKey,
      model,
      messages
    }
  };
}

export function parseOpenClawMessage(message: unknown): { type: "delta"; text: string } | { type: "done" } | null {
  if (!message || typeof message !== "object") {
    return null;
  }

  const payload = message as { method?: string; params?: { delta?: unknown; text?: unknown; done?: unknown } };
  if (payload.method !== "session.message") {
    return null;
  }

  if (payload.params?.done === true) {
    return { type: "done" };
  }

  const text = payload.params?.delta ?? payload.params?.text;
  return typeof text === "string" ? { type: "delta", text } : null;
}
