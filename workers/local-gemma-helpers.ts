import type { ChatMessage } from "@/lib/llm";
import { sanitizeAssistantText } from "../lib/llm/output";

export function getLocalModelRuntimeOptions(model: string) {
  return {
    device: "webgpu",
    dtype: model.toLowerCase().includes("gemma-4") ? "q4f16" : "q8"
  } as const;
}

export function formatPromptMessages(messages: ChatMessage[]) {
  return messages;
}

export function formatGemma4Messages(messages: string | ChatMessage[]) {
  if (typeof messages === "string") {
    return [{ role: "user", content: messages }];
  }
  return messages.map((message) => ({
    role: message.role,
    content: message.content
  }));
}

export function extractGeneratedText(output: unknown): string {
  if (Array.isArray(output)) {
    return sanitizeAssistantText(output.map(extractGeneratedText).join(""));
  }
  if (output && typeof output === "object" && "generated_text" in output) {
    const text = (output as { generated_text?: unknown }).generated_text;
    if (typeof text === "string") {
      return sanitizeAssistantText(text);
    }
    if (Array.isArray(text)) {
      const lastAssistant = [...text]
        .reverse()
        .find((item): item is { role?: unknown; content?: unknown } => Boolean(item) && typeof item === "object" && "content" in item);
      return typeof lastAssistant?.content === "string" ? sanitizeAssistantText(lastAssistant.content) : "";
    }
    return "";
  }
  return typeof output === "string" ? sanitizeAssistantText(output) : "";
}
