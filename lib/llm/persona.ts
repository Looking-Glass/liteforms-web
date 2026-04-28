import type { CharacterPersona, ChatMessage, LlmProviderId } from "./types";

type BuildChatMessagesInput = {
  provider: LlmProviderId;
  persona?: CharacterPersona;
  injectLiteformsPersona?: boolean;
  messages: ChatMessage[];
};

export function buildChatMessages(input: BuildChatMessagesInput): ChatMessage[] {
  if (!input.persona || (input.provider === "openclaw" && !input.injectLiteformsPersona)) {
    return input.messages;
  }

  return [
    {
      role: "system",
      content: buildPersonaPrompt(input.persona)
    },
    ...input.messages
  ];
}

export function buildPersonaPrompt(persona: CharacterPersona) {
  return [
    `You are ${persona.name}, a Liteforms avatar companion.`,
    `Pronouns: ${persona.pronouns}.`,
    `Personality and behavior: ${persona.personality}`,
    "Stay in character while answering the user's message directly.",
    "Do not include hidden reasoning, analysis, chain-of-thought, or <think> tags in your response."
  ].join("\n");
}
