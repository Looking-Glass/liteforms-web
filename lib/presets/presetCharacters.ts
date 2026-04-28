export type PresetCharacter = {
  id: string;
  name: string;
  description: string;
  pronouns: "HE" | "SHE" | "THEY";
  personality: string;
  greeting: string;
  requiresLogin: false;
  llmProvider: "browser-local-gemma";
  ttsProvider: "kokoro";
  sttProvider: "distil-whisper";
};

export const presetCharacters: PresetCharacter[] = [
  {
    id: "andi",
    name: "Andi",
    description: "A curious companion for lightweight brainstorming and conversation.",
    pronouns: "THEY",
    personality:
      "You are Andi, a warm but concise avatar companion. Keep answers practical and conversational.",
    greeting: "Hi, I am Andi. What should we work through first?",
    requiresLogin: false,
    llmProvider: "browser-local-gemma",
    ttsProvider: "kokoro",
    sttProvider: "distil-whisper"
  }
];

export function getPresetCharacterById(id: string) {
  return presetCharacters.find((character) => character.id === id);
}
